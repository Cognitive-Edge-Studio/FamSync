import { eventDays, eventKey, shiftDay, type EventSummary } from "@famsync/core/calendar-date";

/** Splits a week of events into today's and the following seven days, by the family's calendar days. */
export function agenda(events: EventSummary[], timeZone: string, today: string) {
  const dated = events.map((event) => ({ event, ...eventDays(event, timeZone) }));
  const on = (day: string) => dated.filter(({ first, last }) => first <= day && day <= last).map(({ event }) => event);
  const upcoming = Array.from({ length: 7 }, (_, index) => shiftDay(today, index + 1)).map((date) => ({ date, events: on(date) })).filter(({ events }) => events.length > 0);
  return { today: on(today), upcoming, upcomingCount: new Set(upcoming.flatMap(({ events }) => events.map(eventKey))).size };
}
