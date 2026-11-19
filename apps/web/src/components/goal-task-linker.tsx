"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { components } from "@famsync/api-client";
import { getBrowserApi } from "@/lib/browser-auth";
import { formatDay } from "@/lib/calendar-date";
import { statusLabels } from "@/lib/tasks";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";

type Candidate = components["schemas"]["LinkableTaskDto"];
export function GoalTaskLinker({ accessToken, familyId, goalId, version, busy, full, link }: {
  accessToken: string; familyId: string; goalId: string; version: number; busy: boolean; full: boolean;
  link: (task: Candidate, itemId: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const itemId = useRef("");
  useEffect(() => {
    setCursor(null); setTasks([]); setSelected(""); itemId.current = "";
  }, [version, search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/goals/{goalId}/linkable-tasks", {
          params: { path: { familyId, goalId }, query: { q: search || undefined, cursor: cursor ?? undefined, limit: 20 } },
          signal: controller.signal,
        });
        if (!data) throw new Error("Tasks unavailable");
        if (!controller.signal.aborted) {
          setTasks((old) => cursor ? [...new Map([...old, ...data.tasks].map((task) => [task.id, task])).values()] : data.tasks);
          setNextCursor(data.nextCursor);
        }
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load matching tasks. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, goalId, version, search, cursor, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const task = tasks.find((candidate) => candidate.id === selected);
    if (!task) return;
    itemId.current ||= crypto.randomUUID();
    if (await link(task, itemId.current)) { itemId.current = ""; setSelected(""); }
  }
  return <div className="mt-5 grid gap-3 rounded-xl bg-background p-4">
    <h3 className="font-semibold">Link an existing task</h3>
    <p className="text-sm text-muted-foreground">Matching audiences only. Progress follows the task automatically. Archived tasks stop contributing until restored.</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setRevision((value) => value + 1); }}>
      <div className="min-w-0 grow"><Field id="goal-task-search" label="Search tasks">
        <input id="goal-task-search" className={inputClass} maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field></div>
      <Button type="submit" variant="outline" className="h-9 px-3" disabled={loading || busy}>Search</Button>
    </form>
    <FormFeedback error={error} note={loading ? "Loading matching tasks…" : undefined} />
    {error && <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry tasks</Button>}
    {!error && tasks.length > 0 && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void submit(event)}>
      <div className="min-w-0 grow"><Field id="goal-linked-task" label="Task to link">
        <select id="goal-linked-task" className={inputClass + " w-full"} value={selected} disabled={loading || busy || full}
          onChange={(event) => { setSelected(event.target.value); itemId.current = ""; }}>
          <option value="">Choose a task</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {statusLabels[task.status]}{task.dueDate ? " · " + formatDay(task.dueDate) : ""}</option>)}
        </select>
      </Field></div>
      <Button type="submit" variant="outline" className="h-9 px-3" disabled={!selected || loading || busy || full}>Link task</Button>
    </form>}
    {!error && !loading && tasks.length === 0 && <p className="text-sm text-muted-foreground">No matching tasks. Create a task with this goal’s audience or try another search.</p>}
    {nextCursor && !error && <Button variant="ghost" disabled={loading || busy} onClick={() => setCursor(nextCursor)}>Load more tasks</Button>}
    {full && <p className="text-sm text-muted-foreground">This goal has reached its limit of 100 steps.</p>}
  </div>;
}
