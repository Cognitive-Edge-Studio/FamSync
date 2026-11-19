import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { repeatDates } from "./calendar-recurrence.js";

type PendingSeries = {
  id: string;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  start: string;
  until: string | null;
  generatedThrough: string | null;
};

// Dates still to create for a series, from the day after the last generated date through `today`.
export function pendingDates(series: Omit<PendingSeries, "id">, today: string) {
  const from = series.generatedThrough
    ? Temporal.PlainDate.from(series.generatedThrough).add({ days: 1 }).toString() : series.start;
  const to = series.until && series.until < today ? series.until : today;
  if (from > to) return [];
  return repeatDates(series, from, to);
}

// Creates missing chore occurrences through today for every series the caller can see.
// Each viewer generates the series they can see, so their lists and counts include those rows.
export async function generateOccurrences(client: PoolClient, familyId: string, today: string) {
  const { rows } = await client.query<PendingSeries>(`
    select id, frequency, repeat_interval as interval, start_date::text as start, until::text as until,
      generated_through::text as "generatedThrough"
    from app.task_series
    where family_id = $1 and archived_at is null and start_date <= $2::date
      and (generated_through is null or generated_through < $2::date)
    order by id
  `, [familyId, today]);
  for (const series of rows) await generateSeries(client, series, today);
}

export async function generateSeries(client: PoolClient, series: PendingSeries, today: string) {
  await client.query("select app.generate_task_occurrences($1, $2::date, $3::date[])",
    [series.id, today, pendingDates(series, today)]);
}
