"use client";

import type { Session } from "@supabase/auth-js";
import { ArrowLeft, Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels, formatDay } from "@/lib/calendar-date";
import { goalModeLabels, goalPriorityLabels, goalProgressText, goalsPath, goalTypeLabels, type GoalDetail } from "@/lib/goals";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { AppShell } from "./app-shell";
import { familyError, FamilySession } from "./family-session";
import { GoalFormDialog } from "./goal-form-dialog";
import { GoalTaskLinker } from "./goal-task-linker";
import { statusLabels, taskPath } from "@/lib/tasks";
import { categoryTones } from "./goal-card";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { PageHeader } from "./ui/page-header";
import { GoalProgressBar } from "./ui/progress-bar";
import { Button } from "./ui/button";

type Result = { data?: GoalDetail; error?: unknown; response: Response };
type GoalItem = GoalDetail["checklist"][number];

function ChecklistRow({ item, familyId, canEdit, canProgress, busy, update, remove }: {
  familyId: string;
  item: GoalItem; canEdit: boolean; canProgress: boolean; busy: boolean;
  update: (data: { label?: string; completed?: boolean }) => Promise<boolean>;
  remove: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (await update({ label })) setEditing(false);
  }
  if (item.task) return <li className="flex items-start justify-between gap-2 py-3">
    <div className="flex min-w-0 items-start gap-3">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={item.completed} disabled aria-label={item.label} />
      <div className="min-w-0"><a href={taskPath(familyId, item.task.id)} className="text-sm font-medium underline underline-offset-4 wrap-anywhere">{item.label}</a>
        <p className="mt-1 text-xs text-muted-foreground">{item.task.archived ? "Archived task · Excluded from progress" : statusLabels[item.task.status] + " · Progress follows task"}</p>
      </div>
    </div>
    {canEdit && <Button variant="ghost" className="h-9 shrink-0 px-3" aria-label={"Unlink " + item.label} disabled={busy} onClick={() => void remove()}>Unlink</Button>}
  </li>;
  return <li className="flex flex-wrap items-center justify-between gap-2 py-3">
    {editing ? <form className="flex min-w-0 grow flex-wrap gap-2" onSubmit={(event) => void rename(event)}>
      <input aria-label="Step label" className={inputClass + " flex-1 basis-40"} required maxLength={120}
        value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
      <Button type="submit" variant="outline" className="h-9 px-3" disabled={busy}>Save step</Button>
      <Button variant="ghost" className="h-9 px-3" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
    </form> : <>
      <label className="flex min-w-0 grow items-start gap-3">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={item.completed} disabled={!canProgress || busy}
          onChange={(event) => void update({ completed: event.target.checked })} />
        <span className={"wrap-anywhere text-sm " + (item.completed ? "text-muted-foreground line-through" : "")}>{item.label}</span>
      </label>
      {canEdit && <div className="flex gap-1">
        <Button variant="ghost" size="icon-lg" aria-label={"Rename " + item.label} disabled={busy}
          onClick={() => { setLabel(item.label); setEditing(true); }}><Pencil aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon-lg" aria-label={"Remove " + item.label} disabled={busy}
          onClick={() => void remove()}><Trash2 aria-hidden="true" /></Button>
      </div>}
    </>}
  </li>;
}

