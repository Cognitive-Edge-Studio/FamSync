import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { ItemAudience } from "./calendar.dto.js";
import { DatabaseService } from "./database.service.js";
import { familyTimeZone } from "./family-time-zone.js";
import {
  decodeCursor, encodeCursor, isOverdue, localDueTime, overdueSql, taskClock, taskDue,
  type TaskClock, type TaskStatus,
} from "./task-rules.js";
import { seriesFields } from "./calendar-occurrence.store.js";
import { seriesOccurrence, type Series } from "./calendar-recurrence.js";
import { JobsService } from "./jobs.service.js";
import { queueChangeNotice, queueReminderPlan } from "./reminder-queue.js";
import { dayStart, defaultTaskReminder, localInstant } from "./reminder-rules.js";
import { generateOccurrences } from "./task-series.store.js";
import type {
  ArchiveInput, CreateTaskInput, EventLinkInput, TaskDetailDto, TaskDto, TaskListQuery, TaskPageDto, TaskPersonDto, TaskStatusInput, TaskSummaryDto,
  UpdateTaskInput,
} from "./tasks.dto.js";

type TaskRow = {
  sourceMessageId:string|null;
  id: string;
  authorId: string;
  title: string;
  description: string;
  status: TaskStatus;
  audience: ItemAudience;
  selectedMemberIds: string[];
  assigneeId: string | null;
  dueDate: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  version: number;
  seriesId: string | null;
  occurrenceDate: string | null;
  customized: boolean;
  archived: boolean;
  repeatFrequency: "daily" | "weekly" | "monthly" | null;
  repeatInterval: number | null;
  repeatUntil: string | null;
  seriesArchived: boolean | null;
  eventId: string | null;
  eventOccurrenceDate: string | null;
  eventTitle: string | null;
  eventCancelled: boolean;
  remindMinutes: number | null;
  sortDue: string;
  sortTime: string;
  sortCreated: string;
};
export type Context = {
  timeZone: string;
  clock: TaskClock;
  names: Map<string, string>;
  // Queues a reminder re-plan in this transaction. The job runner is signalled after commit.
  planReminders: (kind: "task" | "task_series", sourceId: string, authorId: string) => Promise<void>;
  // Queues an assignment change notice in this transaction.
  noticeAssignment: (kind: "task" | "task_series", sourceId: string, before: string | null, after: string | null, dueAt: string | null) => Promise<void>;
};
type Filter = Pick<TaskListQuery, "status" | "overdue" | "due" | "scope" | "event" | "occurrence"> & { archived?: "true" | "false" | "any" };

// Adds only the parameters a query uses, with explicit types.
export class Params {
  readonly values: unknown[] = [];
  add(value: unknown, type: string) {
    this.values.push(value);
    return "$" + this.values.length + "::" + type;
  }
}

const taskFields = `
  t.source_message_id as "sourceMessageId",
  t.id, t.author_id as "authorId", t.title, t.description, t.status, t.audience,
  t.selected_member_ids as "selectedMemberIds", t.assignee_id as "assigneeId", t.due_date::text as "dueDate",
  t.due_at as "dueAt", t.completed_at as "completedAt", t.completed_by as "completedBy", t.version,
  coalesce(t.due_date::text, 'infinity') as "sortDue", coalesce(t.due_at::text, 'infinity') as "sortTime",
  t.created_at::text as "sortCreated", t.series_id as "seriesId", t.occurrence_date::text as "occurrenceDate",
  t.customized, t.archived_at is not null as archived, r.frequency as "repeatFrequency",
  r.repeat_interval as "repeatInterval", r.until::text as "repeatUntil", r.archived as "seriesArchived",
  t.event_id as "eventId", t.event_occurrence_date::text as "eventOccurrenceDate", ev.title as "eventTitle",
  coalesce(ec.cancelled, false) as "eventCancelled", t.remind_minutes as "remindMinutes"
`;
// The repeat rule comes from a lookup that only returns rules for occurrences the caller can see.
// Event columns come through the calendar's own row-level security, so a hidden event yields no link.
const taskSource = `app.tasks t left join lateral app.task_series_rule(t.id) r on t.series_id is not null
  left join app.calendar_events ev on ev.id = t.event_id
  left join app.calendar_occurrence_changes ec on ec.event_id = t.event_id and ec.original_date = t.event_occurrence_date`;
