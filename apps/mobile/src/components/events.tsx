import { audienceLabels, eventTime, type EventSummary } from "@famsync/core/calendar-date";
import { router } from "expo-router";
import { LinkRow } from "./screen";

export function EventRow({ event, day, timeZone }: { event: EventSummary; day: string; timeZone: string }) {
  const changed = event.occurrence?.status === "moved" ? " · Moved" : "";
  return <LinkRow icon="calendar-clear-outline" title={event.title} note={eventTime(event, timeZone, day) + " · " + audienceLabels[event.audience] + changed}
    onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id, ...(event.occurrence ? { occurrence: event.occurrence.originalDate } : {}) } })} />;
}
