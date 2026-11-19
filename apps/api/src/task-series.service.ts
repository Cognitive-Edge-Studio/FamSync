import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import type { ItemAudience } from "./calendar.dto.js";
import { repeatDates } from "./calendar-recurrence.js";
import { defaultTaskReminder } from "./reminder-rules.js";
import { generateSeries } from "./task-series.store.js";
import type {
  ArchiveInput, CreateSeriesInput, RepeatRule, SeriesPreviewDto, SeriesPreviewInput, TaskSeriesDto, UpdateSeriesInput,
} from "./tasks.dto.js";
import { person, TasksService, type Context } from "./tasks.service.js";

type SeriesRow = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  audience: ItemAudience;
  selectedMemberIds: string[];
  assigneeId: string | null;
  dueTime: string | null;
  timeZone: string;
  frequency: RepeatRule["frequency"];
  interval: number;
  start: string;
  until: string | null;
  generatedThrough: string | null;
  archived: boolean;
  version: number;
  remindMinutes: number | null;
};

const seriesFields = `
  s.id, s.author_id as "authorId", s.title, s.description, s.audience, s.selected_member_ids as "selectedMemberIds",
  s.assignee_id as "assigneeId", to_char(s.due_time, 'HH24:MI') as "dueTime", s.time_zone as "timeZone", s.frequency,
  s.repeat_interval as interval, s.start_date::text as start, s.until::text as until,
  s.generated_through::text as "generatedThrough", s.archived_at is not null as archived, s.version,
  s.remind_minutes as "remindMinutes"
`;
const staleMessage = "This chore changed since you opened it. Reload to see the latest version.";
const previewLimit = 8;
// Starting further back would create a long run of overdue occurrences at once.
const maxDaysBack = 90;

// The first `limit` due dates on or after `from`, with a bounded search window.
function nextDates(rule: Pick<SeriesRow, "frequency" | "interval" | "start" | "until">, from: string, limit: number) {
  const first = Temporal.PlainDate.from(from > rule.start ? from : rule.start);
  const span = rule.frequency === "daily" ? { days: rule.interval * (limit + 1) }
    : rule.frequency === "weekly" ? { weeks: rule.interval * (limit + 1) } : { months: rule.interval * (limit + 1) * 2 };
  const horizon = first.add(span).toString();
  const to = rule.until && rule.until < horizon ? rule.until : horizon;
  if (first.toString() > to) return [];
  return repeatDates(rule, first.toString(), to).slice(0, limit + 1);
}

@Injectable()
export class TaskSeriesService {
  constructor(private readonly tasks: TasksService) {}

  preview(actor: string, familyId: string, input: SeriesPreviewInput): Promise<SeriesPreviewDto> {
    return this.tasks.run(actor, familyId, async () => {
      this.validateDates(input.startDate, input.recurrence.until ?? null);
      const dates = nextDates({ ...input.recurrence, until: input.recurrence.until ?? null, start: input.startDate },
        input.startDate, previewLimit);
      return { dates: dates.slice(0, previewLimit), hasMore: dates.length > previewLimit };
    });
  }

  create(actor: string, familyId: string, input: CreateSeriesInput) {
    return this.tasks.run(actor, familyId, async (client, context) => {
      const existing = await this.find(client, familyId, input.id);
      if (existing) {
        if (existing.authorId !== actor) throw new ConflictException("The chore could not be saved. Reload and try again.");
        return this.detail(existing, actor, context);
      }
      const until = input.recurrence.until ?? null;
      this.validateDates(input.startDate, until, context.clock.today);
      const audience = input.audience ?? await this.tasks.defaultAudience(client);
      const selected = audience === "selected" ? [...new Set(input.selectedMemberIds ?? [])] : [];
      const assignee = input.assigneeId ?? null;
      await this.tasks.validateAudience(client, familyId, actor, audience, selected, assignee, null);

      await client.query(`
        insert into app.task_series (id, family_id, author_id, title, description, audience, selected_member_ids,
          assignee_id, due_time, time_zone, frequency, repeat_interval, start_date, until, remind_minutes)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10, $11, $12, $13, $14, $15)
        on conflict (id) do nothing
      `, [input.id, familyId, actor, input.title, input.description, audience, selected, assignee, input.dueTime ?? null,
        context.timeZone, input.recurrence.frequency, input.recurrence.interval, input.startDate, until,
        input.remindMinutes === undefined ? defaultTaskReminder(input.startDate, input.dueTime) : input.remindMinutes]);
      const saved = await this.find(client, familyId, input.id);
      if (!saved || saved.authorId !== actor) throw new ConflictException("The chore could not be saved. Reload and try again.");
      await generateSeries(client, saved, context.clock.today);
      await context.planReminders("task_series", saved.id, actor);
      await context.noticeAssignment("task_series", saved.id, null, saved.assigneeId, null);
      return this.detail(saved, actor, context);
    });
  }

  get(actor: string, familyId: string, seriesId: string) {
    return this.tasks.run(actor, familyId, async (client, context) => {
      const row = await this.find(client, familyId, seriesId);
      if (!row) throw new NotFoundException("Chore not found.");
      return this.detail(row, actor, context);
    });
  }

