"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels, eventPath, eventTime, formatDay, shiftDay } from "@/lib/calendar-date";
import { parseReminder, reminderLabel, reminderMinutes } from "@/lib/reminders";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type EventInput = components["schemas"]["CreateEventDto"];
type Member = components["schemas"]["FamilyMemberDto"];
type Audience = NonNullable<EventInput["audience"]>;
type Rule = components["schemas"]["RecurrenceRuleDto"];
type Preview = components["schemas"]["RecurrencePreviewDto"];
const maxFileSize = 5 * 1024 * 1024;

function readSchedule(form: FormData, allDay: boolean) {
  const start = String(form.get("start") ?? "");
  const last = String(form.get("end") ?? "");
  if (!start || !last) throw new Error("Enter both a start and an end.");
  const end = allDay ? shiftDay(last, 1) : last;
  if (start >= end) {
    throw new Error(allDay ? "The last day must be on or after the start date." : "The end time must follow the start time.");
  }
  return { allDay, start, end };
}

function readRule(form: FormData, frequency: Rule["frequency"] | ""): Rule | undefined {
  if (!frequency) return;
  const interval = Number(form.get("repeatInterval"));
  const until = String(form.get("repeatUntil") ?? "");
  if (!until || !Number.isInteger(interval) || interval < 1 || interval > 2147483647) {
    throw new Error("Enter a repeat end date and a positive whole-number interval.");
  }
  return { frequency, interval, until };
}

