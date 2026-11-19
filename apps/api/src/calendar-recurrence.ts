import { Temporal } from "@js-temporal/polyfill";
import { BadRequestException } from "@nestjs/common";
import type { PreviewOccurrenceDto, RecurrenceRule } from "./calendar.dto.js";
import { eventSchedule, type calendarRange, type Schedule } from "./calendar-time.js";

export type Series = Schedule & RecurrenceRule & { timeZone: string };
export type DateRange = ReturnType<typeof calendarRange>;
type Occurrence = Schedule & { originalDate: string };

const compareDates = Temporal.PlainDate.compare;
const previewLimit = 8;
// A civil date can differ by two days between the family and series time zones.
export const zoneMargin = 2;

export function validateSeries(schedule: Schedule, recurrence: RecurrenceRule, timeZone: string): Series {
  if (recurrence.until < schedule.start.slice(0, 10)) {
    throw new BadRequestException("The repeat end date must be on or after the first occurrence.");
  }
  return { ...schedule, ...recurrence, timeZone };
}

function datesOf(series: Series) {
  return {
    anchor: Temporal.PlainDate.from(series.start.slice(0, 10)),
    until: Temporal.PlainDate.from(series.until),
    end: Temporal.PlainDate.from(series.end.slice(0, 10)),
  };
}

function monthNumber(date: Temporal.PlainDate) {
  return date.year * 12 + date.month - 1;
}

function* matchingDates(series: Series, from: Temporal.PlainDate, to: Temporal.PlainDate) {
  const { anchor, until } = datesOf(series);
  const lower = compareDates(anchor, from) > 0 ? anchor : from;
  const upper = compareDates(until, to) < 0 ? until : to;
  if (compareDates(lower, upper) > 0) return;

  if (series.frequency === "monthly") {
    const firstMonth = monthNumber(anchor);
    const minimum = monthNumber(lower) - firstMonth;
    const maximum = monthNumber(upper) - firstMonth;
    for (let offset = Math.ceil(minimum / series.interval) * series.interval; offset <= maximum; offset += series.interval) {
      const month = anchor.with({ day: 1 }).add({ months: offset });
      if (anchor.day > month.daysInMonth) continue;
      const date = month.with({ day: anchor.day });
      if (compareDates(date, lower) >= 0 && compareDates(date, upper) <= 0) yield date;
    }
    return;
  }

  const step = series.interval * (series.frequency === "weekly" ? 7 : 1);
  const minimum = anchor.until(lower).days;
  const maximum = anchor.until(upper).days;
  for (let offset = Math.ceil(minimum / step) * step; offset <= maximum; offset += step) {
    yield anchor.add({ days: offset });
  }
}

// Dates of a date-only rule between `from` and `to`, inclusive. Chores use this with an optional end date.
export function repeatDates(
  rule: Pick<RecurrenceRule, "frequency" | "interval"> & { start: string; until: string | null }, from: string, to: string,
) {
  const series: Series = {
    allDay: true, start: rule.start, end: rule.start, timeZone: "UTC",
    frequency: rule.frequency, interval: rule.interval, until: rule.until ?? to,
  };
  return [...matchingDates(series, Temporal.PlainDate.from(from), Temporal.PlainDate.from(to))].map((date) => date.toString());
}

function buildOccurrence(series: Series, date: Temporal.PlainDate): Occurrence | undefined {
  const { anchor, end } = datesOf(series);
  const originalDate = date.toString();
  const endDate = date.add({ days: anchor.until(end).days });
  if (series.allDay) return { originalDate, allDay: true, start: originalDate, end: endDate.toString() };

  const localStart = date.toPlainDateTime(Temporal.PlainTime.from(series.start.slice(11)));
  const localEnd = endDate.toPlainDateTime(Temporal.PlainTime.from(series.end.slice(11)));
  const zonedStart = localStart.toZonedDateTime(series.timeZone);
  // Skip nonexistent local starts. For repeated times Temporal's compatible mode picks the earlier instant.
  if (!zonedStart.toPlainDateTime().equals(localStart)) return;
  const start = zonedStart.toInstant();
  const finish = localEnd.toZonedDateTime(series.timeZone).toInstant();
  if (Temporal.Instant.compare(finish, start) <= 0) return;
  return {
    originalDate, allDay: false, start: start.toString({ fractionalSecondDigits: 3 }),
    end: finish.toString({ fractionalSecondDigits: 3 }),
  };
}

export function seriesOccurrence(series: Series, originalDate: string) {
  const date = Temporal.PlainDate.from(originalDate);
  const match = matchingDates(series, date, date).next().value;
  return match ? buildOccurrence(series, match) : undefined;
}

export function* occurrencesInRange(series: Series, range: DateRange) {
  const { anchor, end } = datesOf(series);
  const from = Temporal.PlainDate.from(range.start).subtract({ days: anchor.until(end).days + zoneMargin });
  const to = Temporal.PlainDate.from(range.end).add({ days: zoneMargin });
  for (const date of matchingDates(series, from, to)) {
    const occurrence = buildOccurrence(series, date);
    if (occurrence) yield occurrence;
  }
}

export function scheduleOverlaps(schedule: Schedule, range: DateRange) {
  if (schedule.allDay) return schedule.start < range.end && schedule.end > range.start;
  return Temporal.Instant.compare(schedule.start, range.endsAt) < 0
    && Temporal.Instant.compare(schedule.end, range.startsAt) > 0;
}

export function previewSeries(series: Series) {
  eventSchedule(series, series.timeZone);
  const { anchor, until } = datesOf(series);
  const occurrences: PreviewOccurrenceDto[] = [];
  for (const date of matchingDates(series, anchor, until)) {
    const occurrence = buildOccurrence(series, date);
    if (!occurrence) continue;
    if (occurrences.length === previewLimit) return { timeZone: series.timeZone, occurrences, hasMore: true };
    const { originalDate, start, end } = occurrence;
    occurrences.push({ originalDate, start, end });
  }
  return { timeZone: series.timeZone, occurrences, hasMore: false };
}
