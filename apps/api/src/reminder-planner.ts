import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { changedSchedule, seriesFields, type ChangeRow } from "./calendar-occurrence.store.js";
import { occurrencesInRange, repeatDates, type Series } from "./calendar-recurrence.js";
import type { Schedule } from "./calendar-time.js";
import { familyTimeZone } from "./family-time-zone.js";
import { dayStart, dueInstant, localInstant, remindAt } from "./reminder-rules.js";

export type SourceKind = "task" | "task_series" | "event";
export type DesiredReminder = {
  familyId: string;
  occurrenceKey: string;
  recipientId: string;
  remindAt: string;
  dueAt: string;
};
type Window = { from: Temporal.Instant; to: Temporal.Instant };

const inWindow = (instant: Temporal.Instant, { from, to }: Window) =>
  Temporal.Instant.compare(instant, from) >= 0 && Temporal.Instant.compare(instant, to) <= 0;
const iso = (instant: Temporal.Instant) => instant.toString({ fractionalSecondDigits: 3 });

function datesAround(window: Window, timeZone: string, padDays: number) {
  return {
    first: window.from.toZonedDateTimeISO(timeZone).toPlainDate().subtract({ days: padDays }).toString(),
    last: window.to.toZonedDateTimeISO(timeZone).toPlainDate().add({ days: padDays }).toString(),
  };
}

// The reminders a source should have with remind times inside the window. The client acts as the
// source's author, so row-level security applies: an author who left the family gets an empty plan.
export async function desiredReminders(client: PoolClient, kind: SourceKind, id: string, window: Window) {
  if (kind === "task") return taskReminders(client, id, window);
  if (kind === "task_series") return seriesReminders(client, id, window);
  return eventReminders(client, id, window);
}

async function taskReminders(client: PoolClient, id: string, window: Window): Promise<DesiredReminder[]> {
  const { rows: [task] } = await client.query<{
    familyId: string; authorId: string; assigneeId: string | null; status: string; archived: boolean; seriesId: string | null;
    dueDate: string | null; dueAt: Date | null; minutes: number | null; timeZone: string;
  }>(`
    select t.family_id as "familyId", t.author_id as "authorId", t.assignee_id as "assigneeId", t.status,
      t.archived_at is not null as archived, t.series_id as "seriesId", t.due_date::text as "dueDate", t.due_at as "dueAt",
      t.remind_minutes as minutes, f.time_zone as "timeZone"
    from app.tasks t join app.families f on f.id = t.family_id where t.id = $1
  `, [id]);
  // Chore occurrences are planned through their series so keys stay stable before rows exist.
  if (!task || task.seriesId || task.minutes === null || !task.dueDate || task.archived || task.status === "completed") return [];
  const due = dueInstant({ dueDate: task.dueDate, dueAt: task.dueAt?.toISOString() ?? null }, familyTimeZone(task.timeZone));
  const at = remindAt(due, task.minutes);
  if (!inWindow(at, window)) return [];
  return [{ familyId: task.familyId, occurrenceKey: "", recipientId: task.assigneeId ?? task.authorId, remindAt: iso(at), dueAt: iso(due) }];
}

async function seriesReminders(client: PoolClient, id: string, window: Window): Promise<DesiredReminder[]> {
  const { rows: [series] } = await client.query<{
    familyId: string; authorId: string; assigneeId: string | null; archived: boolean; minutes: number | null;
    dueTime: string | null; timeZone: string; frequency: "daily" | "weekly" | "monthly"; interval: number;
    start: string; until: string | null;
  }>(`
    select s.family_id as "familyId", s.author_id as "authorId", s.assignee_id as "assigneeId",
      s.archived_at is not null as archived, s.remind_minutes as minutes, to_char(s.due_time, 'HH24:MI') as "dueTime",
      s.time_zone as "timeZone", s.frequency, s.repeat_interval as interval, s.start_date::text as start, s.until::text as until
    from app.task_series s where s.id = $1
  `, [id]);
  if (!series || series.archived) return [];
  const timeZone = familyTimeZone(series.timeZone);
  // A day of reminder lead time plus slack around the window.
  const { first, last } = datesAround(window, timeZone, 2);
  const { rows: occurrences } = await client.query<{
    date: string; assigneeId: string | null; status: string; archived: boolean; dueAt: Date | null; minutes: number | null;
  }>(`
    select occurrence_date::text as date, assignee_id as "assigneeId", status, archived_at is not null as archived,
      due_at as "dueAt", remind_minutes as minutes
    from app.tasks where series_id = $1 and occurrence_date between $2::date and $3::date
  `, [id, first, last]);
  const rows = new Map(occurrences.map((row) => [row.date, row]));
  const dates = new Set([...repeatDates(series, first, last), ...rows.keys()]);
  const desired: DesiredReminder[] = [];
  for (const date of dates) {
    const row = rows.get(date);
    if (row && (row.archived || row.status === "completed")) continue;
    const minutes = row ? row.minutes : series.minutes;
    if (minutes === null) continue;
    const due = row?.dueAt ? Temporal.Instant.from(row.dueAt.toISOString())
      : localInstant(date, row ? dayStart : series.dueTime ?? dayStart, timeZone);
    const at = remindAt(due, minutes);
    if (!inWindow(at, window)) continue;
    const recipientId = (row ? row.assigneeId : series.assigneeId) ?? series.authorId;
    desired.push({ familyId: series.familyId, occurrenceKey: date, recipientId, remindAt: iso(at), dueAt: iso(due) });
  }
  return desired;
}

