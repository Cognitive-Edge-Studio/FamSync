import { Temporal } from "@js-temporal/polyfill";
import { BadRequestException } from "@nestjs/common";
import { dateInput } from "./calendar.dto.js";

export type Schedule = { allDay: boolean; start: string; end: string };

export function calendarRange(timeZone: string, start?: string, end?: string) {
  if (start === undefined && end === undefined) {
    const today = Temporal.Now.plainDateISO(timeZone);
    return dateBounds(timeZone, today, today.add({ days: 1 }));
  }
  const firstDate = dateInput.safeParse(start);
  const lastDate = dateInput.safeParse(end);
  if (!firstDate.success || !lastDate.success) {
    throw new BadRequestException("Provide both range dates in YYYY-MM-DD format.");
  }
  const first = Temporal.PlainDate.from(firstDate.data);
  const last = Temporal.PlainDate.from(lastDate.data);
  const days = first.until(last).days;
  if (days < 1 || days > 42) throw new BadRequestException("Choose a range between 1 and 42 days.");
  return dateBounds(timeZone, first, last);
}

function dateBounds(timeZone: string, first: Temporal.PlainDate, last: Temporal.PlainDate) {
  return {
    start: first.toString(),
    end: last.toString(),
    startsAt: first.toZonedDateTime(timeZone).toInstant().toString(),
    endsAt: last.toZonedDateTime(timeZone).toInstant().toString(),
  };
}

export function eventSchedule(input: Schedule, timeZone: string) {
  const { start, end } = input;
  if (input.allDay) {
    if (start >= end) throw new BadRequestException("The end date must follow the start date.");
    return { startDate: start, endDate: end, startsAt: null, endsAt: null };
  }
  let first: Temporal.Instant;
  let last: Temporal.Instant;
  try {
    first = Temporal.PlainDateTime.from(start).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
    last = Temporal.PlainDateTime.from(end).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
  } catch {
    throw new BadRequestException("Choose valid times in the family time zone. Some times repeat or skip when clocks change.");
  }
  if (Temporal.Instant.compare(first, last) >= 0) {
    throw new BadRequestException("The end time must follow the start time.");
  }
  return { startDate: null, endDate: null, startsAt: first.toString(), endsAt: last.toString() };
}
