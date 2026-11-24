import type { components } from "@famsync/api-client";

export type EventSummary = components["schemas"]["EventSummaryDto"];
type EventSchedule = Pick<EventSummary, "allDay" | "start" | "end">;

export const audienceLabels = { family: "Family", selected: "Selected members", private: "Only me" };

export function civilDate(iso: string) {
  return new Date(iso + "T00:00:00Z");
}

export function dayInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return [value("year"), value("month"), value("day")].join("-");
}

export function shiftDay(day: string, offset: number) {
  const date = civilDate(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function shiftMonth(first: string, offset: number) {
  const date = civilDate(first);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function formatDay(day: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: "UTC" }).format(civilDate(day));
}

export function eventDays(event: EventSummary, timeZone: string) {
  if (event.allDay) return { first: event.start, last: shiftDay(event.end, -1) };
  return {
    first: dayInZone(new Date(event.start), timeZone),
    last: dayInZone(new Date(Date.parse(event.end) - 1), timeZone),
  };
}

export function eventTime(event: EventSchedule, timeZone: string, day?: string) {
  if (event.allDay) return "All day";
  const format = new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone });
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (!day) return format.format(start) + " – " + format.format(end);
  const starts = dayInZone(start, timeZone) === day;
  const ends = dayInZone(end, timeZone) === day;
  if (starts && ends) return format.format(start) + " – " + format.format(end);
  if (starts) return "From " + format.format(start);
  if (ends) return "Until " + format.format(end);
  return "Continues all day";
}

export function eventKey(event: EventSummary) {
  return event.occurrence ? event.id + ":" + event.occurrence.originalDate : event.id;
}

export function localMinuteInZone(instant: string, timeZone: string) {
  const date = new Date(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
  return dayInZone(date, timeZone) + "T" + time;
}
