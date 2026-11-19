import { Temporal } from "@js-temporal/polyfill";

export const reminderOptions = [0, 15, 60, 1440] as const;
export type ReminderMinutes = typeof reminderOptions[number];
// Date-only tasks and all-day events count their reminder from this local time.
export const dayStart = "08:00";
// A reminder later than this after an outage appears in the app but sends no email.
export const lateEmailLimitMinutes = 120;

// The instant a reminder counts back from. Date-only items use 08:00 in the family time zone.
// "later" matches PostgreSQL: a time in a daylight-saving gap moves forward, and a repeated time uses the later one.
export function localInstant(date: string, time: string, timeZone: string) {
  return Temporal.PlainDateTime.from(date + "T" + time).toZonedDateTime(timeZone, { disambiguation: "later" }).toInstant();
}

export function dueInstant(due: { dueDate: string; dueAt: string | null }, timeZone: string) {
  return due.dueAt ? Temporal.Instant.from(due.dueAt) : localInstant(due.dueDate, dayStart, timeZone);
}

export function remindAt(due: Temporal.Instant, minutes: number) {
  return due.subtract({ minutes });
}

// New tasks get a reminder by default: an hour before a due time, or 08:00 on a date-only due day.
export function defaultTaskReminder(dueDate: string | null | undefined, dueTime: string | null | undefined): ReminderMinutes | null {
  if (!dueDate) return null;
  return dueTime ? 60 : 0;
}

export type QuietHours = { enabled: boolean; start: string; end: string };

// When `now` falls inside quiet hours in the family time zone, returns when they end. Otherwise null.
export function quietHoursEnd(now: Temporal.Instant, quiet: QuietHours, timeZone: string) {
  if (!quiet.enabled || quiet.start === quiet.end) return null;
  const local = now.toZonedDateTimeISO(timeZone);
  const time = local.toPlainTime();
  const start = Temporal.PlainTime.from(quiet.start);
  const end = Temporal.PlainTime.from(quiet.end);
  const overnight = Temporal.PlainTime.compare(start, end) > 0;
  const afterStart = Temporal.PlainTime.compare(time, start) >= 0;
  const beforeEnd = Temporal.PlainTime.compare(time, end) < 0;
  const inside = overnight ? afterStart || beforeEnd : afterStart && beforeEnd;
  if (!inside) return null;
  const endDate = overnight && afterStart ? local.toPlainDate().add({ days: 1 }) : local.toPlainDate();
  return localInstant(endDate.toString(), quiet.end.slice(0, 5), timeZone);
}

export function isLateForEmail(remindAtInstant: Temporal.Instant, now: Temporal.Instant) {
  return Temporal.Instant.compare(now, remindAtInstant.add({ minutes: lateEmailLimitMinutes })) > 0;
}
