import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { AttachmentStorageService } from "./attachment-storage.service.js";
import {
  dateInput, scheduleInput,
  type EventDetailDto, type EventInput, type EventRangeDto, type EventSummaryDto, type ItemAudience,
  type OccurrenceChange, type RecurrencePreviewInputDto,
} from "./calendar.dto.js";
import { changedSchedule, changesForRange, readOccurrenceChange, seriesFields, writeOccurrenceChange, type ChangeRow }
  from "./calendar-occurrence.store.js";
import {
  occurrencesInRange, previewSeries, scheduleOverlaps, seriesOccurrence, validateSeries, zoneMargin, type DateRange, type Series,
} from "./calendar-recurrence.js";
import { calendarRange, eventSchedule, type Schedule } from "./calendar-time.js";
import { DatabaseService } from "./database.service.js";
import { JobsService } from "./jobs.service.js";
import { queueChangeNotice, queueReminderPlan } from "./reminder-queue.js";
import { dayStart, localInstant } from "./reminder-rules.js";
import { familyTimeZone } from "./family-time-zone.js";

const scheduleFields = `
  e.id, e.title, e.audience, e.start_date::text as "startDate", e.end_date::text as "endDate",
  e.starts_at as "startsAt", e.ends_at as "endsAt"
`;
type EventRow = {
  id: string;
  title: string;
  audience: ItemAudience;
  startDate: string | null;
  endDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  series: Series | null;
};
type DetailRow = EventRow & {
  authorId: string;
  note: string;
  location: string;
  fileName: string | null;
  byteSize: number | null;
  objectKey: string | null;
};
type EventFile = { buffer: Buffer; originalname: string; size: number };

function summary(row: EventRow): EventSummaryDto {
  return {
    id: row.id, title: row.title, audience: row.audience, allDay: row.startDate !== null,
    start: row.startDate ?? row.startsAt!.toISOString(),
    end: row.endDate ?? row.endsAt!.toISOString(),
  };
}

function occurrenceSummary(row: EventRow, originalDate: string, base: Schedule, change?: ChangeRow): EventSummaryDto {
  const schedule = change ? changedSchedule(change) ?? base : base;
  return {
    id: row.id, title: row.title, audience: row.audience,
    allDay: schedule.allDay, start: schedule.start, end: schedule.end,
    occurrence: { originalDate, status: change?.cancelled ? "cancelled" : change ? "moved" : "scheduled" },
  };
}

function expandEvent(row: EventRow, range: DateRange, changes?: Map<string, ChangeRow>): EventSummaryDto[] {
  if (!row.series) return [summary(row)];
  const events: EventSummaryDto[] = [];
  const seen = new Set<string>();
  for (const occurrence of occurrencesInRange(row.series, range)) {
    seen.add(occurrence.originalDate);
    const change = changes?.get(occurrence.originalDate);
    if (change?.cancelled) continue;
    const event = occurrenceSummary(row, occurrence.originalDate, occurrence, change);
    if (scheduleOverlaps(event, range)) events.push(event);
  }
  for (const change of changes?.values() ?? []) {
    if (change.cancelled || seen.has(change.originalDate)) continue;
    const moved = changedSchedule(change);
    if (moved && scheduleOverlaps(moved, range)) {
      events.push(occurrenceSummary(row, change.originalDate, moved, change));
    }
  }
  return events;
}

function scheduleSortKey(event: EventSummaryDto, timeZone: string) {
  if (event.allDay) return event.start + "0" + event.id;
  const date = Temporal.Instant.from(event.start).toZonedDateTimeISO(timeZone).toPlainDate().toString();
  return date + "1" + event.start + event.id;
}

function detail(row: DetailRow, event: EventSummaryDto, timeZone: string, actor: string): EventDetailDto {
  return {
    ...event, timeZone, note: row.note, location: row.location,
    attachment: event.occurrence?.status !== "cancelled" && row.fileName && row.byteSize
      ? { fileName: row.fileName, byteSize: row.byteSize } : null,
    ...(row.series && {
      series: {
        frequency: row.series.frequency, interval: row.series.interval, until: row.series.until,
        timeZone: row.series.timeZone, canEdit: row.authorId === actor,
      },
    }),
  };
}

