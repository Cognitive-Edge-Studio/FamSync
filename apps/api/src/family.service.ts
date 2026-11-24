import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { familyTimeZone } from "./family-time-zone.js";
import type { FamilyDto, FamilyInputDto, FamilyMemberDto, InvitationDto } from "./family.dto.js";
import { invitationToken, tokenDigest } from "./invitation-token.js";
import { JobsService } from "./jobs.service.js";

const families = `
  select f.id, f.name, f.time_zone as "timeZone", m.role,
    -- The family joined first. Joining or renaming a family never changes it; losing access moves to the next.
    not exists (select 1 from app.family_memberships earlier where earlier.user_id = app.actor_id()
      and (earlier.joined_at, earlier.family_id) < (m.joined_at, m.family_id)) as "isDefault"
  from app.families f
  join app.family_memberships m on m.family_id = f.id and m.user_id = app.actor_id()
`;

const invitationFields = `
  id, email, expires_at as "expiresAt", delivery_status as "deliveryStatus",
  case when accepted_at is not null then 'accepted'
       when revoked_at is not null then 'revoked'
       when expires_at <= clock_timestamp() then 'expired'
       else 'pending' end as status
`;

type InvitationAttempt = InvitationDto & { attempt: string };

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function rejectSecondFamily(error: unknown) {
  if ((error as { code?: string }).code === "FS001") {
    throw new ConflictException("Your account already belongs to a family. Each account can have one family.");
  }
}

