"use client";
import { ModuleIcon } from "./ui/module-icon";

import {WorkMessageSources} from './work-message-sources';

import type { components } from "@famsync/api-client";
import { ArrowLeft, CalendarDays, Download, MapPin, Paperclip, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels, calendarPath, dayInZone, eventDays, formatDay } from "@/lib/calendar-date";
import { FormFeedback } from "./account-fields";
import { AppShell } from "./app-shell";
import type { Session } from "@supabase/auth-js";
import { EventLinkedTasks } from "./event-linked-tasks";
import { EventOccurrenceActions } from "./event-occurrence-actions";
import { FamilySession } from "./family-session";
import { Badge } from "./ui/badge";
import { PageHeader } from "./ui/page-header";

const audienceTones = { family: "sky", selected: "lavender", private: "peach" } as const;
import { Button } from "./ui/button";

type EventDetail = components["schemas"]["EventDetailDto"];

const frequencyLabels = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const frequencyUnits = { daily: "days", weekly: "weeks", monthly: "months" };

function scheduleText(event: EventDetail) {
  const days = eventDays(event, event.timeZone);
  if (event.allDay) {
    return formatDay(days.first) + (days.first === days.last ? " · All day" : " – " + formatDay(days.last) + " · All day");
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  const time = new Intl.DateTimeFormat(undefined, { timeZone: event.timeZone, timeStyle: "short" });
  const endDay = dayInZone(end, event.timeZone);
  return formatDay(days.first) + " · " + time.format(start) + " – "
    + (endDay === days.first ? "" : formatDay(endDay) + " · ") + time.format(end);
}

function EventDetails({ session }: { session: Session }) {
  const accessToken = session.access_token;
  const [linkedRevision, setLinkedRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ details: EventDetail; familyId: string }>();
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search);
    const familyId = query.get("family");
    const eventId = query.get("id");
    const occurrence = query.get("occurrence") ?? undefined;
    setError("");
    async function load() {
      if (!familyId || !eventId) {
        setError("Event not found.");
        return;
      }
      try {
        const { data, response } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/events/{eventId}", {
          params: { path: { familyId, eventId }, query: { occurrence } }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (data) {
          setLoaded({ details: data, familyId });
          return;
        }
        if (response.status === 404 || response.status === 400) {
          setLoaded(undefined);
          setRetryable(false);
          setError("Event not found.");
          return;
        }
        throw new Error("Event unavailable");
      } catch {
        if (!controller.signal.aborted) {
          setRetryable(true);
          setError("We couldn’t open the event.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, revision]);

  async function download() {
    if (!loaded) return;
    setBusy(true);
    setDownloadError("");
    try {
      const { data, response } = await getBrowserApi(accessToken).POST(
        "/api/v1/families/{familyId}/events/{eventId}/attachment/download",
        { params: {
          path: { familyId: loaded.familyId, eventId: loaded.details.id },
          query: { occurrence: loaded.details.occurrence?.originalDate },
        } },
      );
      if (response.status === 404) {
        setDownloadError("This attachment is no longer available.");
        return;
      }
      if (!data) throw new Error("The file is unavailable");
      const link = document.createElement("a");
      link.href = data.url;
      link.rel = "noreferrer";
      link.click();
    } catch {
      setDownloadError("We couldn’t download the attachment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const event = loaded?.details;
  const back = loaded && event ? calendarPath(loaded.familyId, eventDays(event, event.timeZone).first) : "/calendar/";
  return (
    <>
      {(!event || error) && (
        <a href={back} className="mt-6 mb-5 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
          <ArrowLeft className="size-4" aria-hidden="true" />Calendar
        </a>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <FormFeedback error={error} />
          {retryable && <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button>}
        </div>
      )}
      {!event && !error && <FormFeedback note="Loading event…" />}
      {event && !error && (
        <article className="grid gap-5">
          <PageHeader className="mb-0" title={event.title} crumbs={[{ label: "Calendar", href: back }, { label: event.title }]}
            description={
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={audienceTones[event.audience]}>{audienceLabels[event.audience]}</Badge>
                {event.series && <Badge tone="outline"><Repeat aria-hidden="true" className="size-3" />Repeats</Badge>}
                {event.occurrence?.status === "cancelled" && <Badge tone="rose" role="status">Cancelled occurrence</Badge>}
                {event.occurrence?.status === "moved" && (
                  <Badge tone="peach" role="status">Moved occurrence <span aria-hidden="true">·</span> Originally {formatDay(event.occurrence.originalDate)}</Badge>
                )}
              </span>
            } />
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-5 rounded-2xl border border-border bg-panel p-4 sm:p-6 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
              {loaded && event.series?.canEdit && event.occurrence?.status !== "cancelled" && (
                <EventOccurrenceActions event={event} familyId={loaded.familyId} accessToken={accessToken}
                  onSaved={(details) => {
                    setDownloadError("");
                    setLoaded({ familyId: loaded.familyId, details });
                    setLinkedRevision((value) => value + 1);
                  }} />
              )}
              {event.note && (
                <section className="border-t border-border pt-5">
                  <h2 className="mb-2 font-semibold">Note</h2>
                  <p className="wrap-anywhere whitespace-pre-wrap">{event.note}</p>
                </section>
              )}
              {event.attachment && (
                <section className="grid gap-3 border-t border-border pt-5">
                  <h2 className="font-semibold">Attachment</h2>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
                    <span className="flex min-w-0 items-start gap-2">
                      <Paperclip className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="wrap-anywhere text-sm font-medium">{event.attachment.fileName}</span>
                    </span>
                    <Button variant="outline" disabled={busy} onClick={() => void download()}>
                      <Download aria-hidden="true" />{busy ? "Preparing…" : "Download attachment"}
                    </Button>
                  </div>
                  <FormFeedback error={downloadError} />
                </section>
              )}
              {loaded && <EventLinkedTasks session={session} familyId={loaded.familyId} event={event} revision={linkedRevision} />}
              {loaded&&<WorkMessageSources accessToken={session.access_token} familyId={loaded.familyId} kind="event" id={event.id} />}
                </div>
            <aside aria-labelledby="event-details-title" className="grid gap-4 rounded-2xl border border-border bg-panel p-4 sm:p-6">
              <h2 id="event-details-title" className="text-lg font-semibold">Details</h2>
              <div className="grid gap-4 text-sm">
                <div className="flex items-start gap-3">
                  <ModuleIcon name="calendar" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p>{scheduleText(event)}</p>
                    <p className="text-xs text-muted-foreground">{event.timeZone}</p>
                  </div>
                </div>
                {event.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="wrap-anywhere">{event.location}</p>
                  </div>
                )}
                {event.series && (
                  <div className="flex items-start gap-3">
                    <Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="wrap-anywhere">
                      {event.series.interval === 1 ? frequencyLabels[event.series.frequency]
                        : "Every " + event.series.interval + " " + frequencyUnits[event.series.frequency]}
                      {" through " + formatDay(event.series.until)}
                    </p>
                  </div>
                )}
              </div>
                </aside>
          </div>
        </article>
      )}
    </>
  );
}

export function EventScreen() {
  return (
    <AppShell activePage="calendar">
      <div className="mx-auto max-w-6xl pb-4">
        <FamilySession>
          {(session) => <EventDetails key={session.user.id} session={session} />}
        </FamilySession>
      </div>
    </AppShell>
  );
}
