"use client";
import { Avatar } from "./ui/avatar";
import { ModuleIcon } from "./ui/module-icon";


import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { AlertCircle, Archive, BellRing, ArchiveRestore, ArrowLeft, CalendarClock, CalendarDays, CheckCircle2, Eye, Pencil, Repeat, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels, eventPath, formatDay } from "@/lib/calendar-date";
import { dueText, repeatText, statusLabels, tasksPath, type TaskDetail, type TaskSeries } from "@/lib/tasks";
import { reminderLabel, type ReminderMinutes } from "@/lib/reminders";
import { FormFeedback } from "./account-fields";
import { AppShell } from "./app-shell";
import { familyError, FamilySession } from "./family-session";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskStatusButtons, useTaskStatus } from "./task-status";
import { Button } from "./ui/button";
import { Badge, type BadgeTone } from "./ui/badge";
import { PageHeader } from "./ui/page-header";

const statusTones: Record<string, BadgeTone> = { todo: "neutral", in_progress: "sky", completed: "sage" };
import {WorkMessageSources} from './work-message-sources';

type Family = components["schemas"]["FamilyDto"];
const completedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function TaskDetails({ session, family, taskId }: { session: Session; family: Family; taskId: string }) {
  const [task, setTask] = useState<TaskDetail>();
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [revision, setRevision] = useState(0);
  const [series, setSeries] = useState<TaskSeries>();
  const [editing, setEditing] = useState<"task" | "series">();
  const [edited, setEdited] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const seriesButton = useRef<HTMLButtonElement>(null);
  const reload = () => setRevision((value) => value + 1);
  const seriesId = task?.series?.id;
  const status = useTaskStatus(session.access_token, family.id, (changed) => {
    setEdited("");
    if (changed) setTask(changed);
    else reload();
  });

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}/tasks/{taskId}", {
      params: { path: { familyId: family.id, taskId } }, signal: controller.signal,
    }).then(({ data, response }) => {
      if (controller.signal.aborted) return;
      if (data) return setTask(data);
      setTask(undefined);
      setRetryable(response.status !== 404 && response.status !== 400);
      setError(response.status === 404 || response.status === 400 ? "Task not found." : "We couldn’t open the task.");
    }).catch(() => {
      if (controller.signal.aborted) return;
      setRetryable(true);
      setError("We couldn’t open the task.");
    });
    return () => controller.abort();
  }, [session.access_token, family.id, taskId, revision]);

  useEffect(() => {
    if (!seriesId) return setSeries(undefined);
    const controller = new AbortController();
    getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}/task-series/{seriesId}", {
      params: { path: { familyId: family.id, seriesId } }, signal: controller.signal,
    }).then(({ data }) => { if (!controller.signal.aborted) setSeries(data); }).catch(() => undefined);
    return () => controller.abort();
  }, [session.access_token, family.id, seriesId, revision]);

  async function archive(target: "task" | "series", archived: boolean) {
    if (!task || archiveBusy) return;
    setArchiveBusy(true);
    setArchiveError("");
    setEdited("");
    const fallback = "We couldn’t update the task. Try again.";
    try {
      const api = getBrowserApi(session.access_token);
      const result = target === "series" && series
        ? await api.PUT("/api/v1/families/{familyId}/task-series/{seriesId}/archive", {
          params: { path: { familyId: family.id, seriesId: series.id } }, body: { archived, version: series.version },
        })
        : await api.PUT("/api/v1/families/{familyId}/tasks/{taskId}/archive", {
          params: { path: { familyId: family.id, taskId: task.id } }, body: { archived, version: task.version },
        });
      if (result.data) {
        setEdited(target === "series" ? (archived ? "Chore archived" : "Chore restored") : (archived ? "Task archived" : "Task restored"));
        reload();
        return;
      }
      setArchiveError(familyError([403, 404, 409].includes(result.response.status) ? result.error : undefined, fallback));
      if (result.response.status === 409) reload();
    } catch {
      setArchiveError(fallback);
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <>
      {(!task || error) && (
        <a href={tasksPath(family.id)} className="mt-6 mb-5 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
          <ArrowLeft className="size-4" aria-hidden="true" />Tasks
        </a>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <FormFeedback error={error} />
          {retryable && <Button variant="outline" onClick={reload}>Try again</Button>}
        </div>
      )}
      {!task && !error && <FormFeedback note="Loading task…" />}
      {task && !error && (
        <article className="grid gap-5">
          <PageHeader className="mb-0" title={task.title} crumbs={[{ label: "Tasks", href: tasksPath(family.id) }, { label: task.title }]}
            description={
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={statusTones[task.status]} data-status={task.status}>{statusLabels[task.status]}</Badge>
                {task.archived && <Badge tone="outline"><Archive aria-hidden="true" className="size-3" />Archived</Badge>}
                {task.overdue && <Badge tone="rose"><AlertCircle aria-hidden="true" className="size-3" />Overdue</Badge>}
              </span>
            } />
          {edited && <p role="status" className="rounded-xl bg-sage px-3 py-2 text-sm font-medium text-sage-foreground">{edited}</p>}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-5 rounded-2xl border border-border bg-panel p-4 sm:p-6 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
            {status.feedback}
            <div className="flex flex-wrap gap-2 [&_button]:h-9 [&_button]:text-sm">
              <TaskStatusButtons task={task} busy={status.busy === task.id} onChange={(next) => void status.change(task, next)} />
              {task.canEdit && !task.archived && (
                <Button ref={editButton} variant="outline" className="gap-1.5" onClick={() => setEditing("task")}>
                  <Pencil aria-hidden="true" />{task.series ? "Edit this occurrence" : "Edit task"}
                </Button>
              )}
              {series?.canEdit && !series.archived && (
                <Button ref={seriesButton} variant="outline" className="gap-1.5" onClick={() => setEditing("series")}>
                  <Repeat aria-hidden="true" />Edit series
                </Button>
              )}
              {task.canEdit && (
                <Button variant="outline" className="gap-1.5" disabled={archiveBusy}
                  onClick={() => void archive("task", !task.archived)}>
                  {task.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                  {task.archived ? "Restore task" : "Archive task"}
                </Button>
              )}
              {series?.canEdit && (
                <Button variant="outline" className="gap-1.5" disabled={archiveBusy}
                  onClick={() => void archive("series", !series.archived)}>
                  {series.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                  {series.archived ? "Restore series" : "Archive series"}
                </Button>
              )}
            </div>
            <FormFeedback error={archiveError} />
              {task.description && (
              <section className="border-t border-border pt-5">
                <h2 className="mb-2 font-semibold">Description</h2>
                <p className="wrap-anywhere whitespace-pre-wrap">{task.description}</p>
              </section>
            )}
            <WorkMessageSources accessToken={session.access_token} familyId={family.id} kind="task" id={task.id} />
              </div>
            <aside aria-labelledby="task-details-title" className="grid gap-4 rounded-2xl border border-border bg-panel p-4 sm:p-6">
              <h2 id="task-details-title" className="text-lg font-semibold">Details</h2>
              <dl className="grid gap-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div><dt className="text-xs text-muted-foreground">Due</dt><dd className="text-sm">{dueText(task, task.today)}</dd></div>
                </div>
                <div className="flex items-start gap-3">
                  {task.assignee ? <Avatar name={task.assignee.name} colorKey={task.assignee.userId} size="sm" /> : <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Assigned to</dt>
                    <dd className="text-sm wrap-anywhere">{task.assignee?.name ?? "Unassigned"}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Visible to</dt>
                    <dd className="text-sm">{audienceLabels[task.audience]} <span aria-hidden="true">·</span> Created by {task.author.name}</dd>
                  </div>
                </div>
                {task.dueDate && (
                  <div className="flex items-start gap-3">
                    <ModuleIcon name="notifications" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Reminder</dt>
                      <dd className="text-sm">{task.remindMinutes === null ? "None"
                        : reminderLabel(task.remindMinutes as ReminderMinutes, !task.dueTime) + " for " + (task.assignee?.name ?? task.author.name)}</dd>
                    </div>
                  </div>
                )}
                {task.completedAt && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Completed</dt>
                      <dd className="text-sm wrap-anywhere">
                        {completedFormat.format(new Date(task.completedAt))}{task.completedBy && " by " + task.completedBy.name}
                      </dd>
                    </div>
                  </div>
                )}
                {task.eventLink && (
                  <div className="flex items-start gap-3">
                    <ModuleIcon name="calendar" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Linked event</dt>
                      <dd className="flex flex-wrap items-center gap-2 text-sm">
                        <a className="wrap-anywhere underline underline-offset-4"
                          href={eventPath(family.id, task.eventLink.eventId, task.eventLink.occurrenceDate ?? undefined)}>
                          {task.eventLink.title}{task.eventLink.occurrenceDate && " · " + formatDay(task.eventLink.occurrenceDate)}
                        </a>
                        {task.eventLink.cancelled && (
                          <span role="status" className="rounded-full bg-rose px-2 py-0.5 text-xs font-medium text-rose-foreground">
                            Linked occurrence cancelled
                          </span>
                        )}
                      </dd>
                    </div>
                  </div>
                )}
                {task.series && (
                  <div className="flex items-start gap-3">
                    <Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Chore</dt>
                      <dd className="text-sm">
                        {repeatText(task.series)} <span aria-hidden="true">·</span> This occurrence is for {formatDay(task.series.occurrenceDate)}
                        {task.customized && <span className="block text-sm text-muted-foreground">Edited separately from the series</span>}
                        {task.series.archived && <span className="block text-sm text-muted-foreground">The series is archived</span>}
                        {series && series.upcoming.length > 0 && (
                          <span className="block text-sm text-muted-foreground">
                            Next: {series.upcoming.slice(0, 3).map(formatDay).join("; ")}
                          </span>
                        )}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
                  <p className="border-t border-border pt-4 text-xs text-muted-foreground">Due dates use {task.timeZone}.</p>
            </aside>
          </div>
        </article>
      )}
      {editing && task && (editing === "task" || series) && (
        <TaskFormDialog family={family} accessToken={session.access_token} userId={session.user.id}
          task={editing === "task" ? task : undefined} series={editing === "series" ? series : undefined}
          trigger={editing === "task" ? editButton : seriesButton} onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            setEditing(undefined);
            if (saved.kind === "task") {
              setTask(saved.task);
              setEdited("Changes saved");
            } else {
              setSeries(saved.series);
              setEdited("Chore changes saved");
              reload();
            }
          }} />
      )}
    </>
  );
}

function TaskLoader({ session }: { session: Session }) {
  const [state, setState] = useState<{ family: Family; taskId: string } | { error: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search);
    const familyId = query.get("family");
    const taskId = query.get("id");
    if (!familyId || !taskId || !/^[0-9a-f-]{36}$/i.test(familyId) || !/^[0-9a-f-]{36}$/i.test(taskId)) {
      setState({ error: "Task not found." });
      return;
    }
    getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}", {
      params: { path: { familyId } }, signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setState(data ? { family: data, taskId } : { error: "Task not found." });
    }).catch(() => { if (!controller.signal.aborted) setState({ error: "We couldn’t open the task." }); });
    return () => controller.abort();
  }, [session.access_token]);

  if (!state) return <FormFeedback note="Loading task…" />;
  if ("error" in state) return (
    <>
      <a href="/tasks/" className="mt-6 mb-5 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4">
        <ArrowLeft className="size-4" aria-hidden="true" />Tasks
      </a>
      <FormFeedback error={state.error} />
    </>
  );
  return <TaskDetails session={session} family={state.family} taskId={state.taskId} />;
}

export function TaskScreen() {
  return (
    <AppShell activePage="tasks">
      <div className="mx-auto max-w-6xl pb-4">
        <FamilySession>{(session) => <TaskLoader key={session.user.id} session={session} />}</FamilySession>
      </div>
    </AppShell>
  );
}
