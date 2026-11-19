import type { PoolClient } from "pg";
import { zoneMargin, type DateRange } from "./calendar-recurrence.js";
import type { eventSchedule, Schedule } from "./calendar-time.js";

export const seriesFields = `
  case when e.repeat_frequency is not null then json_build_object(
    'frequency', e.repeat_frequency, 'interval', e.repeat_interval,
    'until', e.repeat_until::text, 'timeZone', e.repeat_time_zone, 'allDay', e.start_date is not null,
    'start', to_char(e.repeat_start, case when e.start_date is not null then 'YYYY-MM-DD' else 'YYYY-MM-DD"T"HH24:MI' end),
    'end', to_char(e.repeat_end, case when e.start_date is not null then 'YYYY-MM-DD' else 'YYYY-MM-DD"T"HH24:MI' end)
  ) end as series
`;

const changeFields = `
  c.event_id as "eventId", c.original_date::text as "originalDate", c.cancelled,
  c.start_date::text as "startDate", c.end_date::text as "endDate", c.starts_at as "startsAt", c.ends_at as "endsAt"
`;
const movedInRange = `
  (c.start_date < $3::date and c.end_date > $2::date)
  or (c.starts_at < $5::timestamptz and c.ends_at > $4::timestamptz)
`;
export type ChangeRow = {
  eventId: string;
  originalDate: string;
  cancelled: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function changedSchedule(change: ChangeRow): Schedule | undefined {
  if (change.startDate && change.endDate) return { allDay: true, start: change.startDate, end: change.endDate };
  if (change.startsAt && change.endsAt) {
    return { allDay: false, start: change.startsAt.toISOString(), end: change.endsAt.toISOString() };
  }
}

export async function changesForRange(client: PoolClient, familyId: string, range: DateRange) {
  const { rows } = await client.query<ChangeRow>(`
    select ${changeFields}
    from app.calendar_occurrence_changes c join app.calendar_events e on e.id = c.event_id
    where e.family_id = $1 and (
      (c.original_date >= $2::date - (e.repeat_end::date - e.repeat_start::date + $6::int)
        and c.original_date < $3::date + ($6::int + 1))
      or (not c.cancelled and (${movedInRange}))
    )
  `, [familyId, range.start, range.end, range.startsAt, range.endsAt, zoneMargin]);
  const changes = new Map<string, Map<string, ChangeRow>>();
  for (const row of rows) {
    const series = changes.get(row.eventId) ?? new Map<string, ChangeRow>();
    series.set(row.originalDate, row);
    changes.set(row.eventId, series);
  }
  return changes;
}

export async function readOccurrenceChange(client: PoolClient, eventId: string, originalDate: string): Promise<ChangeRow | undefined> {
  const { rows: [change] } = await client.query<ChangeRow>(`
    select ${changeFields} from app.calendar_occurrence_changes c
    where c.event_id = $1 and c.original_date = $2
  `, [eventId, originalDate]);
  return change;
}

export async function writeOccurrenceChange(
  client: PoolClient, eventId: string, originalDate: string, dates: ReturnType<typeof eventSchedule> | null,
): Promise<ChangeRow | undefined> {
  const { rows: [change] } = await client.query<ChangeRow>(`
    insert into app.calendar_occurrence_changes as c
      (event_id, original_date, cancelled, start_date, end_date, starts_at, ends_at)
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (event_id, original_date) do update set
      cancelled = excluded.cancelled,
      start_date = case when excluded.cancelled then c.start_date else excluded.start_date end,
      end_date   = case when excluded.cancelled then c.end_date   else excluded.end_date end,
      starts_at  = case when excluded.cancelled then c.starts_at  else excluded.starts_at end,
      ends_at    = case when excluded.cancelled then c.ends_at    else excluded.ends_at end
    where not c.cancelled or excluded.cancelled
    returning ${changeFields}
  `, [eventId, originalDate, dates === null, dates?.startDate, dates?.endDate, dates?.startsAt, dates?.endsAt]);
  return change;
}
