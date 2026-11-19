"use client";


import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { audienceLabels, civilDate, dayInZone, eventDays, eventKey, formatDay, shiftDay, shiftMonth, type EventSummary } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";
import { takeCreateRequest } from "@/lib/quick-create";
import { FormFeedback } from "./account-fields";
import { AppShell } from "./app-shell";
import { EventCreateDialog } from "./event-create-dialog";
import { EventList } from "./event-list";
import { FamilySession } from "./family-session";
import { ScheduleFamily, useEventRange } from "./schedule-family";
import { Button } from "./ui/button";
import { PageHeader } from "./ui/page-header";
import { Segmented } from "./ui/segmented";

type Family = components["schemas"]["FamilyDto"];
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormat.format(civilDate(shiftDay("2024-01-01", index))));

// Event colour follows who can see it; the legend and each event's own audience label carry the same meaning in words.
const audienceTones = { family: "bg-sky text-sky-foreground", selected: "bg-lavender text-lavender-foreground", private: "bg-peach text-peach-foreground" } as const;
const audienceDots = { family: "bg-sky-foreground", selected: "bg-lavender-foreground", private: "bg-peach-foreground" } as const;

function initialDay(today: string) {
  const requested = new URLSearchParams(window.location.search).get("date");
  if (requested && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(requested)) {
    const date = civilDate(requested);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === requested) return requested;
  }
  return today;
}

function monthStart(day: string) {
  return day.slice(0, 7) + "-01";
}

function Calendar({ family, session }: { family: Family; session: Session }) {
  const today = dayInZone(new Date(), family.timeZone);
  const [day, setDay] = useState(() => initialDay(today));
  const [month, setMonth] = useState(() => monthStart(day));
  const [view, setView] = useState<"month" | "agenda">(
    () => window.matchMedia("(min-width: 640px)").matches ? "month" : "agenda",
  );
  const [creating, setCreating] = useState(() => takeCreateRequest("event"));
  const createButton = useRef<HTMLButtonElement>(null);
  const mondayOffset = (civilDate(month).getUTCDay() + 6) % 7;
  const start = shiftDay(month, -mondayOffset);
  const end = shiftDay(start, 42);
  const { range, error, retry } = useEventRange(session.access_token, family.id, start, end);
  const timeZone = range?.timeZone ?? family.timeZone;
  const events = (range?.start === start ? range.events : []).map((event) => ({ event, ...eventDays(event, timeZone) }));
  const cells = Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
  const nextMonth = shiftMonth(month, 1);
  const monthLabel = monthFormat.format(civilDate(month));
  function forDay(date: string): EventSummary[] {
    return events.filter(({ first, last }) => first <= date && date <= last).map(({ event }) => event);
  }
  const agenda = cells
    .filter((date) => month <= date && date < nextMonth)
    .map((date) => ({ date, events: forDay(date) })).filter((group) => group.events.length > 0);

  function moveMonth(offset: number) {
    const target = shiftMonth(month, offset);
    setMonth(target);
    setDay(target === monthStart(today) ? today : target);
  }

  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title="Calendar" description={timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone ? <span className="wrap-anywhere">Times in {timeZone.replaceAll("_", " ")}</span> : undefined}
        actions={<Button ref={createButton} className="gap-2" onClick={() => setCreating(true)}><Plus aria-hidden="true" />New event</Button>} />
      <section className="overflow-hidden rounded-2xl border border-border bg-panel" aria-label="Family calendar">
        <div className="grid grid-cols-[auto_auto] items-center justify-between gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:p-5">
          <div className="flex gap-1">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button variant="outline" className="ml-1" onClick={() => { setDay(today); setMonth(monthStart(today)); }}>
              Today
            </Button>
          </div>
          <h2 className="order-first col-span-2 text-lg font-semibold sm:order-none sm:col-span-1 sm:text-center" aria-live="polite">{monthLabel}</h2>
          <Segmented className="justify-self-end" label="Calendar view" value={view} onChange={setView}
            options={[{ value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }]} />
        </div>
        <ul aria-label="Event colours" className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-muted-foreground sm:px-5">
          {(["family", "selected", "private"] as const).map((audience) => (
            <li key={audience} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2.5 rounded-sm", audienceDots[audience])} />{audienceLabels[audience]}
            </li>
          ))}
        </ul>
        {view === "month" && (
          <div className="grid grid-cols-7 border-t border-border">
            {weekdays.map((label, index) => (
              <div key={index} className="p-1.5 text-center text-xs font-medium text-muted-foreground sm:p-2">{label}</div>
            ))}
            {cells.map((date) => {
              const items = forDay(date);
              return (
                <button key={date} type="button" aria-pressed={date === day} aria-current={date === today ? "date" : undefined}
                  aria-label={formatDay(date) + ", " + items.length + (items.length === 1 ? " event" : " events")}
                  className={cn(
                    "grid min-h-12 min-w-0 content-start gap-1 border-t border-border px-1 py-1.5 text-left focus-visible:z-10 sm:min-h-22 sm:p-2",
                    "border-r nth-[7n]:border-r-0 hover:bg-muted/60", date === day && "bg-muted",
                    date.slice(0, 7) !== month.slice(0, 7) && "text-muted-foreground",
                  )}
                  onClick={() => setDay(date)}>
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold",
                    date === today && "bg-primary text-primary-foreground")}>{Number(date.slice(-2))}</span>
                  {items.length > 0 && <span className={cn("ml-2 size-1.5 rounded-full sm:hidden", audienceDots[items[0].audience])} />}
                  {items.slice(0, 2).map((item) => (
                    <span key={eventKey(item)} className={cn("hidden min-w-0 truncate rounded-md px-1.5 py-0.5 text-xs font-medium sm:block", audienceTones[item.audience])}>
                      {item.title}
                    </span>
                  ))}
                  {items.length > 2 && <span className="hidden text-xs text-muted-foreground sm:block">+{items.length - 2} more</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-4 border-t border-border p-4 sm:p-5">
          {error && (
            <div className="flex flex-wrap items-center gap-3">
              <FormFeedback error={error} />
              <Button variant="outline" onClick={retry}>Try again</Button>
            </div>
          )}
          {!range && !error && <FormFeedback note="Loading events…" />}
          {range && view === "month" && (
            <>
              <h3 className="text-base font-semibold">{formatDay(day)}</h3>
              <EventList events={forDay(day)} familyId={family.id} timeZone={timeZone} day={day} />
            </>
          )}
          {range && view === "agenda" && !agenda.length && <p className="text-sm text-muted-foreground">No events this month.</p>}
          {range && view === "agenda" && agenda.map((group) => (
            <div className="grid gap-2" key={group.date}>
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatDay(group.date)}</h3>
              <EventList events={group.events} familyId={family.id} timeZone={timeZone} day={group.date} />
            </div>
          ))}
        </div>
      </section>
      {creating && <EventCreateDialog family={family} accessToken={session.access_token} day={day}
        userId={session.user.id} trigger={createButton} onClose={() => setCreating(false)} />}
    </div>
  );
}

export function CalendarScreen() {
  return (
    <AppShell activePage="calendar">
      <div className="pb-4">
        <FamilySession>
          {(session) => (
            <ScheduleFamily key={session.user.id} session={session} section="calendar">
              {(family) => <Calendar key={family.id} family={family} session={session} />}
            </ScheduleFamily>
          )}
        </FamilySession>
      </div>
    </AppShell>
  );
}