const restoreFirst = "Restore this task before changing it.";
const sortKey = "(coalesce(t.due_date, 'infinity'::date), coalesce(t.due_at, 'infinity'::timestamptz), t.created_at, t.id)";
const staleMessage = "This task changed since you opened it. Reload to see the latest version.";

// The time shown with an assignment notice: the due time, 08:00 on a date-only due day, or none.
function noticeTime(due: { dueDate: string | null; dueAt: string | null }, timeZone: string) {
  if (due.dueAt) return due.dueAt;
  return due.dueDate ? localInstant(due.dueDate, dayStart, timeZone).toString() : null;
}

export function person(id: string | null, names: Map<string, string>): TaskPersonDto | null {
  if (!id) return null;
  const name = names.get(id);
  return { userId: id, name: name ?? "Former member", current: name !== undefined };
}

function toTask(row: TaskRow, actor: string, { timeZone, clock, names }: Context): TaskDto {
  const dueAt = row.dueAt?.toISOString() ?? null;
  return {
    id: row.id, title: row.title, description: row.description, status: row.status, audience: row.audience,
    selectedMemberIds: row.authorId === actor ? row.selectedMemberIds : [],
    dueDate: row.dueDate, dueTime: localDueTime(dueAt, timeZone),
    overdue: isOverdue({ status: row.status, dueDate: row.dueDate, dueAt }, clock),
    author: person(row.authorId, names)!, assignee: person(row.assigneeId, names),
    completedAt: row.completedAt?.toISOString() ?? null, completedBy: person(row.completedBy, names),
    version: row.version, canEdit: row.authorId === actor,
    canChangeStatus: !row.archived && (row.authorId === actor || row.assigneeId === actor),
    series: row.seriesId && row.repeatFrequency ? {
      id: row.seriesId, frequency: row.repeatFrequency, interval: row.repeatInterval!, until: row.repeatUntil,
      occurrenceDate: row.occurrenceDate!, archived: row.seriesArchived === true,
    } : null,
    archived: row.archived, customized: row.customized, remindMinutes: row.remindMinutes,
    eventLink: row.eventId && row.eventTitle !== null ? {
      eventId: row.eventId, occurrenceDate: row.eventOccurrenceDate, title: row.eventTitle, cancelled: row.eventCancelled,
    } : null,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jobs: JobsService,
  ) {}

  list(actor: string, familyId: string, query: TaskListQuery): Promise<TaskPageDto> {
    return this.run(actor, familyId, async (client, context) => {
      await generateOccurrences(client, familyId, context.clock.today);
      const params = new Params();
      const filters = this.filters(params, familyId, actor, context.clock, query);
      if (query.cursor) {
        const [due, time, created, id] = decodeCursor(query.cursor);
        filters.push(`${sortKey} > (${params.add(due, "date")}, ${params.add(time, "timestamptz")}, `
          + `${params.add(created, "timestamptz")}, ${params.add(id, "uuid")})`);
      }
      const limit = query.limit ?? 50;
      const { rows } = await client.query<TaskRow>(`
        select ${taskFields} from ${taskSource} where ${filters.join(" and ")}
        order by ${sortKey} limit ${limit + 1}
      `, params.values);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        timeZone: context.timeZone, today: context.clock.today,
        tasks: page.map((row) => toTask(row, actor, context)),
        nextCursor: rows.length > limit && last
          ? encodeCursor([last.sortDue, last.sortTime, last.sortCreated, last.id]) : null,
      };
    });
  }

  summary(actor: string, familyId: string, scope?: "all" | "mine"): Promise<TaskSummaryDto> {
    return this.run(actor, familyId, async (client, { timeZone, clock }) => {
      await generateOccurrences(client, familyId, clock.today);
      const params = new Params();
      const filters = this.filters(params, familyId, actor, clock, { scope, archived: "any" });
      const today = params.add(clock.today, "date");
      const overdue = overdueSql(params.add(clock.now, "timestamptz"), today);
      const active = "t.archived_at is null";
      const { rows: [counts] } = await client.query<Record<string, number>>(`
        select count(*) filter (where ${active})::int as "all",
          count(*) filter (where ${active} and ${overdue})::int as overdue,
          count(*) filter (where ${active} and t.status = 'todo')::int as todo,
          count(*) filter (where ${active} and t.status = 'in_progress')::int as "inProgress",
          count(*) filter (where ${active} and t.status = 'completed')::int as completed,
          count(*) filter (where ${active} and t.status <> 'completed' and t.due_date = ${today})::int as "dueToday",
          count(*) filter (where t.archived_at is not null)::int as archived
        from app.tasks t where ${filters.join(" and ")}
      `, params.values);
      return {
        timeZone, today: clock.today, all: counts.all, overdue: counts.overdue, todo: counts.todo,
        inProgress: counts.inProgress, completed: counts.completed, dueToday: counts.dueToday, archived: counts.archived,
      };
    });
  }

  defaults(actor: string, familyId: string) {
    return this.run(actor, familyId, async (client) => ({ audience: await this.defaultAudience(client) }));
  }

  get(actor: string, familyId: string, taskId: string) {
    return this.run(actor, familyId, async (client, context) => {
      const row = await this.find(client, familyId, taskId);
      if (!row) throw new NotFoundException("Task not found.");
      return this.detail(row, actor, context);
    });
  }

  create(actor: string, familyId: string, input: CreateTaskInput, source?:{messageId:string;version:number}) {
    return this.run(actor, familyId, async (client, context) => {
      const existing = await this.find(client, familyId, input.id);
      if(source&&existing&&existing.sourceMessageId!==source.messageId)throw new ConflictException('This task ID has a different source.');
      if (existing) return this.savedByActor(existing, actor, context);

      if(source)await client.query('select app.assert_message_task_audience($1,$2,$3,$4,$5,$6)',
        [source.messageId,familyId,actor,input.audience??'private',input.selectedMemberIds??[],source.version]);

      const audience = input.audience ?? await this.defaultAudience(client);
      const selected = audience === "selected" ? [...new Set(input.selectedMemberIds ?? [])] : [];
      const assignee = input.assigneeId ?? null;
      await this.validateAudience(client, familyId, actor, audience, selected, assignee, null);
      const due = taskDue(input.dueDate, input.dueTime, context.timeZone);
      const link = await this.resolveLink(client, familyId, input.eventLink ?? null);
      const remind = input.remindMinutes === undefined ? defaultTaskReminder(input.dueDate, input.dueTime) : input.remindMinutes;

      const inserted = await client.query(`
        insert into app.tasks (id, family_id, author_id, title, description, audience, selected_member_ids,
          assignee_id, due_date, due_at, event_id, event_occurrence_date, remind_minutes, source_message_id)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        on conflict (id) do nothing
      `, [input.id, familyId, actor, input.title, input.description, audience, selected, assignee, due.dueDate, due.dueAt,
        link.eventId, link.occurrenceDate, remind,source?.messageId??null]);
      const saved = await this.find(client, familyId, input.id);
      if (!inserted.rowCount) return this.savedByActor(saved, actor, context);
      await context.planReminders("task", input.id, actor);
      await context.noticeAssignment("task", input.id, null, assignee, noticeTime(due, context.timeZone));
      return this.detail(saved!, actor, context);
    });
  }

  update(actor: string, familyId: string, taskId: string, input: UpdateTaskInput) {
    return this.run(actor, familyId, async (client, context) => {
      const row = await this.find(client, familyId, taskId);
      if (!row) throw new NotFoundException("Task not found.");
      if (row.authorId !== actor) throw new ForbiddenException("Only the person who created this task can edit it.");
      if (row.version !== input.version) throw new ConflictException(staleMessage);
      if (row.archived) throw new ConflictException(restoreFirst);

      const selected = input.audience === "selected" ? [...new Set(input.selectedMemberIds ?? [])] : [];
      const assignee = input.assigneeId ?? null;
      await this.validateAudience(client, familyId, actor, input.audience, selected, assignee, row.assigneeId);
      const due = taskDue(input.dueDate, input.dueTime, context.timeZone);
      const link = input.eventLink === undefined
        ? { eventId: row.eventId, occurrenceDate: row.eventOccurrenceDate }
        : await this.resolveLink(client, familyId, input.eventLink);
      const remind = input.remindMinutes === undefined ? row.remindMinutes : input.remindMinutes;

      const updated = await client.query(`
        update app.tasks set title = $3, description = $4, audience = $5, selected_member_ids = $6,
          assignee_id = $7, due_date = $8, due_at = $9, customized = series_id is not null,
          event_id = $11, event_occurrence_date = $12, remind_minutes = $13
        where family_id = $1 and id = $2 and version = $10
      `, [familyId, taskId, input.title, input.description, input.audience, selected, assignee,
        due.dueDate, due.dueAt, input.version, link.eventId, link.occurrenceDate, remind]);
      if (!updated.rowCount) throw new ConflictException(staleMessage);
      await this.planFor(context, row);
      await context.noticeAssignment("task", taskId, row.assigneeId, assignee, noticeTime(due, context.timeZone));
      return this.detail((await this.find(client, familyId, taskId))!, actor, context);
    });
  }

  changeStatus(actor: string, familyId: string, taskId: string, input: TaskStatusInput) {
    return this.run(actor, familyId, async (client, context) => {
      const row = await this.find(client, familyId, taskId);
      if (!row) throw new NotFoundException("Task not found.");
      if (row.authorId !== actor && row.assigneeId !== actor) {
        throw new ForbiddenException("Only the task creator or assignee can change its status.");
      }
      if (row.version !== input.version) throw new ConflictException(staleMessage);
      if (row.archived) throw new ConflictException(restoreFirst);
      const updated = await client.query(
        "update app.tasks set status = $3 where family_id = $1 and id = $2 and version = $4",
        [familyId, taskId, input.status, input.version],
      );
      if (!updated.rowCount) throw new ConflictException(staleMessage);
      await this.planFor(context, row);
      return this.detail((await this.find(client, familyId, taskId))!, actor, context);
    });
  }

  archive(actor: string, familyId: string, taskId: string, input: ArchiveInput) {
    return this.run(actor, familyId, async (client, context) => {
      const row = await this.find(client, familyId, taskId);
      if (!row) throw new NotFoundException("Task not found.");
      if (row.authorId !== actor) throw new ForbiddenException("Only the person who created this task can archive it.");
      if (row.version !== input.version) throw new ConflictException(staleMessage);
      const updated = await client.query(`
        update app.tasks set archived_at = case when $3 then now() end
        where family_id = $1 and id = $2 and version = $4
      `, [familyId, taskId, input.archived, input.version]);
      if (!updated.rowCount) throw new ConflictException(staleMessage);
      await this.planFor(context, row);
      return this.detail((await this.find(client, familyId, taskId))!, actor, context);
    });
  }

  // A chore occurrence's reminders belong to its series.
  private planFor(context: Context, row: TaskRow) {
    return row.seriesId
      ? context.planReminders("task_series", row.seriesId, row.authorId)
      : context.planReminders("task", row.id, row.authorId);
  }

  private filters(params: Params, familyId: string, actor: string, clock: TaskClock, query: Filter) {
    const filters = ["t.family_id = " + params.add(familyId, "uuid")];
    if (query.archived === "true") filters.push("t.archived_at is not null");
    else if (query.archived !== "any") filters.push("t.archived_at is null");
    if (query.scope === "mine") {
      const me = params.add(actor, "uuid");
      filters.push(`(t.assignee_id = ${me} or (t.assignee_id is null and t.author_id = ${me}))`);
    }
    if (query.status) filters.push("t.status = " + params.add(query.status, "app.task_status"));
    if (query.event) {
      filters.push("t.event_id = " + params.add(query.event, "uuid"));
      filters.push(query.occurrence
        ? "t.event_occurrence_date = " + params.add(query.occurrence, "date") : "t.event_occurrence_date is null");
    }
    if (query.overdue || query.due) {
      const today = params.add(clock.today, "date");
      const overdue = overdueSql(params.add(clock.now, "timestamptz"), today);
      if (query.overdue === "true") filters.push(overdue);
      if (query.overdue === "false") filters.push("not " + overdue);
      if (query.due === "today") filters.push(`(t.due_date = ${today} or ${overdue})`);
    }
    return filters;
  }

  async run<T>(actor: string, familyId: string, work: (client: PoolClient, context: Context) => Promise<T>) {
    let queued = false;
    try {
      const result = await this.database.withActor(actor, async (client) => {
        const { rows: [family] } = await client.query<{ timeZone: string }>(
          'select time_zone as "timeZone" from app.families where id = $1', [familyId],
        );
        if (!family) throw new NotFoundException("Family workspace not found.");
        const timeZone = familyTimeZone(family.timeZone);
        const { rows: members } = await client.query<{ userId: string; firstName: string; lastName: string }>(
          'select user_id as "userId", first_name as "firstName", last_name as "lastName" from app.list_family_members($1)',
          [familyId],
        );
        const names = new Map(members.map(({ userId, firstName, lastName }) =>
          [userId, [firstName, lastName].filter(Boolean).join(" ") || "Family member"]));
        const planReminders = async (kind: "task" | "task_series", sourceId: string, authorId: string) => {
          await queueReminderPlan(client, familyId, kind, sourceId, authorId);
          queued = true;
        };
        // The new assignee hears they were assigned and the previous one that they no longer are. Not the actor.
        const noticeAssignment = async (kind: "task" | "task_series", sourceId: string, before: string | null,
          after: string | null, dueAt: string | null) => {
          if (before === after) return;
          for (const [notice, recipient] of [["assigned", after], ["unassigned", before]] as const) {
            if (!recipient || recipient === actor) continue;
            await queueChangeNotice(client, familyId, { kind: notice, sourceKind: kind, sourceId, recipientIds: [recipient], actorId: actor, dueAt });
            queued = true;
          }
        };
        return work(client, { timeZone, clock: taskClock(timeZone), names, planReminders, noticeAssignment });
      });
      if (queued) await this.jobs.notify();
      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if(code==='40001'||code==='40P01')throw new ConflictException('The task or conversation changed. Reload before trying again.');
      if (code === "42501") throw new NotFoundException("The task or family has changed. Reload and try again.");
      if (code === "22023" && ["Unlink the task before changing visibility, or keep matching audiences.","Choose only current conversation members, or unlink the source before widening visibility"].includes((error as Error).message)) {
        throw new BadRequestException((error as Error).message);
      }
      if (code?.startsWith("22")) throw new BadRequestException("Check the task details and try again.");
      throw error;
    }
  }

  async validateAudience(
    client: PoolClient, familyId: string, author: string, audience: ItemAudience, selected: string[],
    assignee: string | null, currentAssignee: string | null,
  ) {
    const { rows: [check] } = await client.query<{ audience: boolean; assignee: boolean }>(`
      select app.can_set_family_item_audience($1, $2, $3) as audience,
        app.can_assign_family_task($1, $4, $2, $3, $5) as assignee
    `, [familyId, audience, selected, author, assignee]);
    if (!check.audience) throw new BadRequestException("Choose current family members for a selected audience.");
    if (check.assignee) return;
    if (assignee && assignee === currentAssignee) {
      throw new ConflictException(
        "The assignee wouldn’t be able to see this task with that audience. Reassign it first or include them.",
      );
    }
    throw new BadRequestException("Choose an assignee who is a family member and can see this task.");
  }

  // A link must name an event the caller can see. A repeating event also needs one of its real occurrence dates.
  private async resolveLink(client: PoolClient, familyId: string, link: EventLinkInput | null) {
    if (!link) return { eventId: null, occurrenceDate: null };
    const { rows: [event] } = await client.query<{ series: Series | null }>(
      `select ${seriesFields} from app.calendar_events e where e.family_id = $1 and e.id = $2`, [familyId, link.eventId],
    );
    if (!event) throw new BadRequestException("Choose an event you can see.");
    const occurrenceDate = link.occurrenceDate ?? null;
    if (event.series ? !occurrenceDate || !seriesOccurrence(event.series, occurrenceDate) : occurrenceDate) {
      throw new BadRequestException("Choose a date when this event takes place.");
    }
    return { eventId: link.eventId, occurrenceDate };
  }

  async defaultAudience(client: PoolClient) {
    const { rows: [row] } = await client.query<{ audience: ItemAudience }>(
      "select app.default_family_item_audience('tasks') as audience",
    );
    return row.audience;
  }

  private async find(client: PoolClient, familyId: string, taskId: string) {
    const { rows: [row] } = await client.query<TaskRow>(
      `select ${taskFields} from ${taskSource} where t.family_id = $1 and t.id = $2`, [familyId, taskId],
    );
    return row;
  }

  private detail(row: TaskRow, actor: string, context: Context): TaskDetailDto {
    return { ...toTask(row, actor, context), timeZone: context.timeZone, today: context.clock.today };
  }

  private savedByActor(row: TaskRow | undefined, actor: string, context: Context) {
    if (!row || row.authorId !== actor) throw new ConflictException("The task could not be saved. Reload and try again.");
    return this.detail(row, actor, context);
  }
}
