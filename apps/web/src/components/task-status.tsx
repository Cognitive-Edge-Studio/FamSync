"use client";

import { useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { statusChangeLabels, type Task, type TaskDetail, type TaskStatus } from "@/lib/tasks";
import { FormFeedback } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Notice = { task: TaskDetail; previous: TaskStatus };

// Status changes carry the version they were based on. A conflict asks the screen to reload.
export function useTaskStatus(accessToken: string, familyId: string, onChanged: (task?: TaskDetail) => void) {
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [error, setError] = useState("");

  // Resolves true when the server saved the change.
  async function send(task: Pick<Task, "id" | "version" | "status">, status: TaskStatus, undo: boolean): Promise<boolean> {
    if (busy) return false;
    setBusy(task.id);
    setError("");
    const fallback = "We couldn’t update the task. Try again.";
    try {
      const { data, error: problem, response } = await getBrowserApi(accessToken).PUT(
        "/api/v1/families/{familyId}/tasks/{taskId}/status",
        { params: { path: { familyId, taskId: task.id } }, body: { status, version: task.version } },
      );
      if (data) {
        setNotice(undo ? undefined : { task: data, previous: task.status });
        onChanged(data);
        return true;
      }
      setNotice(undefined);
      setError(familyError([400, 403, 404, 409].includes(response.status) ? problem : undefined, fallback));
      if (response.status === 409 || response.status === 404) onChanged();
      return false;
    } catch {
      setError(fallback);
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  return {
    busy,
    change: (task: Pick<Task, "id" | "version" | "status">, status: TaskStatus) => send(task, status, false),
    feedback: (
      <div className="grid gap-2 empty:absolute" aria-live="polite">
        {notice && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sage px-3 py-2">
            <p role="status" className="text-sm font-medium wrap-anywhere text-sage-foreground">
              {statusChangeLabels[notice.task.status]}: {notice.task.title}
            </p>
            <Button variant="outline" className="h-8 px-3" disabled={!!busy}
              onClick={() => void send(notice.task, notice.previous, true)}>Undo</Button>
          </div>
        )}
        <FormFeedback error={error} />
      </div>
    ),
  };
}

export function TaskStatusButtons({ task, busy, onChange }: {
  task: Task;
  busy: boolean;
  onChange: (status: TaskStatus) => void;
}) {
  if (!task.canChangeStatus) return null;
  const name = "“" + task.title + "”";
  return (
    <div className="flex flex-wrap gap-2">
      {task.status === "todo" && (
        <Button variant="outline" className="h-8 px-3 text-xs" disabled={busy} aria-label={"Start " + name}
          onClick={() => onChange("in_progress")}>Start</Button>
      )}
      {task.status !== "completed" && (
        <Button className="h-8 px-3 text-xs" disabled={busy} aria-label={"Complete " + name}
          onClick={() => onChange("completed")}>Complete</Button>
      )}
      {task.status === "completed" && (
        <Button variant="outline" className="h-8 px-3 text-xs" disabled={busy} aria-label={"Reopen " + name}
          onClick={() => onChange("todo")}>Reopen</Button>
      )}
    </div>
  );
}
