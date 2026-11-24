import { BadGatewayException, BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { listen, recordingType, speak, spokenSeconds, VoiceError, voiceSettings } from "./elevenlabs-client.js";
import { buildFamilyAiContext, familyAiSchema, familyVoiceSystem, type VoiceTurn } from "./family-ai-context.js";
import { provider } from "./family-ai.service.js";
import { FamilyBaseService } from "./family-base.service.js";
import type { FamilyVoiceReplyDto, FamilyVoiceStatusDto } from "./family-voice.dto.js";
import { askGemini, GeminiError } from "./gemini-client.js";

/** Raise this whenever the voice notice changes on web and Android, so every member is asked again. */
const noticeVersion = 1;
const limits = { member: 900, family: 1800, turn: 90 };
export const maxRecordingBytes = 2 * 1048576;
type StatusRow = { enabled: boolean; canManage: boolean; consented: boolean; memberUsed: number; familyUsed: number; timeZone: string };

@Injectable()
export class FamilyVoiceService {
  private readonly logger = new Logger(FamilyVoiceService.name);
  constructor(private readonly database: DatabaseService, private readonly familyBase: FamilyBaseService) {}

  private async run<T>(actor: string, work: (client: PoolClient) => Promise<T>) {
    try { return await this.database.withActor(actor, work); } catch (error) {
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
      from app.family_voice_status($1, $2)`, [familyId, noticeVersion]);
    if (!row) throw new NotFoundException("Family workspace not found.");
    return row;
  }
  private toStatus(row: StatusRow): FamilyVoiceStatusDto {
    return {
      available: provider() !== null && voiceSettings(process.env) !== null, enabled: row.enabled, canManage: row.canManage, consented: row.consented,
      remainingSeconds: Math.max(0, Math.min(limits.member - row.memberUsed, limits.family - row.familyUsed)),
    };
  }

  status(actor: string, familyId: string) { return this.run(actor, async (client) => this.toStatus(await this.row(client, familyId))); }
  setEnabled(actor: string, familyId: string, enabled: boolean) {
    return this.run(actor, async (client) => { await client.query("select app.set_family_voice($1, $2)", [familyId, enabled]); return this.toStatus(await this.row(client, familyId)); });
  }
  setConsent(actor: string, familyId: string, accepted: boolean) {
    return this.run(actor, async (client) => { await client.query("select app.set_family_voice_consent($1, $2, $3)", [familyId, accepted, noticeVersion]); return this.toStatus(await this.row(client, familyId)); });
  }

  async talk(actor: string, familyId: string, audio: Buffer, turns: VoiceTurn[]): Promise<FamilyVoiceReplyDto> {
    const ai = provider(), voice = voiceSettings(process.env);
    if (!ai || !voice) throw new ServiceUnavailableException("Voice isn’t set up on this server yet.");
    const type = recordingType(audio);
    if (!type) throw new BadRequestException("This recording can’t be used. Try again.");
    const claim = await this.run(actor, async (client) => {
      const { rows: [claimed] } = await client.query<{ id: string }>("select app.claim_family_voice($1, $2, $3, $4, $5) as id", [familyId, noticeVersion, limits.turn, limits.member, limits.family]);
      return { id: claimed.id, row: await this.row(client, familyId) };
    });
    // Seconds used so far: nothing until the service has worked, then what it reports.
    let used = 0;
    try {
      const words = await listen(voice, audio, type);
      used = Math.ceil(words.seconds ?? 10);
      if (words.text.length < 2) throw new HttpException("I didn’t catch that. Try again a little closer to the microphone.", 422);
      // The graph is read as the speaker, so nothing they cannot open is ever sent. No transaction stays open during a call.
      const graph = await this.familyBase.graph(actor, familyId);
      const context = buildFamilyAiContext(graph, words.text, claim.row.timeZone, new Date(), turns);
      const reply = await askGemini({ ...ai, system: familyVoiceSystem, text: context.text, schema: familyAiSchema });
      // An answer that cannot be spoken is still shown.
      const sound = await speak(voice, reply.answer.slice(0, 1200)).catch((error: unknown) => {
        this.logger.warn("A voice answer could not be spoken" + (error instanceof VoiceError && error.status ? " (" + error.status + ")" : "") + ".");
        return null;
      });
      if (sound) used += spokenSeconds(sound);
      await this.settle(actor, claim.id, used);
      const status = await this.status(actor, familyId);
      return { heard: words.text, answer: reply.answer, nodeIds: context.resolve(reply.records), audio: sound?.toString("base64") ?? null, remainingSeconds: status.remainingSeconds };
    } catch (error) {
      await this.settle(actor, claim.id, error instanceof VoiceError && error.kind === "refused" ? 0 : used);
      // Never log the recording, the words, the records or the reply.
      if (error instanceof VoiceError) {
        this.logger.warn("A voice turn was not heard: " + error.kind + (error.status ? " (" + error.status + ")" : ""));
        if (error.kind === "refused") throw new ServiceUnavailableException("The voice service isn’t available right now. This wasn’t counted.");
        throw new BadGatewayException("The voice service didn’t answer. Try again.");
      }
      if (error instanceof GeminiError) {
        this.logger.warn("A voice question was not answered: " + error.kind + (error.status ? " (" + error.status + ")" : ""));
        if (error.kind === "blocked") throw new HttpException("I can’t help with that one. Try asking it differently.", 422);
        throw new ServiceUnavailableException("The AI service isn’t available right now. Try again.");
      }
      throw error;
    }
  }

  private async settle(actor: string, id: string, seconds: number) {
    try { await this.database.withActor(actor, (client) => client.query("select app.settle_family_voice($1, $2)", [id, seconds])); }
    catch { this.logger.warn("Voice time could not be recorded exactly."); }
  }
}
