"use client";

import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { ArrowRight } from "lucide-react";
import { ModuleIcon, type ModuleIconName } from "./ui/module-icon";
import { audienceLabels, calendarPath, dayInZone, eventDays, eventKey, eventPath, eventTime, formatDay, shiftDay, type EventSummary } from "@/lib/calendar-date";
import { AppShell } from "./app-shell";
import { FormFeedback } from "./account-fields";
import { FamilySession, familyPath } from "./family-session";
import { ScheduleFamily, useEventRange } from "./schedule-family";
import { TodayTasks, useTodayTasks } from "./today-tasks";
import { Button, ButtonLink } from "./ui/button";
import { TodayGoals } from "./today-goals";
import { Badge } from "./ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { PageHeader } from "./ui/page-header";
import { FadeIn } from "./ui/motion";
import { cn } from "@/lib/utils";
import { FamilyProgressCard } from "./family-progress-card";

type Family = components["schemas"]["FamilyDto"];

type Tone = "sky" | "lavender" | "sage" | "peach" | "rose";
const toneClass: Record<Tone, string> = {
  sky: "bg-sky text-sky-foreground", lavender: "bg-lavender text-lavender-foreground", sage: "bg-sage text-sage-foreground",
  peach: "bg-peach text-peach-foreground", rose: "bg-rose text-rose-foreground",
};

function SummaryCard({ label, value, note, icon, tone, index }: {
  index: number;
  label: string;
  value: string;
  note: string;
  icon: ModuleIconName;
  tone: Tone;
}) {
  return (
    <FadeIn index={index + 1} className="rounded-2xl border border-border bg-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl leading-8 font-medium">{value}</p>
        </div>
        <span className={cn("grid size-10 place-items-center rounded-full", toneClass[tone])}>
          <ModuleIcon name={icon} className="size-9" />
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </FadeIn>
  );
}

function EventRow({ event, familyId, timeZone, day }: { event: EventSummary; familyId: string; timeZone: string; day: string }) {
  return (
    <li>
      <a href={eventPath(familyId, event.id, event.occurrence?.originalDate)}
        className="flex min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky text-sky-foreground">
          <ModuleIcon name="schedule" className="size-7" />
        </span>
        <span className="min-w-0 grow">
          <span className="block text-sm font-medium wrap-anywhere">{event.title}</span>
          <span className="block text-xs text-muted-foreground">
            {eventTime(event, timeZone, day)} <span aria-hidden="true">·</span> {audienceLabels[event.audience]}
          </span>
        </span>
      </a>
    </li>
  );
}

function TodayDashboard({ family, session }: { family: Family; session: Session }) {
  const today = dayInZone(new Date(), family.timeZone);
  const weekEnd = shiftDay(today, 8);
  const { range, error, retry } = useEventRange(session.access_token, family.id, today, weekEnd);
  const tasks = useTodayTasks(session.access_token, family.id);
  const summary = tasks.summary.summary;
  const timeZone = range?.timeZone ?? family.timeZone;
  const datedEvents = (range?.events ?? []).map((event) => ({ event, ...eventDays(event, timeZone) }));
  const todayEvents = datedEvents
    .filter(({ first, last }) => first <= today && today <= last)
    .map(({ event }) => event);
  const upcoming = Array.from({ length: 7 }, (_, index) => shiftDay(today, index + 1))
    .map((date) => ({
      date,
      events: datedEvents
        .filter(({ first, last }) => first <= date && date <= last)
        .map(({ event }) => event),
    }))
    .filter(({ events }) => events.length > 0);

  const upcomingCount = new Set(upcoming.flatMap(({ events }) => events.map(eventKey))).size;

  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title="Today" description={formatDay(today)} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryCard index={0} label="Today’s plans" value={range && !error ? String(todayEvents.length) : "–"} note={error ? "schedule unavailable" : "events on your schedule"} icon="calendar" tone="sky" />
        <SummaryCard index={1} label="Next 7 days" value={range && !error ? String(upcomingCount) : "–"} note={error ? "schedule unavailable" : "events after today"} icon="schedule" tone="lavender" />
        <SummaryCard index={2} label={tasks.scope === "mine" ? "My open tasks" : "Family open tasks"} value={summary && !tasks.summary.error ? String(summary.todo + summary.inProgress) : "–"}
          note={tasks.summary.error ? "task totals unavailable" : tasks.scope === "mine" ? "for you, not yet done" : "for the family, not yet done"} icon="tasks" tone="sage" />
        <SummaryCard index={3} label={tasks.scope === "mine" ? "My overdue tasks" : "Family overdue tasks"} value={summary && !tasks.summary.error ? String(summary.overdue) : "–"}
          note={tasks.summary.error ? "task totals unavailable" : tasks.scope === "mine" ? "yours past their due time" : "past their due time"} icon="overdue" tone={summary?.overdue ? "rose" : "peach"} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <FamilyProgressCard familyId={family.id} accessToken={session.access_token} today={today} timeZone={timeZone} taskRevision={tasks.revision} />
        <Card aria-labelledby="today-schedule-title">
          <CardHeader>
            <div>
              <CardTitle id="today-schedule-title">Family agenda</CardTitle>
              <CardDescription>{formatDay(today)}</CardDescription>
            </div>
            {range && <Badge tone="sky">{todayEvents.length} today</Badge>}
          </CardHeader>
          {error ? (
            <div className="flex flex-wrap items-center gap-3">
              <FormFeedback error={error} />
              <Button variant="outline" onClick={retry}>Try again</Button>
            </div>
          ) : !range ? (
            <FormFeedback note="Loading your schedule…" />
          ) : todayEvents.length === 0 ? (
            <EmptyState icon="calendar" tone="sky" title="Nothing scheduled for today">Your family’s plans will show up here.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {todayEvents.map((event) => <EventRow key={eventKey(event)} event={event} familyId={family.id} timeZone={timeZone} day={today} />)}
            </ul>
          )}
          <div className="mt-5 mb-3 border-t border-border pt-4"><h3 id="upcoming-title" className="text-sm font-semibold">Next 7 days</h3><p className="mt-1 text-xs text-muted-foreground">Starting tomorrow</p></div>
          {error ? (
            <FormFeedback note="Upcoming events are unavailable until your schedule loads." />
          ) : !range ? (
            <FormFeedback note="Loading upcoming events…" />
          ) : upcoming.length === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-5 text-sm text-muted-foreground">No events planned for the next seven days.</p>
          ) : (
            <div className="grid gap-4">
              {upcoming.map(({ date, events }) => (
                <div key={date} className="grid content-start gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatDay(date)}</h3>
                  <ul className="grid gap-2">
                    {events.map((event) => <EventRow key={eventKey(event)} event={event} familyId={family.id} timeZone={timeZone} day={date} />)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <ButtonLink href={calendarPath(family.id, today)} variant="outline" className="gap-2">See calendar<ArrowRight aria-hidden="true" /></ButtonLink>
            <ButtonLink href={familyPath(family.id)} variant="ghost" className="gap-2"><ModuleIcon name="families" />Manage family</ButtonLink>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <TodayTasks familyId={family.id} state={tasks} />
        <TodayGoals familyId={family.id} accessToken={session.access_token} />
      </div>
    </div>
  );
}

export function TodayScreen() {
  return (
    <AppShell activePage="today">
      <div className="grid gap-5 pb-4">
        <FamilySession>
          {(session) => (
            <ScheduleFamily key={session.user.id} session={session} section="today">
              {(family) => <TodayDashboard key={family.id} family={family} session={session} />}
            </ScheduleFamily>
          )}
        </FamilySession>
      </div>
    </AppShell>
  );
}