function GoalDetails({ session }: { session: Session }) {
  const [goal, setGoal] = useState<GoalDetail>();
  const [familyId, setFamilyId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState("");
  const [current, setCurrent] = useState("");
  const [revision, setRevision] = useState(0);
  const stepId = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const family = params.get("family"), id = params.get("id");
    setLoadError("");
    async function load() {
      if (!family || !id) { setLoadError("Goal not found."); return; }
      try {
        const { data, response } = await getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}/goals/{goalId}", {
          params: { path: { familyId: family, goalId: id } }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (data) {
          setGoal(data); setFamilyId(family); setCurrent(String(data.current ?? 0));
          if (params.has("created")) {
            setNote("Goal created.");
            params.delete("created");
            window.history.replaceState(null, "", "/goal/?" + params);
          }
          return;
        }
        if ([400, 404].includes(response.status)) { setGoal(undefined); setLoadError("Goal not found."); return; }
        throw new Error("Goal unavailable");
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load this goal.");
      }
    }
    void load();
    return () => controller.abort();
  }, [session.access_token, revision]);

  async function change(call: (api: ReturnType<typeof getBrowserApi>) => Promise<Result>, success: string) {
    if (busy) return false;
    setBusy(true); setError(""); setNote("");
    const fallback = "We couldn’t save the goal change. Try again.";
    try {
      const { data, error, response } = await call(getBrowserApi(session.access_token));
      if (data) {
        setGoal(data); setCurrent(String(data.current ?? 0)); setNote(success);
        return true;
      }
      setError(familyError([400, 403, 404, 409].includes(response.status) ? error : undefined, fallback));
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
    return false;
  }

  function progress(completed?: boolean) {
    if (!goal) return;
    const body = goal.mode === "manual" ? { version: goal.version, completed } : { version: goal.version, current: Number(current) };
    return change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/progress", {
      params: { path: { familyId, goalId: goal.id } }, body,
    }), goal.mode === "manual" ? completed ? "Goal completed." : "Goal reopened." : "Goal progress saved.");
  }

  async function addStep(event: FormEvent) {
    event.preventDefault();
    if (!goal || !step.trim()) return;
    stepId.current ||= crypto.randomUUID();
    const saved = await change((api) => api.POST("/api/v1/families/{familyId}/goals/{goalId}/checklist", {
      params: { path: { familyId, goalId: goal.id } }, body: { version: goal.version, id: stepId.current, label: step.trim() },
    }), "Checklist step added.");
    if (saved) { setStep(""); stepId.current = ""; }
  }

  function reload() { setError(""); setNote(""); setRevision((value) => value + 1); }

  return <>
    {(!goal || loadError) && <a className="mt-6 mb-5 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
      href={familyId ? goalsPath(familyId) : "/goals/"}><ArrowLeft className="size-4" aria-hidden="true" />All goals</a>}
    {loadError && <div className="flex flex-wrap gap-3"><FormFeedback error={loadError} />
      {loadError !== "Goal not found." && <Button variant="outline" onClick={reload}>Try again</Button>}</div>}
    {!goal && !loadError && <FormFeedback note="Loading goal…" />}
    {goal && !loadError && <article className="grid gap-5">
      <PageHeader className="mb-0" title={goal.title} crumbs={[{ label: "Goals", href: goalsPath(familyId) }, { label: goal.title }]}
        description={<span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{goalTypeLabels[goal.type]}</Badge>
          <Badge tone={({ high: "rose", medium: "peach", low: "sky" } as const)[goal.priority]}>{goalPriorityLabels[goal.priority]} priority</Badge>
          {goal.status === "completed" && <Badge tone="sage">Completed</Badge>}
          {goal.archived && <Badge tone="outline"><Archive aria-hidden="true" className="size-3" />Archived goal</Badge>}
        </span>}
        actions={goal.canEdit && <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />Edit goal
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void change(
            (api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/archive", {
              params: { path: { familyId, goalId: goal.id } }, body: { version: goal.version, archived: !goal.archived },
            }), goal.archived ? "Goal restored." : "Goal archived.",
          )}>{goal.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {goal.archived ? "Restore goal" : "Archive goal"}
          </Button>
        </div>} />
      {(error || note) && <div className="flex flex-wrap items-center gap-3"><FormFeedback error={error} note={note} />
        {error && <Button variant="outline" onClick={reload}>Reload goal</Button>}</div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-5 rounded-2xl border border-border bg-panel p-4 sm:p-6">
      <section className="grid gap-3 rounded-xl bg-muted/60 p-4" aria-label="Goal progress">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{goalModeLabels[goal.mode]} · {goalProgressText(goal)}</p>
          {goal.percentage !== null && <span className="text-2xl font-medium">{Math.round(goal.percentage)}%</span>}</div>
        {goal.percentage !== null && <GoalProgressBar value={goal.percentage} tone={goal.status === "completed" ? "sage" : categoryTones[goal.category] ?? "lavender"} />}
        {goal.needsReassignment && <p className="text-sm text-destructive">Needs reassignment. The creator can choose a current family member.</p>}
        {goal.mode === "manual" && goal.canProgress && <Button className="justify-self-start" disabled={busy}
          onClick={() => void progress(goal.status !== "completed")}>{goal.status === "completed" ? "Reopen goal" : "Complete goal"}</Button>}
        {goal.mode === "numeric" && goal.canProgress && <form className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => { event.preventDefault(); void progress(); }}>
          <Field id="goal-current" label={"Current value (" + goal.unit + ")"}>
            <input id="goal-current" className={inputClass} type="number" min="0" max="999999999999.99" step="0.01" required
              value={current} onChange={(event) => setCurrent(event.target.value)} disabled={busy} />
          </Field>
          <Button type="submit" disabled={busy}>Set progress</Button>
        </form>}
      </section>
      {goal.description && <section><h2 className="mb-2 font-semibold">Description</h2>
        <p className="wrap-anywhere whitespace-pre-wrap">{goal.description}</p></section>}
      {goal.mode === "checklist" && <section className="border-t border-border pt-5">
        <h2 className="font-semibold">Checklist <span className="text-sm font-normal text-muted-foreground">{goal.completedCount}/{goal.itemCount}</span></h2>
        <ul className="mt-2 divide-y divide-border" aria-label="Goal checklist">
          {goal.checklist.map((item) => <ChecklistRow key={item.id} item={item} familyId={familyId} canEdit={goal.canEdit && !goal.archived}
            canProgress={goal.canProgress} busy={busy}
            update={(body) => change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/checklist/{itemId}", {
              params: { path: { familyId, goalId: goal.id, itemId: item.id } }, body: { ...body, version: goal.version },
            }), body.label === undefined ? "Checklist progress saved." : "Checklist step renamed.")}
            remove={() => change((api) => api.DELETE(item.task ? "/api/v1/families/{familyId}/goals/{goalId}/task-links/{itemId}" : "/api/v1/families/{familyId}/goals/{goalId}/checklist/{itemId}", {
              params: { path: { familyId, goalId: goal.id, itemId: item.id } }, body: { version: goal.version },
            }), item.task ? "Task unlinked." : "Checklist step removed.")} />)}
        </ul>
        {goal.canEdit && !goal.archived && <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => void addStep(event)}>
          <div className="min-w-0 grow"><Field id="goal-new-step" label="New checklist step">
            <input id="goal-new-step" className={inputClass} required maxLength={120} value={step}
              onChange={(event) => setStep(event.target.value)} disabled={busy || goal.itemCount >= 100} />
          </Field></div>
          <Button type="submit" variant="outline" disabled={busy || !step.trim() || goal.itemCount >= 100}>
            <Plus aria-hidden="true" />Add step
          </Button>
        </form>}
        {goal.canEdit && !goal.archived && <GoalTaskLinker key={goal.id + ':' + goal.version + ':' + revision} accessToken={session.access_token} familyId={familyId}
          goalId={goal.id} version={goal.version} busy={busy} full={goal.itemCount >= 100}
          link={(task, id) => change((api) => api.POST("/api/v1/families/{familyId}/goals/{goalId}/task-links", {
            params: { path: { familyId, goalId: goal.id } }, body: { id, version: goal.version, taskId: task.id, taskVersion: task.version },
          }), "Task linked.")} />}
      </section>}
      </div>
      <aside aria-labelledby="goal-details-title" className="grid gap-4 rounded-2xl border border-border bg-panel p-4 sm:p-6">
        <h2 id="goal-details-title" className="text-lg font-semibold">Details</h2>
        <dl className="grid gap-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{goal.category}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Visible to</dt><dd>{goal.audience && audienceLabels[goal.audience]}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Created by</dt><dd className="flex items-center gap-2 wrap-anywhere"><Avatar name={goal.author.name} colorKey={goal.author.userId} size="sm" />{goal.author.name}</dd></div>
          {goal.type === "individual" && <div><dt className="text-xs text-muted-foreground">Assignee</dt><dd className="flex items-center gap-2 wrap-anywhere">
            {goal.needsReassignment ? <Badge tone="rose">Needs reassignment</Badge> : goal.assignee && <><Avatar name={goal.assignee.name} colorKey={goal.assignee.userId} size="sm" />{goal.assignee.name}</>}</dd></div>}
          {goal.targetDate && <div><dt className="text-xs text-muted-foreground">Target date</dt><dd>
            {formatDay(goal.targetDate)}{goal.pastTarget && <span className="block text-destructive">Past target date</span>}</dd></div>}
        </dl>
      </aside>
      </div>
    </article>}
    {editing && goal && <GoalFormDialog existing={goal} familyId={familyId} accessToken={session.access_token}
      userId={session.user.id} onClose={() => setEditing(false)}
      onSaved={(data) => { setGoal(data); setCurrent(String(data.current ?? 0)); setEditing(false); setError(""); setNote("Goal updated."); }} />}
  </>;
}

export function GoalScreen() {
  return <AppShell activePage="goals"><div className="mx-auto max-w-6xl pb-4">
    <FamilySession>{(session) => <GoalDetails key={session.user.id} session={session} />}</FamilySession>
  </div></AppShell>;
}
