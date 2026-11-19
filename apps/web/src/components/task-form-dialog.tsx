"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels, dayInZone, eventDays, formatDay, shiftDay } from "@/lib/calendar-date";
import { isPastDue, repeatUnit, taskSuggestions, type RepeatFrequency, type TaskDetail, type TaskSeries } from "@/lib/tasks";
import { defaultTaskReminder, parseReminder, reminderLabel, reminderMinutes } from "@/lib/reminders";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type Member = components["schemas"]["FamilyMemberDto"];
type Audience = TaskDetail["audience"];
type Preview = components["schemas"]["SeriesPreviewDto"];
export type TaskLink = { eventId: string; occurrenceDate: string | null; label: string; day?: string };
type EventRange = components["schemas"]["EventRangeDto"];
const linkKey = (link: Pick<TaskLink, "eventId" | "occurrenceDate">) => link.eventId + "|" + (link.occurrenceDate ?? "");
export type TaskSaved = { kind: "task"; task: TaskDetail } | { kind: "series"; series: TaskSeries };

function memberName(member: Member, userId: string) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member";
  return member.userId === userId ? name + " (me)" : name;
}

function nowMinute(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

// Creates a task or chore, edits one task or occurrence (`task`), or edits a chore series (`series`).
export function TaskFormDialog({ family, accessToken, userId, task, series, initialLink, trigger, onClose, onSaved }: {
  family: Family;
  initialLink?: TaskLink;
  accessToken: string;
  userId: string;
  task?: TaskDetail;
  series?: TaskSeries;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: (saved: TaskSaved) => void;
}) {
  const source = series ?? task;
  const [audience, setAudience] = useState<Audience | undefined>(source?.audience);
  const [members, setMembers] = useState<Member[]>();
  const [selected, setSelected] = useState<string[]>(source?.selectedMemberIds ?? []);
  const [assignee, setAssignee] = useState(source?.assignee?.current ? source.assignee.userId : "");
  const [title, setTitle] = useState(source?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? initialLink?.day ?? "");
  const [link, setLink] = useState<TaskLink | null>(initialLink ?? (task?.eventLink ? {
    eventId: task.eventLink.eventId, occurrenceDate: task.eventLink.occurrenceDate ?? null, label: task.eventLink.title,
  } : null));
  const [linkOptions, setLinkOptions] = useState<TaskLink[]>();
  const [dueTime, setDueTime] = useState(source?.dueTime ?? "");
  const [remind, setRemind] = useState<string | undefined>(
    source && source.remindMinutes !== undefined ? String(source.remindMinutes ?? "") : undefined);
  const [frequency, setFrequency] = useState<RepeatFrequency | "">(series?.frequency ?? "");
  const [interval, setRepeatInterval] = useState(String(series?.interval ?? 1));
  const [until, setUntil] = useState(series?.until ?? "");
  const [preview, setPreview] = useState<Preview>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const saveId = useRef(source?.id ?? "");
  const today = dayInZone(new Date(), family.timeZone);
  const creating = !task && !series;
  const repeating = !!frequency;

  useEffect(() => {
    const controller = new AbortController();
    const path = { familyId: family.id };
    async function load() {
      setLoadError(false);
      try {
        const api = getBrowserApi(accessToken);
        const [defaults, roster] = await Promise.all([
          api.GET("/api/v1/families/{familyId}/tasks/defaults", { params: { path }, signal: controller.signal }),
          api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal: controller.signal }),
        ]);
        if (!defaults.data || !roster.data) throw new Error("Task settings unavailable");
        if (!controller.signal.aborted) {
          setAudience((current) => current ?? defaults.data!.audience);
          setMembers(roster.data);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, family.id, revision]);

  // Visible events and occurrences for the next six weeks can be linked.
  useEffect(() => {
    if (series) return;
    const controller = new AbortController();
    const start = dayInZone(new Date(), family.timeZone);
    getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/events", {
      params: { path: { familyId: family.id }, query: { start, end: shiftDay(start, 42) } }, signal: controller.signal,
    }).then(({ data }: { data?: EventRange }) => {
      if (controller.signal.aborted || !data) return;
      setLinkOptions(data.events.map((event) => {
        const day = eventDays(event, data.timeZone).first;
        return { eventId: event.id, occurrenceDate: event.occurrence?.originalDate ?? null, day, label: event.title + " · " + formatDay(day) };
      }));
    }).catch(() => { if (!controller.signal.aborted) setLinkOptions([]); });
    return () => controller.abort();
  }, [accessToken, family.id, family.timeZone, series]);

  const others = (members ?? []).filter((member) => member.userId !== userId);
  const eligible = (members ?? []).filter((member) => member.userId === userId || audience === "family"
    || (audience === "selected" && selected.includes(member.userId)));
  const assigneeHidden = !!assignee && !!members && !eligible.some((member) => member.userId === assignee);
  // Until the author picks one, the reminder follows the due date: 1 hour before a due time, or 08:00 on the day.
  const remindValue = remind ?? String(defaultTaskReminder(repeating || series ? (dueDate || series?.startDate || "") : dueDate, dueTime) ?? "");
  const hasDue = !!series || !!dueDate;
  const pastDue = !series && isPastDue(dueDate, repeating ? "" : dueTime, today, nowMinute(family.timeZone));

  function readRule() {
    const every = Number(interval);
    if (!Number.isInteger(every) || every < 1 || every > 365) throw new Error("Repeat every 1 to 365 " + repeatUnit(frequency as RepeatFrequency) + ".");
    if (!dueDate) throw new Error("Choose the first due date.");
    if (until && until < dueDate) throw new Error("The repeat end date must be on or after the first due date.");
    return { frequency: frequency as RepeatFrequency, interval: every, until: until || null };
  }

  async function showPreview() {
    setPreview(undefined);
    setError("");
    let recurrence;
    try {
      recurrence = readRule();
    } catch (problem) {
      setError(familyError(problem, "Check the repeat settings."));
      return;
    }
    setPreviewBusy(true);
    try {
      const result = await getBrowserApi(accessToken).POST("/api/v1/families/{familyId}/task-series/preview", {
        params: { path: { familyId: family.id } }, body: { startDate: dueDate, recurrence },
      });
      if (result.data) setPreview(result.data);
      else setError(familyError(result.response.status === 400 ? result.error : undefined, "We couldn’t preview the dates."));
    } catch {
      setError("We couldn’t preview the dates.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audience || busy || loadError) return;
    setError("");
    const audienceMembers = audience === "selected" ? selected : [];
    if (audience === "selected" && !audienceMembers.length) return setError("Choose at least one family member.");
    if (assigneeHidden) {
      return setError("The assignee can’t see this task with that audience. Choose another assignee or include them.");
    }
    if (!series && !repeating && dueTime && !dueDate) return setError("Choose a due date for the due time.");
    if (series && until && until < series.startDate) return setError("The repeat end date must be on or after the first due date.");
    let recurrence;
    try {
      if (creating && repeating) recurrence = readRule();
    } catch (problem) {
      return setError(familyError(problem, "Check the repeat settings."));
    }
    const form = new FormData(event.currentTarget);
    const eventLink = link && !repeating ? { eventId: link.eventId, occurrenceDate: link.occurrenceDate } : null;
    const shared = {
      title: title.trim(), description: String(form.get("description") ?? ""), dueTime: dueTime || null,
      assigneeId: assignee || null, audience, selectedMemberIds: audienceMembers,
      remindMinutes: hasDue ? parseReminder(remindValue) : null,
    };
    setBusy(true);
    const fallback = "We couldn’t save the task. Try again.";
    try {
      const api = getBrowserApi(accessToken);
      saveId.current ||= crypto.randomUUID();
      const familyPath = { familyId: family.id };
      let result: { data?: TaskDetail | TaskSeries; error?: unknown; response: Response };
      let kind: TaskSaved["kind"] = "task";
      if (series) {
        kind = "series";
        result = await api.PUT("/api/v1/families/{familyId}/task-series/{seriesId}", {
          params: { path: { ...familyPath, seriesId: series.id } },
          body: { ...shared, until: until || null, version: series.version },
        });
      } else if (task) {
        result = await api.PUT("/api/v1/families/{familyId}/tasks/{taskId}", {
          params: { path: { ...familyPath, taskId: task.id } },
          body: { ...shared, dueDate: dueDate || null, eventLink, version: task.version },
        });
      } else if (recurrence) {
        kind = "series";
        result = await api.POST("/api/v1/families/{familyId}/task-series", {
          params: { path: familyPath }, body: { id: saveId.current, ...shared, startDate: dueDate, recurrence },
        });
      } else {
        result = await api.POST("/api/v1/families/{familyId}/tasks", {
          params: { path: familyPath }, body: { id: saveId.current, ...shared, dueDate: dueDate || null, eventLink },
        });
      }
      if (result.data) {
        onSaved(kind === "series" ? { kind, series: result.data as TaskSeries } : { kind, task: result.data as TaskDetail });
        return;
      }
      setError(familyError([400, 403, 404, 409, 503].includes(result.response.status) ? result.error : undefined, fallback));
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  const heading = series ? "Edit chore" : task?.series ? "Edit this occurrence" : task ? "Edit task" : "New task";
  const timeEnabled = !!series || !!dueDate;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup initialFocus={titleInput} finalFocus={trigger}
          className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="text-lg font-semibold">{heading}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {series ? "Changes apply to upcoming occurrences and open ones you haven’t edited separately. Completed ones keep their history."
              : task?.series ? "Changes apply only to this occurrence."
                : "Due dates use " + family.timeZone + "."}
          </Dialog.Description>
          <form className="mt-5 grid gap-4" onSubmit={(event) => void save(event)}>
            <fieldset disabled={busy} className="grid min-w-0 gap-4">
              {creating && (
                <Field id="task-suggestion" label="Suggested title">
                  <select id="task-suggestion" className={inputClass} value=""
                    onChange={(event) => { if (event.target.value) setTitle(event.target.value); }}>
                    <option value="">Choose a suggestion (optional)</option>
                    {taskSuggestions.map(({ group, titles }) => (
                      <optgroup key={group} label={group}>
                        {titles.map((value) => <option key={value} value={value}>{value}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              )}
              <Field id="task-title" label="Task title">
                <input id="task-title" name="title" ref={titleInput} className={inputClass} maxLength={120} required
                  value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field id="task-description" label="Description">
                <textarea id="task-description" name="description" className={inputClass} rows={3} maxLength={2000}
                  defaultValue={source?.description ?? ""} />
              </Field>
              {creating && (
                <Field id="task-repeat" label="Repeat">
                  <select id="task-repeat" className={inputClass} value={frequency}
                    onChange={(event) => { setFrequency(event.target.value as RepeatFrequency | ""); setPreview(undefined); }}>
                    <option value="">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {series ? (
                  <div className="grid gap-1.5">
                    <p className="text-sm font-semibold">First due date</p>
                    <p className="min-h-11 py-2.5">{formatDay(series.startDate)}</p>
                  </div>
                ) : (
                  <Field id="task-due-date" label={repeating ? "First due date" : "Due date"}>
                    <input id="task-due-date" type="date" className={inputClass} value={dueDate} required={repeating}
                      onChange={(event) => { setDueDate(event.target.value); setPreview(undefined); }} />
                  </Field>
                )}
                <Field id="task-due-time" label="Due time (optional)">
                  <input id="task-due-time" type="time" className={inputClass} value={dueTime} disabled={!timeEnabled}
                    onChange={(event) => setDueTime(event.target.value)} />
                </Field>
              </div>
              {(repeating || series) && (
                <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-3">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    {creating && (
                      <Field id="task-repeat-interval" label={"Repeat every (" + repeatUnit(frequency as RepeatFrequency) + ")"}>
                        <input id="task-repeat-interval" type="number" className={inputClass} min={1} max={365} step={1} required
                          value={interval} onChange={(event) => { setRepeatInterval(event.target.value); setPreview(undefined); }} />
                      </Field>
                    )}
                    <Field id="task-repeat-until" label="Repeat through (optional)">
                      <input id="task-repeat-until" type="date" className={inputClass} value={until}
                        onChange={(event) => { setUntil(event.target.value); setPreview(undefined); }} />
                    </Field>
                  </div>
                  {creating && (
                    <Button type="button" variant="outline" className="h-9 justify-self-start px-3" disabled={previewBusy}
                      onClick={() => void showPreview()}>{previewBusy ? "Previewing…" : "Preview dates"}</Button>
                  )}
                  {preview && (
                    <section className="grid gap-2" aria-label="Due date preview">
                      <h3 className="text-sm font-semibold">Upcoming due dates</h3>
                      <ul className="grid gap-1 text-sm text-muted-foreground">
                        {preview.dates.map((date) => <li key={date}>{formatDay(date)}</li>)}
                      </ul>
                      {preview.hasMore && <p className="text-sm text-muted-foreground">More due dates follow.</p>}
                    </section>
                  )}
                </div>
              )}
              {!series && !repeating && (
                <Field id="task-event" label="Linked event (optional)">
                  <select id="task-event" className={inputClass} value={link ? linkKey(link) : ""}
                    onChange={(event) => {
                      const chosen = [...(link ? [link] : []), ...(linkOptions ?? [])]
                        .find((option) => linkKey(option) === event.target.value) ?? null;
                      setLink(chosen);
                      if (chosen?.day && !dueDate) setDueDate(chosen.day);
                    }}>
                    <option value="">No linked event</option>
                    {link && !(linkOptions ?? []).some((option) => linkKey(option) === linkKey(link)) && (
                      <option value={linkKey(link)}>{link.label}</option>
                    )}
                    {(linkOptions ?? []).map((option) => <option key={linkKey(option)} value={linkKey(option)}>{option.label}</option>)}
                  </select>
                </Field>
              )}
              {hasDue && (
                <Field id="task-reminder" label="Reminder">
                  <select id="task-reminder" className={inputClass} value={remindValue}
                    onChange={(event) => setRemind(event.target.value)}>
                    <option value="">No reminder</option>
                    {reminderMinutes.map((minutes) => (
                      <option key={minutes} value={minutes}>{reminderLabel(minutes, !dueTime)}</option>
                    ))}
                  </select>
                </Field>
              )}
              {pastDue && (
                <p role="status" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {repeating ? "The first due date has passed. Occurrences before today will be saved as overdue."
                    : "This due date has passed. The task will be saved as overdue."}
                </p>
              )}
              {loadError && (
                <div className="flex flex-wrap items-center gap-3">
                  <FormFeedback error="We couldn’t load family members and visibility settings." />
                  <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button>
                </div>
              )}
              {(!audience || !members) && !loadError && <FormFeedback note="Loading family members…" />}
              {audience && members && (
                <>
                  <Field id="task-audience" label="Who can see this task?">
                    <select id="task-audience" className={inputClass} value={audience}
                      onChange={(event) => setAudience(event.target.value as Audience)}>
                      {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  {audience === "selected" && (
                    <fieldset className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                      <legend className="px-1 text-sm font-semibold">Selected family members</legend>
                      {!others.length && <p className="text-sm text-muted-foreground">No other family members to select.</p>}
                      {others.map((member) => (
                        <label className="flex items-start gap-2 text-sm" key={member.userId}>
                          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary"
                            checked={selected.includes(member.userId)}
                            onChange={(event) => setSelected((current) => event.target.checked
                              ? [...current, member.userId] : current.filter((id) => id !== member.userId))} />
                          <span className="wrap-anywhere">{memberName(member, userId)}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <Field id="task-assignee" label="Assign to" error={assigneeHidden
                    ? "This person can’t see the task with the chosen audience." : undefined}>
                    <select id="task-assignee" className={inputClass} value={assignee}
                      aria-invalid={assigneeHidden || undefined}
                      aria-describedby={assigneeHidden ? "task-assignee-error" : undefined}
                      onChange={(event) => setAssignee(event.target.value)}>
                      <option value="">Unassigned</option>
                      {(assigneeHidden ? members.filter((member) => member.userId === assignee) : []).concat(eligible)
                        .map((member) => <option key={member.userId} value={member.userId}>{memberName(member, userId)}</option>)}
                    </select>
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    {audience === "family" ? "Everyone in the family can see this task."
                      : audience === "private" ? "Only you can see this task."
                        : selected.length ? "You and " + selected.length + " selected " + (selected.length === 1 ? "member" : "members") + " can see this task."
                          : "Choose who can see this task."}
                  </p>
                </>
              )}
            </fieldset>
            <FormFeedback error={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" className="h-9 px-4" disabled={busy} />}>Cancel</Dialog.Close>
              <Button type="submit" className="h-9 px-4" disabled={busy || !audience || !members || loadError}>
                {busy ? "Saving…" : creating ? (repeating ? "Save chore" : "Save task") : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
