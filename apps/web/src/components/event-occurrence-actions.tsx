"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { useRef, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { civilDate, localMinuteInZone, shiftDay } from "@/lib/calendar-date";
import { dueText, type Task } from "@/lib/tasks";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type EventDetail = components["schemas"]["EventDetailDto"];
type Change = components["schemas"]["OccurrenceChangeDto"];

export function EventOccurrenceActions({ event, familyId, accessToken, onSaved }: {
  event: EventDetail;
  familyId: string;
  accessToken: string;
  onSaved: (details: EventDetail) => void;
}) {
  const [action, setAction] = useState<Change["action"]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState<Task[]>([]);
  const [linkedToday, setLinkedToday] = useState("");
  const [shiftTasks, setShiftTasks] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [shiftedNote, setShiftedNote] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const startField = useRef<HTMLInputElement>(null);
  const occurrence = event.occurrence;
  const series = event.series;
  if (!occurrence || !series?.canEdit || occurrence.status === "cancelled") return null;

  const originalDate = occurrence.originalDate;
  const seriesZone = series.timeZone;
  const move = action === "move";
  const start = event.allDay ? event.start : localMinuteInZone(event.start, seriesZone);
  const end = event.allDay ? shiftDay(event.end, -1) : localMinuteInZone(event.end, seriesZone);
  const movedStart = newStart || start;
  const shiftDays = Math.round((civilDate(movedStart.slice(0, 10)).getTime() - civilDate(start.slice(0, 10)).getTime()) / 86400000);
  // Only linked tasks you created, with a due date, can move with the occurrence.
  const movable = linked.filter((task) => task.canEdit && !task.archived && task.dueDate);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!action || busy) return;
    const form = new FormData(formEvent.currentTarget);
    const body: Change = { action };
    if (action === "move") {
      body.start = String(form.get("start"));
      const last = String(form.get("end"));
      body.end = event.allDay ? shiftDay(last, 1) : last;
      if (shiftTasks && shiftDays !== 0 && movable.length) body.shiftLinkedTasks = movable.map(({ id, version }) => ({ id, version }));
      if (body.start >= body.end) {
        setError(event.allDay ? "The last day must be on or after the start date." : "The end time must follow the start time.");
        return;
      }
    }
    const fallback = "We couldn’t save this occurrence. Try again.";
    setError("");
    setBusy(true);
    try {
      const { data, error, response } = await getBrowserApi(accessToken).PUT(
        "/api/v1/families/{familyId}/events/{eventId}/occurrences/{originalDate}", {
          params: { path: { familyId, eventId: event.id, originalDate } }, body,
        },
      );
      if (data) {
        setAction(undefined);
        setShiftedNote(data.shiftedTaskCount
          ? "Moved " + data.shiftedTaskCount + " linked " + (data.shiftedTaskCount === 1 ? "task" : "tasks") + " by the same amount." : "");
        onSaved(data);
      } else {
        setError(familyError([400, 403, 404, 409].includes(response.status) ? error : undefined, fallback));
      }
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  function open(next: Change["action"], button: HTMLButtonElement) {
    trigger.current = button;
    setError("");
    setShiftTasks(false);
    setNewStart("");
    setLinked([]);
    setAction(next);
    if (next !== "move") return;
    getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/tasks", {
      params: { path: { familyId }, query: { event: event.id, occurrence: originalDate } },
    }).then(({ data }) => {
      if (data) {
        setLinked(data.tasks);
        setLinkedToday(data.today);
      }
    }).catch(() => undefined);
  }

  return (
    <section className="grid gap-3 border-t border-border pt-5" aria-labelledby="occurrence-actions">
      <h2 id="occurrence-actions" className="font-semibold">This occurrence</h2>
      {shiftedNote && <p role="status" className="text-sm font-medium text-sage-foreground">{shiftedNote}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-9 px-3" onClick={(event) => open("move", event.currentTarget)}>Move occurrence</Button>
        <Button variant="destructive" className="h-9 px-3" onClick={(event) => open("cancel", event.currentTarget)}>
          Cancel occurrence
        </Button>
      </div>
      <Dialog.Root open={!!action} disablePointerDismissal onOpenChange={(open) => { if (!open && !busy) setAction(undefined); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup initialFocus={move ? startField : closeButton} finalFocus={trigger}
            className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl">
            <Dialog.Title className="text-xl font-semibold">{move ? "Move occurrence" : "Cancel occurrence?"}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {move ? "This change applies to one occurrence. Times use " + seriesZone + "."
                : "This occurrence will be removed from Calendar and Today. The rest of the series stays scheduled."}
            </Dialog.Description>
            <form className="mt-4 grid gap-4" onSubmit={(formEvent) => void submit(formEvent)}>
              {move && (
                <fieldset disabled={busy} className="grid min-w-0 gap-3">
                  <Field id="move-start" label={event.allDay ? "New start date" : "New start time"}>
                    <input id="move-start" name="start" ref={startField} className={inputClass} required
                      type={event.allDay ? "date" : "datetime-local"} defaultValue={start}
                      onChange={(changeEvent) => setNewStart(changeEvent.target.value)} />
                  </Field>
                  <Field id="move-end" label={event.allDay ? "New last day" : "New end time"}>
                    <input id="move-end" name="end" className={inputClass} required
                      type={event.allDay ? "date" : "datetime-local"} defaultValue={end} />
                  </Field>
                  {movable.length > 0 && (
                    <div className="grid gap-2 rounded-xl border border-border bg-background/60 p-3">
                      {shiftDays === 0 ? (
                        <p className="text-sm font-semibold">
                          {movable.length === 1 ? "A linked task is" : movable.length + " linked tasks are"} due with this occurrence.
                          Change the date to move {movable.length === 1 ? "it" : "them"} too.
                        </p>
                      ) : (
                      <label className="flex items-start gap-2 text-sm font-semibold">
                        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={shiftTasks}
                          onChange={(changeEvent) => setShiftTasks(changeEvent.target.checked)} />
                        <span>
                          Also move {movable.length === 1 ? "the linked task" : movable.length + " linked tasks"}
                          {" by " + Math.abs(shiftDays) + (Math.abs(shiftDays) === 1 ? " day" : " days")}
                          {shiftDays < 0 ? " earlier" : " later"}
                        </span>
                      </label>
                      )}
                      <ul className="grid gap-1 text-sm text-muted-foreground" aria-label="Linked task due dates">
                        {movable.map((task) => (
                          <li key={task.id} className="wrap-anywhere">
                            {task.title}: {dueText(task, linkedToday)} → {dueText({ ...task, dueDate: shiftDay(task.dueDate!, shiftDays) }, linkedToday)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </fieldset>
              )}
              <FormFeedback error={error} />
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close render={<Button ref={closeButton} variant="outline" className="h-9 px-3" disabled={busy} />}>
                  {move ? "Back" : "Keep occurrence"}
                </Dialog.Close>
                <Button type="submit" variant={move ? "default" : "destructive"} className="h-9 px-3" disabled={busy}>
                  {busy ? "Saving…" : move ? "Save new time" : "Cancel this occurrence"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