  update(actor: string, familyId: string, seriesId: string, input: UpdateSeriesInput) {
    return this.tasks.run(actor, familyId, async (client, context) => {
      const row = await this.editable(client, familyId, seriesId, actor, input.version);
      if (row.archived) throw new ConflictException("Restore this chore before changing it.");
      const until = input.until ?? null;
      const remind = input.remindMinutes === undefined ? row.remindMinutes : input.remindMinutes;
      this.validateDates(row.start, until);
      const selected = input.audience === "selected" ? [...new Set(input.selectedMemberIds ?? [])] : [];
      const assignee = input.assigneeId ?? null;
      await this.tasks.validateAudience(client, familyId, actor, input.audience, selected, assignee, row.assigneeId);

      const updated = await client.query(`
        update app.task_series set title = $3, description = $4, audience = $5, selected_member_ids = $6,
          assignee_id = $7, due_time = $8::time, until = $9, remind_minutes = $11
        where family_id = $1 and id = $2 and version = $10
      `, [familyId, seriesId, input.title, input.description, input.audience, selected, assignee, input.dueTime ?? null,
        until, input.version, remind]);
      if (!updated.rowCount) throw new ConflictException(staleMessage);

      // Open occurrences that were not edited on their own follow the series. Completed ones keep their history.
      await client.query(`
        update app.tasks set title = $2, description = $3, audience = $4, selected_member_ids = $5, assignee_id = $6,
          due_at = case when $7::time is null then null else (occurrence_date + $7::time) at time zone $8 end,
          remind_minutes = $9
        where series_id = $1 and status <> 'completed' and archived_at is null and not customized
      `, [seriesId, input.title, input.description, input.audience, selected, assignee, input.dueTime ?? null, row.timeZone,
        remind]);
      if (until) {
        await client.query(`
          update app.tasks set archived_at = now()
          where series_id = $1 and occurrence_date > $2::date and status <> 'completed' and archived_at is null
        `, [seriesId, until]);
      }
      await context.planReminders("task_series", seriesId, actor);
      await context.noticeAssignment("task_series", seriesId, row.assigneeId, assignee, null);
      return this.detail((await this.find(client, familyId, seriesId))!, actor, context);
    });
  }

  archive(actor: string, familyId: string, seriesId: string, input: ArchiveInput) {
    return this.tasks.run(actor, familyId, async (client, context) => {
      const row = await this.editable(client, familyId, seriesId, actor, input.version);
      if (row.archived === input.archived) return this.detail(row, actor, context);
      if (input.archived) {
        await client.query("update app.task_series set archived_at = now() where id = $1", [seriesId]);
        await client.query(`
          update app.tasks set archived_at = now()
          where series_id = $1 and status <> 'completed' and archived_at is null
        `, [seriesId]);
      } else {
        // Restore only the occurrences this series archive put away, and resume from today.
        await client.query(`
          update app.tasks t set archived_at = null from app.task_series s
          where s.id = $1 and t.series_id = s.id and t.archived_at = s.archived_at
        `, [seriesId]);
        await client.query(`
          update app.task_series set archived_at = null,
            generated_through = greatest(coalesce(generated_through, $2::date - 1), $2::date - 1)
          where id = $1
        `, [seriesId, context.clock.today]);
        const restored = (await this.find(client, familyId, seriesId))!;
        await generateSeries(client, restored, context.clock.today);
      }
      await context.planReminders("task_series", seriesId, actor);
      return this.detail((await this.find(client, familyId, seriesId))!, actor, context);
    });
  }

  private validateDates(start: string, until: string | null, today?: string) {
    if (until && until < start) throw new BadRequestException("The repeat end date must be on or after the start date.");
    if (today && Temporal.PlainDate.from(start).until(today).days > maxDaysBack) {
      throw new BadRequestException("Choose a start date within the last " + maxDaysBack + " days.");
    }
  }

  private async editable(client: PoolClient, familyId: string, seriesId: string, actor: string, version: number) {
    const row = await this.find(client, familyId, seriesId);
    if (!row) throw new NotFoundException("Chore not found.");
    if (row.authorId !== actor) throw new ForbiddenException("Only the person who created this chore can change it.");
    if (row.version !== version) throw new ConflictException(staleMessage);
    return row;
  }

  private async find(client: PoolClient, familyId: string, seriesId: string) {
    const { rows: [row] } = await client.query<SeriesRow>(
      `select ${seriesFields} from app.task_series s where s.family_id = $1 and s.id = $2`, [familyId, seriesId],
    );
    return row;
  }

  private detail(row: SeriesRow, actor: string, { clock, names }: Context): TaskSeriesDto {
    const tomorrow = Temporal.PlainDate.from(clock.today).add({ days: 1 }).toString();
    return {
      id: row.id, title: row.title, description: row.description, audience: row.audience,
      selectedMemberIds: row.authorId === actor ? row.selectedMemberIds : [],
      author: person(row.authorId, names)!, assignee: person(row.assigneeId, names), dueTime: row.dueTime,
      timeZone: row.timeZone, frequency: row.frequency, interval: row.interval, startDate: row.start, until: row.until,
      archived: row.archived, version: row.version, canEdit: row.authorId === actor,
      upcoming: row.archived ? [] : nextDates(row, tomorrow, previewLimit).slice(0, previewLimit), today: clock.today,
      remindMinutes: row.remindMinutes,
    };
  }
}