async function eventReminders(client: PoolClient, id: string, window: Window): Promise<DesiredReminder[]> {
  const { rows: [event] } = await client.query<{
    familyId: string; authorId: string; audience: "family" | "selected" | "private"; selected: string[];
    minutes: number | null; remindAudience: "me" | "everyone"; timeZone: string; series: Series | null;
    startDate: string | null; startsAt: Date | null;
  }>(`
    select e.family_id as "familyId", e.author_id as "authorId", e.audience, e.selected_member_ids as selected,
      e.remind_minutes as minutes, e.remind_audience as "remindAudience", f.time_zone as "timeZone", ${seriesFields},
      e.start_date::text as "startDate", e.starts_at as "startsAt"
    from app.calendar_events e join app.families f on f.id = e.family_id where e.id = $1
  `, [id]);
  if (!event || event.minutes === null) return [];
  const timeZone = familyTimeZone(event.timeZone);
  const startOf = (schedule: Schedule) => schedule.allDay
    ? localInstant(schedule.start, dayStart, timeZone) : Temporal.Instant.from(schedule.start);

  const starts: { key: string; start: Temporal.Instant }[] = [];
  if (!event.series) {
    starts.push({ key: "", start: event.startsAt ? Temporal.Instant.from(event.startsAt.toISOString())
      : localInstant(event.startDate!, dayStart, timeZone) });
  } else {
    const { rows: changeRows } = await client.query<ChangeRow>(`
      select c.event_id as "eventId", c.original_date::text as "originalDate", c.cancelled,
        c.start_date::text as "startDate", c.end_date::text as "endDate", c.starts_at as "startsAt", c.ends_at as "endsAt"
      from app.calendar_occurrence_changes c where c.event_id = $1
    `, [id]);
    const changes = new Map(changeRows.map((change) => [change.originalDate, change]));
    const { first, last } = datesAround(window, timeZone, 3);
    const range = {
      start: first, end: last,
      startsAt: localInstant(first, "00:00", timeZone).toString(), endsAt: localInstant(last, "00:00", timeZone).toString(),
    };
    for (const occurrence of occurrencesInRange(event.series, range)) {
      const change = changes.get(occurrence.originalDate);
      if (change?.cancelled) continue;
      starts.push({ key: occurrence.originalDate, start: startOf(change ? changedSchedule(change) ?? occurrence : occurrence) });
      changes.delete(occurrence.originalDate);
    }
    // An occurrence moved in from outside the scanned dates still counts at its new time.
    for (const change of changes.values()) {
      const moved = !change.cancelled && changedSchedule(change);
      if (moved) starts.push({ key: change.originalDate, start: startOf(moved) });
    }
  }

  const recipients = event.remindAudience === "me" ? [event.authorId] : (await client.query<{ id: string }>(
    "select app.family_item_viewers($1, $2, $3, $4) as id", [event.familyId, event.authorId, event.audience, event.selected],
  )).rows.map((row) => row.id);
  const desired: DesiredReminder[] = [];
  for (const { key, start } of starts) {
    const at = remindAt(start, event.minutes);
    if (!inWindow(at, window)) continue;
    for (const recipientId of recipients) {
      desired.push({ familyId: event.familyId, occurrenceKey: key, recipientId, remindAt: iso(at), dueAt: iso(start) });
    }
  }
  return desired;
}
