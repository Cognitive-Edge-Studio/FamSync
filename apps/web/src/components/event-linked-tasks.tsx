"use client";

import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { eventDays, formatDay } from "@/lib/calendar-date";
import { taskPath } from "@/lib/tasks";
import { FormFeedback } from "./account-fields";
import { TaskCard } from "./task-card";
import { TaskFormDialog } from "./task-form-dialog";
import { useTaskStatus } from "./task-status";
import { useTaskList } from "./tasks-screen";
import { Button } from "./ui/button";

type EventDetail = components["schemas"]["EventDetailDto"];
type Family = components["schemas"]["FamilyDto"];

// Tasks linked to this event or occurrence that the viewer can see, plus a shortcut to add one.
export function EventLinkedTasks({ session, familyId, event, revision }: {
  session: Session;
  familyId: string;
  event: EventDetail;
  revision: number;
}) {
  const [family, setFamily] = useState<Family>();
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<{ title: string; id: string }>();
  const [local, setLocal] = useState(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const occurrence = event.occurrence?.originalDate;
  const query = { event: event.id, ...(occurrence ? { occurrence } : {}) };
  const { tasks, today, error } = useTaskList(session.access_token, familyId, query, revision + local);
  const status = useTaskStatus(session.access_token, familyId, () => setLocal((value) => value + 1));
  const cancelled = event.occurrence?.status === "cancelled";
  const day = eventDays(event, event.timeZone).first;

  useEffect(() => {
    const controller = new AbortController();
    getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}", {
      params: { path: { familyId } }, signal: controller.signal,
    }).then(({ data }) => { if (!controller.signal.aborted) setFamily(data); }).catch(() => undefined);
    return () => controller.abort();
  }, [session.access_token, familyId]);

  return (
    <section className="grid gap-3 border-t border-border pt-5" aria-labelledby="linked-tasks">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="linked-tasks" className="font-semibold">Linked tasks</h2>
        {family && !cancelled && (
          <Button ref={addButton} variant="outline" className="h-9 gap-1.5 px-3" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />Add task
          </Button>
        )}
      </div>
      {saved && (
        <p role="status" className="text-sm font-medium wrap-anywhere text-sage-foreground">
          Task saved: <a className="underline underline-offset-4" href={taskPath(familyId, saved.id)}>{saved.title}</a>
        </p>
      )}
      {status.feedback}
      {error && <FormFeedback error={error} />}
      {!tasks && !error && <FormFeedback note="Loading linked tasks…" />}
      {tasks && tasks.length === 0 && <p className="text-sm text-muted-foreground">No linked tasks yet.</p>}
      {tasks && tasks.length > 0 && (
        <ul className="grid gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} familyId={familyId} today={today} showStatus
              busy={status.busy === task.id} onChange={(next) => void status.change(task, next)} />
          ))}
        </ul>
      )}
      {adding && family && (
        <TaskFormDialog family={family} accessToken={session.access_token} userId={session.user.id} trigger={addButton}
          initialLink={{ eventId: event.id, occurrenceDate: occurrence ?? null, label: event.title + " · " + formatDay(day), day }}
          onClose={() => setAdding(false)}
          onSaved={(result) => {
            setAdding(false);
            if (result.kind === "task") setSaved({ title: result.task.title, id: result.task.id });
            setLocal((value) => value + 1);
          }} />
      )}
    </section>
  );
}