export function EventCreateDialog({ family, accessToken, day, userId, trigger, onClose }: {
  family: Family;
  accessToken: string;
  day: string;
  userId: string;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<Audience>();
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [allDay, setAllDay] = useState(false);
  const [remind, setRemind] = useState("");
  const [remindAudience, setRemindAudience] = useState<"me" | "everyone">("me");
  const [frequency, setFrequency] = useState<Rule["frequency"] | "">("");
  const [preview, setPreview] = useState<Preview>();
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previewRequest = useRef<AbortController>(null);
  const eventId = useRef("");

  useEffect(() => () => previewRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const path = { familyId: family.id };
    async function load() {
      setLoadError(false);
      try {
        const api = getBrowserApi(accessToken);
        const [defaults, roster] = await Promise.all([
          api.GET("/api/v1/families/{familyId}/events/defaults", { params: { path }, signal: controller.signal }),
          api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal: controller.signal }),
        ]);
        if (!defaults.data || !roster.data) throw new Error("Event preferences unavailable");
        if (!controller.signal.aborted) {
          setAudience((current) => current ?? defaults.data!.audience);
          setMembers(roster.data.filter((member) => member.userId !== userId));
        }
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, family.id, loadingRevision, userId]);

  function clearPreview() {
    previewRequest.current?.abort();
    previewRequest.current = null;
    setPreview(undefined);
    setPreviewError("");
    setPreviewBusy(false);
  }

  async function showPreview() {
    if (!formRef.current || !frequency) return;
    clearPreview();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewBusy(true);
    const fallback = "We couldn’t preview the schedule. Try again.";
    try {
      const form = new FormData(formRef.current);
      const recurrence = readRule(form, frequency)!;
      const schedule = readSchedule(form, allDay);
      const result = await getBrowserApi(accessToken).POST("/api/v1/families/{familyId}/events/preview", {
        params: { path: { familyId: family.id } }, body: { ...schedule, recurrence }, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.data) setPreview(result.data);
      else setPreviewError(familyError(result.response.status === 400 ? result.error : undefined, fallback));
    } catch (error) {
      if (!controller.signal.aborted) setPreviewError(familyError(error instanceof TypeError ? undefined : error, fallback));
    } finally {
      if (previewRequest.current === controller) setPreviewBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audience || busy || loadError) return;
    const form = new FormData(event.currentTarget);
    const attachment = form.get("file");
    const file = attachment instanceof File && attachment.name ? attachment : null;
    const audienceMembers = audience === "selected" ? selected : [];
    setError("");
    if (audience === "selected" && !audienceMembers.length) {
      setError("Choose at least one family member.");
      return;
    }
    if (file && (file.size === 0 || file.size > maxFileSize)) {
      setError("Choose a nonempty attachment up to 5 MB.");
      return;
    }

    let schedule: ReturnType<typeof readSchedule>;
    let recurrence: Rule | undefined;
    try {
      schedule = readSchedule(form, allDay);
      recurrence = readRule(form, frequency);
    } catch (error) {
      setError(familyError(error, "Check the event schedule."));
      return;
    }
    setBusy(true);
    const fallback = "We couldn’t save the event. Try again.";
    try {
      eventId.current ||= crypto.randomUUID();
      const input: EventInput = {
        id: eventId.current, title: String(form.get("title")), ...schedule, recurrence,
        location: String(form.get("location")), note: String(form.get("note")),
        audience, selectedMemberIds: audienceMembers,
        remindMinutes: parseReminder(remind), remindAudience: parseReminder(remind) === null ? undefined : remindAudience,
      };
      const result = await getBrowserApi(accessToken).POST("/api/v1/families/{familyId}/events", {
        params: { path: { familyId: family.id } },
        body: { event: JSON.stringify(input) },
        bodySerializer: (body) => {
          const upload = new FormData();
          upload.set("event", body.event);
          if (file) upload.set("file", file);
          return upload;
        },
      });
      if (result.data) {
        window.location.assign(eventPath(family.id, result.data.id, result.data.occurrence?.originalDate));
        return;
      }
      if (result.response.status === 413) setError("Choose an attachment up to 5 MB.");
      else setError(familyError([400, 404, 409, 503].includes(result.response.status) ? result.error : undefined, fallback));
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup initialFocus={titleInput} finalFocus={trigger}
          className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="text-lg font-semibold">New event</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Times use {family.timeZone}.</Dialog.Description>
          <form ref={formRef} className="mt-5 grid gap-4" onSubmit={(event) => void save(event)}>
            <fieldset disabled={busy} className="grid min-w-0 gap-4">
              <Field id="event-title" label="Event title">
                <input id="event-title" name="title" ref={titleInput} className={inputClass} maxLength={120} required />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-4 accent-primary" checked={allDay}
                  onChange={(event) => { setAllDay(event.target.checked); clearPreview(); }} />All day
              </label>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2" key={String(allDay)}>
                <Field id="event-start" label={allDay ? "Start date" : "Start time"}>
                  <input id="event-start" name="start" className={inputClass} required onChange={clearPreview}
                    type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? day : day + "T09:00"} />
                </Field>
                <Field id="event-end" label={allDay ? "Last day" : "End time"}>
                  <input id="event-end" name="end" className={inputClass} required onChange={clearPreview}
                    type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? day : day + "T10:00"} />
                </Field>
              </div>
              <Field id="event-repeat" label="Repeat">
                <select id="event-repeat" className={inputClass} value={frequency} onChange={(event) => {
                  setFrequency(event.target.value as Rule["frequency"] | "");
                  clearPreview();
                }}>
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              {frequency && (
                <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-3">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <Field id="event-repeat-interval" label={frequency === "daily" ? "Repeat every (days)"
                      : frequency === "weekly" ? "Repeat every (weeks)" : "Repeat every (months)"}>
                      <input id="event-repeat-interval" name="repeatInterval" className={inputClass} type="number"
                        required min={1} max={2147483647} step={1} defaultValue={1} onChange={clearPreview} />
                    </Field>
                    <Field id="event-repeat-until" label="Repeat through">
                      <input id="event-repeat-until" name="repeatUntil" type="date" className={inputClass} required onChange={clearPreview} />
                    </Field>
                  </div>
                  <Button type="button" variant="outline" className="h-9 justify-self-start px-3" disabled={previewBusy}
                    onClick={() => void showPreview()}>{previewBusy ? "Previewing…" : "Preview schedule"}</Button>
                  <FormFeedback error={previewError} />
                  {preview && (
                    <section className="grid gap-2" aria-label="Schedule preview">
                      <h3 className="text-sm font-semibold">Upcoming occurrences</h3>
                      <ul className="grid gap-1 text-sm text-muted-foreground">
                        {preview.occurrences.map(({ originalDate, start, end }) => (
                          <li key={originalDate}>
                            {formatDay(originalDate)} <span aria-hidden="true">·</span>{" "}
                            {eventTime({ allDay, start, end }, preview.timeZone)}
                            {allDay && start !== shiftDay(end, -1) && " through " + formatDay(shiftDay(end, -1))}
                          </li>
                        ))}
                      </ul>
                      {preview.hasMore && <p className="text-sm text-muted-foreground">More occurrences follow through the repeat end date.</p>}
                    </section>
                  )}
                </div>
              )}
              <Field id="event-location" label="Location">
                <input id="event-location" name="location" className={inputClass} maxLength={200} />
              </Field>
              <Field id="event-note" label="Note">
                <textarea id="event-note" name="note" className={inputClass} rows={3} maxLength={2000} />
              </Field>
              <Field id="event-file" label="Attachment (up to 5 MB)">
                <input id="event-file" name="file" type="file"
                  className="min-w-0 w-full rounded-lg border border-border bg-background p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-medium" />
              </Field>
              {loadError && (
                <div className="flex flex-wrap items-center gap-3">
                  <FormFeedback error="We couldn’t load visibility settings." />
                  <Button variant="outline" onClick={() => setLoadingRevision((value) => value + 1)}>Try again</Button>
                </div>
              )}
              {!audience && !loadError && <FormFeedback note="Loading visibility settings…" />}
              {audience && (
                <Field id="event-audience" label="Who can see this event?">
                  <select id="event-audience" className={inputClass} value={audience}
                    onChange={(event) => setAudience(event.target.value as Audience)}>
                    {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              )}
              {audience === "selected" && (
                <fieldset className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Selected family members</legend>
                  {!members.length && <p className="text-sm text-muted-foreground">No other family members to select.</p>}
                  {members.map((member) => (
                    <label className="flex items-start gap-2 text-sm" key={member.userId}>
                      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={selected.includes(member.userId)}
                        onChange={(event) => setSelected((current) => event.target.checked
                          ? [...current, member.userId] : current.filter((id) => id !== member.userId))} />
                      <span className="wrap-anywhere">{[member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member"}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field id="event-reminder" label="Reminder">
                  <select id="event-reminder" className={inputClass} value={remind} onChange={(event) => setRemind(event.target.value)}>
                    <option value="">No reminder</option>
                    {reminderMinutes.map((minutes) => (
                      <option key={minutes} value={minutes}>{reminderLabel(minutes, allDay)}</option>
                    ))}
                  </select>
                </Field>
                {remind !== "" && (
                  <Field id="event-remind-who" label="Remind">
                    <select id="event-remind-who" className={inputClass} value={remindAudience}
                      onChange={(event) => setRemindAudience(event.target.value as "me" | "everyone")}>
                      <option value="me">Only me</option>
                      <option value="everyone">Everyone who can see it</option>
                    </select>
                  </Field>
                )}
              </div>
            </fieldset>
            <FormFeedback error={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" className="h-9 px-4" disabled={busy} />}>Cancel</Dialog.Close>
              <Button type="submit" className="h-9 px-4" disabled={busy || !audience || loadError}>
                {busy ? "Saving…" : "Save event"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
