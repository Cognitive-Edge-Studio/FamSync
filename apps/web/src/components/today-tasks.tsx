"use client";
import { ModuleIcon } from "./ui/module-icon";


import { ArrowRight, ListChecks } from "lucide-react";
import { useState } from "react";
import { tasksPath } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { FormFeedback } from "./account-fields";
import { TaskCard } from "./task-card";
import { useTaskStatus } from "./task-status";
import { useTaskList, useTaskSummary } from "./tasks-screen";
import { Button, ButtonLink } from "./ui/button";
import { Segmented } from "./ui/segmented";
import { AnimatePresence } from "motion/react";

export type TaskScope = "mine" | "all";

// Due-today and overdue work for Today. It shares the task queries and status rules with Tasks.
export function useTodayTasks(accessToken: string, familyId: string) {
  const [scope, setScope] = useState<TaskScope>("mine");
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const status = useTaskStatus(accessToken, familyId, refresh);
  const summary = useTaskSummary(accessToken, familyId, scope, revision);
  const list = useTaskList(accessToken, familyId, { due: "today", ...(scope === "mine" ? { scope: "mine" } : {}) }, revision);
  return { scope, setScope, status, summary, list, revision };
}

export function TodayTasks({ familyId, state }: { familyId: string; state: ReturnType<typeof useTodayTasks> }) {
  const { scope, setScope, status, list } = state;
  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6" aria-labelledby="today-tasks-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-sage text-sage-foreground">
            <ModuleIcon name="tasks" className="size-5" />
          </span>
          <div>
            <h2 id="today-tasks-title" className="text-lg font-semibold">Tasks due today</h2>
            <p className="text-sm text-muted-foreground">Including anything overdue</p>
          </div>
        </div>
        <Segmented label="Whose tasks" value={scope} onChange={setScope}
          options={[{ value: "mine", label: "My items" }, { value: "all", label: "Whole family" }]} />
      </div>
      <div className="mt-4">{status.feedback}</div>
      {list.error ? (
        <div className="mt-4"><FormFeedback error={list.error} /></div>
      ) : !list.tasks ? (
        <div className="mt-4"><FormFeedback note="Loading tasks…" /></div>
      ) : list.tasks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {scope === "mine" ? "Nothing due for you today." : "Nothing due for the family today."}
        </p>
      ) : (
        <ul className={cn("mt-4 grid gap-2")}>
          <AnimatePresence initial={false} mode="popLayout">
            {list.tasks.map((task) => (
              <TaskCard key={task.id} task={task} familyId={familyId} today={list.today} showStatus
                busy={status.busy === task.id} onChange={(next) => void status.change(task, next)} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {list.hasMore && (
        <Button variant="outline" className="mt-3 h-9 px-3" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
          {list.loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
      <ButtonLink href={tasksPath(familyId)} variant="outline" className="mt-4 h-9 gap-2 px-3">
        All tasks<ArrowRight aria-hidden="true" />
      </ButtonLink>
    </section>
  );
}
