import { ArrowUpRight, Clock3 } from "lucide-react";
import { audienceLabels, eventKey, eventPath, eventTime, type EventSummary } from "@/lib/calendar-date";

const tones = { family: "bg-sky text-sky-foreground", selected: "bg-lavender text-lavender-foreground", private: "bg-peach text-peach-foreground" } as const;

export function EventList({
  events, familyId, timeZone, day, empty = "No events scheduled.",
}: {
  events: EventSummary[];
  familyId: string;
  timeZone: string;
  day: string;
  empty?: string;
}) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {events.map((event) => (
        <li key={eventKey(event)}>
          <a href={eventPath(familyId, event.id, event.occurrence?.originalDate)}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent">
            <span className={"grid size-9 place-items-center rounded-lg " + tones[event.audience]}>
              <Clock3 aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium wrap-anywhere">{event.title}</span>
              <span className="block text-xs text-muted-foreground">
                {eventTime(event, timeZone, day)} <span aria-hidden="true">·</span> {audienceLabels[event.audience]}
              </span>
            </span>
            <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}