function scheduleDay(schedule: Schedule, timeZone: string) {
  if (schedule.allDay) return Temporal.PlainDate.from(schedule.start);
  return Temporal.Instant.from(schedule.start).toZonedDateTimeISO(timeZone).toPlainDate();
}

function attachmentName(name: string) {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  const original = !decoded.includes("\ufffd") ? decoded : name;
  const cleaned = original.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return Array.from(cleaned).slice(0, 180).join("") || "Attachment";
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: AttachmentStorageService,
    private readonly jobs: JobsService,
  ) {}

  list(actor: string, familyId: string, start?: string, end?: string): Promise<EventRangeDto> {
    return this.database.withActor(actor, async (client) => {
      const timeZone = await this.getFamilyTimeZone(client, familyId);
      const range = calendarRange(timeZone, start, end);
      const changes = await changesForRange(client, familyId, range);
      const { rows } = await client.query<EventRow>(`
        select ${scheduleFields}, ${seriesFields} from app.calendar_events e
        where e.family_id = $1 and (
          (e.repeat_frequency is null and (
            (e.start_date < $3::date and e.end_date > $2::date)
            or (e.starts_at < $5::timestamptz and e.ends_at > $4::timestamptz)
          ))
          or (e.repeat_frequency is not null
            and e.repeat_start::date <= $3::date + $6::int
            and e.repeat_until >= $2::date - (e.repeat_end::date - e.repeat_start::date + $6::int))
          or e.id = any($7::uuid[])
        )
      `, [familyId, range.start, range.end, range.startsAt, range.endsAt, zoneMargin, [...changes.keys()]]);
      const events = rows.flatMap((row) => expandEvent(row, range, changes.get(row.id)))
        .map((event) => ({ event, order: scheduleSortKey(event, timeZone) }))
        .sort((a, b) => a.order.localeCompare(b.order))
        .map(({ event }) => event);
      return { timeZone, start: range.start, end: range.end, events };
    });
  }

  defaults(actor: string, familyId: string) {
    return this.database.withActor(actor, async (client) => {
      await this.getFamilyTimeZone(client, familyId);
      return { audience: await this.defaultAudience(client) };
    });
  }

  preview(actor: string, familyId: string, input: RecurrencePreviewInputDto) {
    return this.database.withActor(actor, async (client) => {
      const zone = await this.getFamilyTimeZone(client, familyId);
      return previewSeries(validateSeries(input, input.recurrence, zone));
    });
  }

  get(actor: string, familyId: string, eventId: string, occurrence?: string) {
    return this.database.withActor(actor, async (client) => {
      const timeZone = await this.getFamilyTimeZone(client, familyId);
      const row = await this.find(client, familyId, eventId);
      if (!row) throw new NotFoundException("Event not found.");
      const event = await this.resolveSummary(client, row, occurrence);
      return detail(row, event, timeZone, actor);
    });
  }

  async create(actor: string, familyId: string, input: EventInput, file?: EventFile) {
    if (file && !file.size) throw new BadRequestException("Choose a nonempty attachment.");
    let objectKey: string | undefined;
    let attachmentRecorded = false;
    let queued = false;
    try {
      return await this.database.withActor(actor, async (client) => {
        const timeZone = await this.getFamilyTimeZone(client, familyId);
        const existing = await this.find(client, familyId, input.id);
        if (existing) return this.savedByActor(client, existing, actor, timeZone);

        const dates = eventSchedule(input, timeZone);
        const series = input.recurrence ? validateSeries(input, input.recurrence, timeZone) : undefined;
        const audience = input.audience ?? await this.defaultAudience(client);
        const selected = [...new Set(input.selectedMemberIds ?? [])];
        const { rows: [validation] } = await client.query<{ allowed: boolean }>(
          "select app.can_set_family_item_audience($1, $2, $3) as allowed", [familyId, audience, selected],
        );
        if (!validation.allowed) throw new BadRequestException("Choose current family members for a selected audience.");

        const inserted = await client.query(`
          insert into app.calendar_events (id, family_id, author_id, title, note, location, audience, selected_member_ids,
            start_date, end_date, starts_at, ends_at,
            repeat_frequency, repeat_interval, repeat_until, repeat_time_zone, repeat_start, repeat_end,
            remind_minutes, remind_audience)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          on conflict (id) do nothing
        `, [input.id, familyId, actor, input.title, input.note, input.location, audience, selected,
          dates.startDate, dates.endDate, dates.startsAt, dates.endsAt,
          series?.frequency, series?.interval, series?.until, series?.timeZone, series?.start, series?.end,
          input.remindMinutes ?? null, input.remindAudience ?? "me"]);
        if (!inserted.rowCount) return this.savedByActor(client, await this.find(client, familyId, input.id), actor, timeZone);

        if (file) {
          objectKey = familyId + "/" + input.id + "/" + randomUUID();
          await this.storage.upload(objectKey, file.buffer);
          await client.query(
            "insert into app.event_attachments (event_id, object_key, file_name, byte_size) values ($1, $2, $3, $4)",
            [input.id, objectKey, attachmentName(file.originalname), file.size],
          );
        }

        const saved = await this.savedByActor(client, await this.find(client, familyId, input.id), actor, timeZone);
        if (input.remindMinutes !== undefined && input.remindMinutes !== null) {
          await queueReminderPlan(client, familyId, "event", input.id, actor);
          queued = true;
        }
        attachmentRecorded = !!objectKey;
        return saved;
      });
    } catch (error) {
      // A lost response to COMMIT leaves an ambiguous outcome. Preserve objects that may already be linked.
      if (objectKey && !attachmentRecorded) await this.storage.discard(objectKey);
      if ((error as { code?: string }).code === "42501") {
        throw new NotFoundException("The family or selected audience has changed. Reload and try again.");
      }
      throw error;
    } finally {
      if (queued) await this.jobs.notify();
    }
  }

  async changeOccurrence(actor: string, familyId: string, eventId: string, originalDate: string, input: OccurrenceChange) {
    let queued = false;
    try {
      return await this.database.withActor(actor, async (client) => {
        const timeZone = await this.getFamilyTimeZone(client, familyId);
        const row = await this.find(client, familyId, eventId);
        if (!row?.series) throw new NotFoundException("Occurrence not found.");
        const original = this.originalOccurrence(row.series, originalDate);
        if (row.authorId !== actor) throw new ForbiddenException("Only the event creator can change an occurrence.");

        let dates: ReturnType<typeof eventSchedule> | null = null;
        if (input.action === "move") {
          const validated = scheduleInput.safeParse({ allDay: original.allDay, start: input.start, end: input.end });
          if (!validated.success) throw new BadRequestException("Enter dates or times that match this occurrence.");
          dates = eventSchedule(validated.data, row.series.timeZone);
        }
        const previous = await readOccurrenceChange(client, eventId, originalDate);
        const change = await writeOccurrenceChange(client, eventId, originalDate, dates);
        if (!change) throw new ConflictException("This occurrence has already been cancelled.");
        const result = detail(row, occurrenceSummary(row, originalDate, original, change), timeZone, actor);
        // Moving or cancelling an occurrence changes when its reminders should fire.
        await queueReminderPlan(client, familyId, "event", eventId, row.authorId);
        // People with a reminder for it, or a task linked to it, hear about the change.
        const shown = input.action === "move" ? changedSchedule(change)! : original;
        await queueChangeNotice(client, familyId, {
          kind: input.action === "move" ? "moved" : "cancelled", sourceKind: "event", sourceId: eventId,
          occurrenceKey: originalDate, occurrenceRecipients: true, actorId: actor,
          dueAt: shown.allDay ? localInstant(shown.start, dayStart, timeZone).toString() : shown.start,
        });
        queued = true;
        if (input.action !== "move" || !input.shiftLinkedTasks?.length) return result;

        // Linked tasks move by the same number of days as the occurrence's start date in the series time zone.
        const before = previous && !previous.cancelled ? changedSchedule(previous) ?? original : original;
        const days = scheduleDay(before, row.series.timeZone).until(scheduleDay(changedSchedule(change)!, row.series.timeZone)).days;
        const shifted = await client.query(`
          update app.tasks t set due_date = t.due_date + $5::int,
            due_at = case when t.due_at is null then null
              else ((t.due_at at time zone f.time_zone) + make_interval(days => $5::int)) at time zone f.time_zone end
          from app.families f, unnest($6::uuid[], $7::int[]) as s(id, version)
          where f.id = t.family_id and t.id = s.id and t.version = s.version and t.family_id = $1 and t.event_id = $2
            and t.event_occurrence_date = $3::date and t.author_id = $4 and t.archived_at is null and t.due_date is not null
        `, [familyId, eventId, originalDate, actor, days,
          input.shiftLinkedTasks.map(({ id }) => id), input.shiftLinkedTasks.map(({ version }) => version)]);
        if (shifted.rowCount !== input.shiftLinkedTasks.length) {
          throw new ConflictException("A linked task changed or can no longer move. Reload and try again.");
        }
        const { rows: moved } = await client.query<{ id: string; seriesId: string | null }>(
          'select id, series_id as "seriesId" from app.tasks where id = any($1::uuid[])',
          [input.shiftLinkedTasks.map(({ id }) => id)]);
        for (const task of moved) {
          await queueReminderPlan(client, familyId, task.seriesId ? "task_series" : "task", task.seriesId ?? task.id, actor);
        }
        return { ...result, shiftedTaskCount: shifted.rowCount };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new NotFoundException("Occurrence not found.");
      throw error;
    } finally {
      if (queued) await this.jobs.notify();
    }
  }

  async download(actor: string, familyId: string, eventId: string, occurrence?: string) {
    const attachment = await this.database.withActor(actor, async (client) => {
      const row = await this.find(client, familyId, eventId);
      if (!row?.objectKey || !row.fileName) throw new NotFoundException("Attachment not found.");
      const event = await this.resolveSummary(client, row, occurrence);
      if (event.occurrence?.status === "cancelled") throw new NotFoundException("Attachment not found.");
      return { objectKey: row.objectKey, fileName: row.fileName };
    });
    return this.storage.download(attachment.objectKey, attachment.fileName);
  }

  private async getFamilyTimeZone(client: PoolClient, familyId: string) {
    const { rows: [family] } = await client.query<{ timeZone: string }>(
      'select time_zone as "timeZone" from app.families where id = $1', [familyId],
    );
    if (!family) throw new NotFoundException("Family workspace not found.");
    return familyTimeZone(family.timeZone);
  }

  private async defaultAudience(client: PoolClient) {
    const { rows: [row] } = await client.query<{ audience: ItemAudience }>(
      "select app.default_family_item_audience('calendar') as audience",
    );
    return row.audience;
  }

  private async find(client: PoolClient, familyId: string, eventId: string) {
    const { rows: [row] } = await client.query<DetailRow>(`
      select ${scheduleFields}, ${seriesFields}, e.author_id as "authorId", e.note, e.location,
        a.file_name as "fileName", a.byte_size as "byteSize", a.object_key as "objectKey"
      from app.calendar_events e left join app.event_attachments a on a.event_id = e.id
      where e.family_id = $1 and e.id = $2
    `, [familyId, eventId]);
    return row;
  }

  private async savedByActor(client: PoolClient, row: DetailRow | undefined, actor: string, timeZone: string) {
    if (!row || row.authorId !== actor) throw new ConflictException("The event could not be saved. Reload and try again.");
    return detail(row, await this.resolveSummary(client, row), timeZone, actor);
  }

  private originalOccurrence(series: Series, key: string) {
    if (!dateInput.safeParse(key).success) throw new BadRequestException("Use an occurrence date in YYYY-MM-DD format.");
    const occurrence = seriesOccurrence(series, key);
    if (!occurrence) throw new NotFoundException("Occurrence not found.");
    return occurrence;
  }

  private async resolveSummary(client: PoolClient, row: EventRow, requested?: string): Promise<EventSummaryDto> {
    if (!row.series) {
      if (requested !== undefined) throw new NotFoundException("Occurrence not found.");
      return summary(row);
    }
    const originalDate = requested ?? row.series.start.slice(0, 10);
    const original = this.originalOccurrence(row.series, originalDate);
    const change = await readOccurrenceChange(client, row.id, originalDate);
    return occurrenceSummary(row, originalDate, original, change);
  }
}