@Injectable()
export class FamilyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jobs: JobsService,
  ) {}

  list(actor: string) {
    return this.database.withActor(actor, async (client) => {
      const { rows } = await client.query<FamilyDto>(families + " order by f.name, f.id");
      return rows.map((family) => ({ ...family, timeZone: familyTimeZone(family.timeZone) }));
    });
  }

  get(actor: string, familyId: string) {
    return this.database.withActor(actor, (client) => this.find(client, familyId));
  }

  async create(actor: string, input: FamilyInputDto) {
    try {
      return await this.database.withActor(actor, async (client) => {
        const { rows: [{ id }] } = await client.query<{ id: string }>(
          "select app.create_family($1, $2) as id", [input.name, input.timeZone],
        );
        return this.find(client, id);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "22023") throw new BadRequestException("Choose a valid time zone.");
      rejectSecondFamily(error);
      throw error;
    }
  }

  updateSettings(actor: string, familyId: string, input: FamilyInputDto) {
    return this.familyWrite(actor, async (client) => {
      await client.query("select app.update_family_settings($1, $2, $3)", [familyId, input.name, input.timeZone]);
      return this.find(client, familyId);
    }, "Choose a valid time zone.");
  }

  listMembers(actor: string, familyId: string) {
    return this.database.withActor(actor, async (client) => {
      const { rows } = await client.query<FamilyMemberDto>(`
        select user_id as "userId", first_name as "firstName", last_name as "lastName", email, role
        from app.list_family_members($1)
      `, [familyId]);
      if (!rows.length) throw new NotFoundException("Family workspace not found.");
      return rows;
    });
  }

  transferOwnership(actor: string, familyId: string, memberId: string) {
    return this.familyWrite(actor, async (client) => {
      await client.query("select app.transfer_family_ownership($1, $2)", [familyId, memberId]);
      return this.find(client, familyId);
    }, "Choose another member to transfer ownership.");
  }

  removeMember(actor: string, familyId: string, memberId: string) {
    return this.familyWrite(actor, async (client) => {
      await client.query("select app.remove_family_member($1, $2)", [familyId, memberId]);
    }, "Transfer ownership before removing the owner.");
  }

  listInvitations(actor: string, familyId: string) {
    return this.database.withActor(actor, async (client) => {
      await this.requireOwner(client, familyId);
      const { rows } = await client.query<InvitationDto>(
        `select ${invitationFields} from app.family_invitations where family_id = $1 order by created_at desc, id`,
        [familyId],
      );
      return rows;
    });
  }

  // The email is queued in the same transaction and sent by the job runner, which retries failures.
  async invite(actor: string, familyId: string, email: string) {
    const attempt = randomUUID();
    const invitation = await this.familyWrite(actor, async (client) => {
      await client.query("select app.lock_family_for_owner($1)", [familyId]);
      await this.find(client, familyId);
      const { rows: [invitation] } = await client.query<InvitationAttempt>(`
        insert into app.family_invitations (family_id, email, token_digest, invited_by, delivery_attempt)
        values ($1, $2, $3, $4, $5)
        on conflict (family_id, email) where accepted_at is null and revoked_at is null do nothing
        returning ${invitationFields}, delivery_attempt as attempt
      `, [familyId, email, tokenDigest(invitationToken(attempt)), actor, attempt]);
      if (!invitation) throw new ConflictException("An open invitation already exists for this email. Resend it from the list.");
      await this.queueEmail(client, familyId, invitation);
      return invitation;
    });
    await this.jobs.notify();
    return this.withoutAttempt(invitation);
  }

  // A resend starts a new attempt, which invalidates the previous link and its queued email.
  async resend(actor: string, familyId: string, invitationId: string) {
    const attempt = randomUUID();
    const invitation = await this.familyWrite(actor, async (client) => {
      await client.query("select app.lock_family_for_owner($1)", [familyId]);
      await this.find(client, familyId);
      const { rows: [invitation] } = await client.query<InvitationAttempt>(`
        update app.family_invitations
        set token_digest = $3, expires_at = clock_timestamp() + interval '7 days',
            delivery_status = 'pending', delivery_attempt = $4
        where family_id = $1 and id = $2 and accepted_at is null and revoked_at is null
        returning ${invitationFields}, delivery_attempt as attempt
      `, [familyId, invitationId, tokenDigest(invitationToken(attempt)), attempt]);
      if (!invitation) throw new NotFoundException("This invitation can no longer be resent.");
      await this.queueEmail(client, familyId, invitation);
      return invitation;
    });
    await this.jobs.notify();
    return this.withoutAttempt(invitation);
  }

  revoke(actor: string, familyId: string, invitationId: string) {
    return this.familyWrite(actor, async (client) => {
      await client.query("select app.lock_family_for_owner($1)", [familyId]);
      const { rows: [invitation] } = await client.query<InvitationDto>(`
        update app.family_invitations set revoked_at = coalesce(revoked_at, clock_timestamp())
        where family_id = $1 and id = $2 and accepted_at is null
        returning ${invitationFields}
      `, [familyId, invitationId]);
      if (!invitation) throw new NotFoundException("This invitation can no longer be revoked.");
      return invitation;
    });
  }

  async accept(actor: string, token: string) {
    try {
      return await this.database.withActor(actor, async (client) => {
        const { rows: [{ id }] } = await client.query<{ id: string | null }>(
          "select app.accept_family_invitation($1) as id", [digest(token)],
        );
        if (!id) throw new NotFoundException("This invitation is unavailable for your account.");
        return this.find(client, id);
      });
    } catch (error) {
      rejectSecondFamily(error);
      throw error;
    }
  }

  private async find(client: PoolClient, familyId: string) {
    const { rows: [family] } = await client.query<FamilyDto>(families + " where f.id = $1", [familyId]);
    if (!family) throw new NotFoundException("Family workspace not found.");
    return { ...family, timeZone: familyTimeZone(family.timeZone) };
  }

  private async requireOwner(client: PoolClient, familyId: string) {
    const family = await this.find(client, familyId);
    if (family.role !== "owner") throw new ForbiddenException("Only the family owner can manage invitations.");
    return family;
  }

  private async familyWrite<T>(actor: string, write: (client: PoolClient) => Promise<T>, invalidMessage?: string) {
    try {
      return await this.database.withActor(actor, write);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P0002") throw new NotFoundException("Family workspace or member not found.");
      if (code === "42501") throw new ForbiddenException("Only the family owner can make this change.");
      if (code === "22023" && invalidMessage) throw new BadRequestException(invalidMessage);
      throw error;
    }
  }

  private async queueEmail(client: PoolClient, familyId: string, invitation: InvitationAttempt) {
    await client.query(
      "insert into app.outbox (kind, family_id, payload, dedupe_key) values ('invitation.email', $1, $2, $3)",
      [familyId, { invitationId: invitation.id, attempt: invitation.attempt }, "invitation:" + invitation.attempt],
    );
  }

  private withoutAttempt({ attempt: _attempt, ...invitation }: InvitationAttempt): InvitationDto {
    return invitation;
  }
}
