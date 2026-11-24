import {
  BadGatewayException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { buildFamilyAiContext, familyAiSchema, familyAiSystem } from "./family-ai-context.js";
import type { FamilyAiAnswerDto, FamilyAiStatusDto } from "./family-ai.dto.js";
import { FamilyBaseService } from "./family-base.service.js";
import { askGemini, GeminiError } from "./gemini-client.js";

/** Raise this whenever the notice in the web app changes, so every member is asked again. */
const noticeVersion = 1;
const limits = { member: 20, family: 60 };
type StatusRow = { enabled: boolean; canManage: boolean; consented: boolean; memberUsed: number; familyUsed: number; timeZone: string };

/** FAMILY_AI_ENABLED is the operator's confirmation in docs/family-base-ai.md; a key alone does not switch questions on. */
function provider() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.FAMILY_AI_ENABLED !== "true") return null;
  return {
    apiKey, model: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    baseUrl: process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com",
  };
}

@Injectable()
export class FamilyAiService {
  private readonly logger = new Logger(FamilyAiService.name);
  constructor(private readonly database: DatabaseService, private readonly familyBase: FamilyBaseService) {}

  private async run<T>(actor: string, work: (client: PoolClient) => Promise<T>) {
    try {
      return await this.database.withActor(actor, work);
    } catch (error) {
      const { code, message } = error as { code?: string; message: string };
      if (code === "P0002") throw new NotFoundException("Family workspace not found.");
      if (code === "42501") throw new ForbiddenException(message === "Owner required" ? "Only the family owner can change this." : message);
      if (code === "53400") throw new HttpException(message, 429);
      throw error;
    }
  }

  private async row(client: PoolClient, familyId: string) {
    const { rows: [row] } = await client.query<StatusRow>(`
      select enabled, can_manage as "canManage", consented, member_used as "memberUsed", family_used as "familyUsed", time_zone as "timeZone"
      from app.family_ai_status($1, $2)`, [familyId, noticeVersion]);
    if (!row) throw new NotFoundException("Family workspace not found.");
    return row;
  }

  private toStatus(row: StatusRow): FamilyAiStatusDto {
    return {
      available: provider() !== null, enabled: row.enabled, canManage: row.canManage, consented: row.consented,
      remaining: Math.max(0, Math.min(limits.member - row.memberUsed, limits.family - row.familyUsed)),
    };
  }

  status(actor: string, familyId: string) {
    return this.run(actor, async (client) => this.toStatus(await this.row(client, familyId)));
  }

  setEnabled(actor: string, familyId: string, enabled: boolean) {
    return this.run(actor, async (client) => {
      await client.query("select app.set_family_ai($1, $2)", [familyId, enabled]);
      return this.toStatus(await this.row(client, familyId));
    });
  }

  setConsent(actor: string, familyId: string, accepted: boolean) {
    return this.run(actor, async (client) => {
      await client.query("select app.set_family_ai_consent($1, $2, $3)", [familyId, accepted, noticeVersion]);
      return this.toStatus(await this.row(client, familyId));
    });
  }

  async ask(actor: string, familyId: string, question: string): Promise<FamilyAiAnswerDto> {
    const settings = provider();
    if (!settings) throw new ServiceUnavailableException("Questions aren’t set up on this server yet.");
    const claim = await this.run(actor, async (client) => {
      const { rows: [claimed] } = await client.query<{ id: string }>(
        "select app.claim_family_ai_question($1, $2, $3, $4) as id", [familyId, noticeVersion, limits.member, limits.family]);
      return { id: claimed.id, row: await this.row(client, familyId) };
    });
    try {
      // The graph is read as the asker, so nothing they cannot open is ever sent. No transaction stays open during the call.
      const graph = await this.familyBase.graph(actor, familyId);
      const context = buildFamilyAiContext(graph, question, claim.row.timeZone);
      const reply = await askGemini({ ...settings, system: familyAiSystem, text: context.text, schema: familyAiSchema });
      return { answer: reply.answer, nodeIds: context.resolve(reply.records), remaining: this.toStatus(claim.row).remaining };
    } catch (error) {
      if (!(error instanceof GeminiError) || error.kind === "refused") await this.release(actor, claim.id);
      if (!(error instanceof GeminiError)) throw error;
      // Never log the question, the records or the reply.
      this.logger.warn("Family question was not answered: " + error.kind + (error.status ? " (" + error.status + ")" : ""));
      if (error.kind === "blocked") throw new HttpException("The AI service couldn’t answer that question. Try wording it differently.", 422);
      if (error.kind === "refused") throw new ServiceUnavailableException("The AI service isn’t available right now. This question wasn’t counted.");
      throw new BadGatewayException("The AI service didn’t answer. Try again.");
    }
  }

  private async release(actor: string, id: string) {
    try {
      await this.database.withActor(actor, (client) => client.query("select app.release_family_ai_question($1)", [id]));
    } catch {
      this.logger.warn("A family question could not be given back.");
    }
  }
}
