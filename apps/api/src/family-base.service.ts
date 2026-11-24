import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import type { FamilyBaseGraphDto } from "./family-base.dto.js";
import {
  buildFamilyBaseGraph, familyBaseLimits, type ConversationRow, type EntryLinkRow, type EntryRow, type EventRow, type FileRow, type GoalRow,
  type GoalTaskRow, type MemberRow, type ParticipantRow, type TaskRow,
} from "./family-base-graph.js";

/**
 * Read-only graph of the records the caller can already open. Every query runs as the caller,
 * so row-level security decides visibility exactly as it does on the Tasks, Goals, Calendar, Chat and Files pages.
 */
@Injectable()
export class FamilyBaseService {
  constructor(private readonly database: DatabaseService) {}

  async graph(actorId: string, familyId: string): Promise<FamilyBaseGraphDto> {
    try {
      return await this.database.withActor(actorId, async (client) => {
        const { rows: [family] } = await client.query<{ name: string }>("select name from app.families where id = $1", [familyId]);
        if (!family) throw new NotFoundException("Family workspace not found.");
        const { rows: members } = await client.query<MemberRow>(
          `select user_id as id, btrim(first_name || ' ' || last_name) as name, role from app.list_family_members($1)`, [familyId],
        );
        if (!members.some((member) => member.id === actorId)) throw new NotFoundException("Family workspace not found.");

        // One node per repeating chore: its next open occurrence, or its latest one when all are done.
        const { rows: tasks } = await client.query<TaskRow>(`
          select id, title, status::text as status, due, "assigneeId", "authorId", "eventId", repeats from (
            select distinct on (coalesce(t.series_id, t.id)) t.id, t.title, t.status, t.created_at,
              coalesce(to_char(t.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), t.due_date::text) as due,
              t.due_date, t.assignee_id as "assigneeId", t.author_id as "authorId", t.event_id as "eventId",
              t.series_id is not null as repeats
            from app.tasks t
            where t.family_id = $1 and t.archived_at is null
              and (t.status <> 'completed' or t.completed_at > now() - interval '30 days')
            order by coalesce(t.series_id, t.id), t.status = 'completed', t.due_date nulls last, t.created_at
          ) picked
          order by status = 'completed', due_date nulls last, created_at
          limit $2`, [familyId, familyBaseLimits.task + 1]);

        const { rows: goals } = await client.query<GoalRow>(`
          select id, title, completed_at is not null as completed, percentage, target_date::text as "targetDate",
            goal_type::text as type, assignee_id as "assigneeId", author_id as "authorId"
          from app.goals where family_id = $1 and archived_at is null
          order by completed_at is not null, target_date nulls last, created_at
          limit $2`, [familyId, familyBaseLimits.goal + 1]);

        const goalIds = goals.slice(0, familyBaseLimits.goal).map((goal) => goal.id);
        const { rows: goalTasks } = goalIds.length ? await client.query<GoalTaskRow>(`
          select goal_id as "goalId", task_id as "taskId" from app.goal_checklist_items
          where task_id is not null and goal_id = any($1::uuid[])`, [goalIds]) : { rows: [] };

        // One query per kind keeps a busy kind from pushing out the others.
        const entries: EntryRow[] = [];
        for (const kind of ["memory", "place", "idea"] as const) {
          const { rows } = await client.query<EntryRow>(`
            select id, kind, title, note, happened_on::text as "happenedOn", location, audience::text as audience, author_id as "authorId"
            from app.family_entries where family_id = $1 and kind = $2
            order by created_at desc, id limit $3`, [familyId, kind, familyBaseLimits[kind] + 1]);
          entries.push(...rows);
        }
        const entryIds = entries.map((entry) => entry.id);
        const { rows: entryLinks } = entryIds.length ? await client.query<EntryLinkRow>(`
          select entry_id as "entryId", person_id as "personId", goal_id as "goalId", event_id as "eventId",
            linked_entry_id as "linkedEntryId"
          from app.family_entry_links where entry_id = any($1::uuid[])`, [entryIds]) : { rows: [] };
        // A memory keeps its event in the graph however long ago it was.
        const linkedEvents = [...new Set(entryLinks.flatMap((row) => row.eventId ?? []))];

        const { rows: events } = await client.query<EventRow>(`
          select id, title, author_id as "authorId", repeat_frequency is not null as repeats,
            coalesce(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), start_date::text) as starts
          from app.calendar_events
          where family_id = $1 and (coalesce(ends_at, end_date::timestamptz) >= now() - interval '30 days'
            or repeat_until >= current_date - 30 or id = any($3::uuid[]))
          order by coalesce(starts_at, start_date::timestamptz) < now() - interval '1 day', coalesce(starts_at, start_date::timestamptz)
          limit $2`, [familyId, familyBaseLimits.event + 1, linkedEvents]);

        const { rows: conversations } = await client.query<ConversationRow>(`
          select id, name, emoji, kind from app.channels where family_id = $1 and archived_at is null
          order by kind = 'dm', created_at, id limit $2`, [familyId, familyBaseLimits.conversation + 1]);

        const conversationIds = conversations.slice(0, familyBaseLimits.conversation).map((conversation) => conversation.id);
        const { rows: participants } = conversationIds.length ? await client.query<ParticipantRow>(`
          select channel_id as "channelId", user_id as "userId" from app.channel_participants
          where channel_id = any($1::uuid[])`, [conversationIds]) : { rows: [] };

        const { rows: files } = await client.query<FileRow>(`
          select f.id, f.folder_id as "folderId", f.file_name as name, f.mime, f.author_id as "authorId", d.channel_id as "channelId",
            to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created
          from app.stored_files f join app.folders d on d.id = f.folder_id
          where f.family_id = $1 and f.state = 'ready' and f.archived_at is null and d.archived_at is null
          order by f.created_at desc, f.id limit $2`, [familyId, familyBaseLimits.file + 1]);

        return buildFamilyBaseGraph({
          familyName: family.name, actorId, members, tasks, goals, goalTasks, events, conversations, participants, files, entries, entryLinks,
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new ForbiddenException("You don’t have access to this family workspace.");
      if ((error as { code?: string }).code === "22P02") throw new NotFoundException("Family workspace not found.");
      throw error;
    }
  }
}
