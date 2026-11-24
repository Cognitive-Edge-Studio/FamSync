import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import type { CreateFamilyEntryInput, FamilyEntryDefaultsDto, FamilyEntryDto, FamilyEntryLinkDto, UpdateFamilyEntryInput } from "./family-entries.dto.js";

type EntryRow = Omit<FamilyEntryDto, "canEdit" | "links"> & { authorId: string };

@Injectable()
export class FamilyEntriesService {
  constructor(private readonly database: DatabaseService) {}

  private async run<T>(actor: string, familyId: string, work: (client: PoolClient) => Promise<T>) {
    try {
      return await this.database.withActor(actor, async (client) => {
        const { rows } = await client.query("select 1 from app.families where id = $1", [familyId]);
        if (!rows.length) throw new NotFoundException("Family workspace not found.");
        return work(client);
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P0002") throw new NotFoundException("Entry not found.");
      if (code === "42501") throw new ForbiddenException("Only the author can change this entry.");
      if (code === "40001") throw new ConflictException("This entry changed since you opened it. Reload to see the latest version.");
      if (code === "23505") throw new ConflictException("This ID is already in use. Reload and try again.");
      if (code === "22023") throw new BadRequestException((error as Error).message + ".");
      if (["23514", "23502", "23503", "22P02", "22007", "22008"].includes(code ?? "")) throw new BadRequestException("Check the entry details.");
      throw error;
    }
  }

  defaults(actor: string, familyId: string) {
    return this.run(actor, familyId, async (client) => {
      const { rows: [row] } = await client.query<FamilyEntryDefaultsDto>(`
        select case when exists (select 1 from app.privacy_preferences where user_id = app.actor_id() and private_mode)
          then 'private' else 'family' end as audience`);
      return row;
    });
  }

  get(actor: string, familyId: string, id: string) {
    return this.run(actor, familyId, (client) => this.detail(client, actor, familyId, id));
  }

  create(actor: string, familyId: string, { id, ...data }: CreateFamilyEntryInput) {
    return this.run(actor, familyId, async (client) => {
      await client.query("select app.save_family_entry($1, $2, null, $3)", [familyId, id, data]);
      return this.detail(client, actor, familyId, id);
    });
  }

  update(actor: string, familyId: string, id: string, { version, ...data }: UpdateFamilyEntryInput) {
    return this.run(actor, familyId, async (client) => {
      await client.query("select app.save_family_entry($1, $2, $3, $4)", [familyId, id, version, data]);
      return this.detail(client, actor, familyId, id);
    });
  }

  remove(actor: string, familyId: string, id: string, version: number) {
    return this.run(actor, familyId, async (client) => {
      await client.query("select app.delete_family_entry($1, $2, $3)", [familyId, id, version]);
      return { id };
    });
  }

  private async detail(client: PoolClient, actor: string, familyId: string, id: string): Promise<FamilyEntryDto> {
    const { rows: [row] } = await client.query<EntryRow>(`
      select id, author_id as "authorId", kind, title, note, happened_on::text as "happenedOn", location, audience,
        selected_member_ids as "selectedMemberIds", version
      from app.family_entries where family_id = $1 and id = $2`, [familyId, id]);
    if (!row) throw new NotFoundException("Entry not found.");
    const { rows: links } = await client.query<FamilyEntryLinkDto>(`
      select case when l.person_id is not null then 'person' when l.goal_id is not null then 'goal'
          when l.event_id is not null then 'event' else 'entry' end as kind,
        coalesce(l.person_id, l.goal_id, l.event_id, l.linked_entry_id) as id,
        coalesce(nullif(btrim(m.first_name || ' ' || m.last_name), ''), g.title, e.title, o.title, 'Family member') as name
      from app.family_entry_links l
      left join app.list_family_members($1) m on m.user_id = l.person_id
      left join app.goals g on g.id = l.goal_id
      left join app.calendar_events e on e.id = l.event_id
      left join app.family_entries o on o.id = l.linked_entry_id
      where l.entry_id = $2 order by kind, name, id`, [familyId, id]);
    const { authorId, ...entry } = row;
    const canEdit = authorId === actor;
    return { ...entry, selectedMemberIds: canEdit ? entry.selectedMemberIds : [], canEdit, links };
  }
}
