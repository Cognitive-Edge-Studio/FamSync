"use client";
import { takeCreateRequest } from "@/lib/quick-create";

import type { Session } from "@supabase/auth-js";
import type { components } from "@famsync/api-client";
import { CheckCircle2, Flag, Plus, Target, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { percentageText, type Goal, type GoalPage, type GoalSummary } from "@/lib/goals";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { AppShell } from "./app-shell";
import { FamilySession } from "./family-session";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { ScheduleFamily } from "./schedule-family";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { FadeIn } from "./ui/motion";
import { PageHeader } from "./ui/page-header";
import { Segmented } from "./ui/segmented";

type GoalFilters = {
  type?: Goal["type"]; status?: "active" | "completed"; scope?: "mine" | "all"; archived?: "true" | "false"; limit?: number;
};
type Family = components["schemas"]["FamilyDto"];

export function useGoalCollection(accessToken: string, familyId: string, filters: GoalFilters) {
  const [page, setPage] = useState<GoalPage>();
  const [summary, setSummary] = useState<GoalSummary>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeRequest = useRef<AbortController>(null);
  const key = JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    setPage(undefined);
    setSummary(undefined);
    setError("");
    setLoadingMore(false);
    async function load() {
      const query: GoalFilters = JSON.parse(key);
      try {
        const api = getBrowserApi(accessToken);
        const [list, totals] = await Promise.all([
          api.GET("/api/v1/families/{familyId}/goals", {
            params: { path: { familyId }, query }, signal: controller.signal,
          }),
          api.GET("/api/v1/families/{familyId}/goals/summary", {
            params: { path: { familyId }, query: { scope: query.scope, type: query.type } }, signal: controller.signal,
          }),
        ]);
        if (!list.data || !totals.data) throw new Error("Goals unavailable");
        if (!controller.signal.aborted) { setPage(list.data); setSummary(totals.data); }
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load the goals. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, key, revision]);

  async function more() {
    if (!page?.nextCursor || loadingMore) return;
    const controller = activeRequest.current;
    if (!controller) return;
    setLoadingMore(true);
    setError("");
    try {
      const query: GoalFilters = JSON.parse(key);
      const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/goals", {
        params: { path: { familyId }, query: { ...query, cursor: page.nextCursor } }, signal: controller.signal,
      });
      if (!data) throw new Error("More goals unavailable");
      if (!controller.signal.aborted) setPage((current) => current && {
        ...data, goals: [...current.goals, ...data.goals.filter((goal) => !current.goals.some(({ id }) => id === goal.id))],
      });
    } catch {
      if (!controller.signal.aborted) setError("We couldn’t load more goals. Try again.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }
  return { page, summary, error, retry: () => setRevision((value) => value + 1), more, loadingMore };
}

export function GoalSummaryCards({ summary }: { summary?: GoalSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Goal totals">
      {([
        ["Total goals", summary?.total, Target, "bg-sky text-sky-foreground"], ["Active goals", summary?.active, Flag, "bg-lavender text-lavender-foreground"],
        ["Completed goals", summary?.completed, CheckCircle2, "bg-sage text-sage-foreground"],
        ["Average progress", summary ? percentageText(summary.average) : undefined, TrendingUp, "bg-peach text-peach-foreground"],
      ] as const).map(([label, value, Icon, tint], index) => (
        <FadeIn index={index} key={label} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-panel p-4 sm:p-5">
          <div><h2 className="text-sm font-normal text-muted-foreground">{label}</h2>
            <p className="mt-1 text-2xl leading-8 font-medium">{value ?? "—"}</p></div>
          <span className={"grid size-10 shrink-0 place-items-center rounded-full " + tint}><Icon aria-hidden="true" className="size-5" /></span>
        </FadeIn>
      ))}
    </div>
  );
}

function GoalWorkspace({ family, session }: { family: Family; session: Session }) {
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "archived">("all");
  const [type, setType] = useState<"" | Goal["type"]>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [creating, setCreating] = useState(() => takeCreateRequest("goal"));
  const { page, summary, error, retry, more, loadingMore } = useGoalCollection(session.access_token, family.id, {
    status: filter === "active" || filter === "completed" ? filter : undefined,
    archived: filter === "archived" ? "true" : "false", type: type || undefined, scope,
  });
  const counts = { all: summary?.total, active: summary?.active, completed: summary?.completed, archived: summary?.archived };

  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title="Goals"
        actions={<Button className="gap-2" onClick={() => setCreating(true)}><Plus aria-hidden="true" />New goal</Button>} />
      <GoalSummaryCards summary={summary} />
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-panel p-4 sm:p-5">
        <Segmented label="Goal status" value={filter} onChange={setFilter} className="h-auto flex-wrap"
          options={(["all", "active", "completed", "archived"] as const).map((value) => ({ value,
            label: <>{value[0].toUpperCase() + value.slice(1)}{counts[value] !== undefined && <span className="text-xs text-muted-foreground">{counts[value]}</span>}</> }))} />
        <div className="flex flex-wrap gap-3">
          <Field id="goal-type-filter" label="Goal type">
            <select id="goal-type-filter" className={inputClass} value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="">All types</option><option value="family">Family</option><option value="individual">Individual</option>
            </select>
          </Field>
          <Field id="goal-scope-filter" label="Whose goals">
            <select id="goal-scope-filter" className={inputClass} value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
              <option value="all">Whole family</option><option value="mine">My items</option>
            </select>
          </Field>
        </div>
      </div>
      {error && <div className="flex flex-wrap items-center gap-3"><FormFeedback error={error} />
        <Button variant="outline" onClick={retry}>Try again</Button></div>}
      {!page && !error && <FormFeedback note="Loading goals…" />}
      {page?.goals.length === 0 && <EmptyState icon="goals" tone="lavender" title="No goals in this view">Create a goal or change the filters.</EmptyState>}
      {!!page?.goals.length && <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Goals">
        {page.goals.map((goal, index) => <li className="min-w-0" key={goal.id}><FadeIn index={index} className="h-full"><GoalCard goal={goal} familyId={family.id} /></FadeIn></li>)}
      </ul>}
      {page?.nextCursor && <Button variant="outline" className="justify-self-start" disabled={loadingMore}
        onClick={() => void more()}>{loadingMore ? "Loading…" : "Load more"}</Button>}
      {creating && <GoalFormDialog familyId={family.id} accessToken={session.access_token} userId={session.user.id}
        onClose={() => setCreating(false)} />}
    </div>
  );
}

export function GoalsScreen() {
  return <AppShell activePage="goals"><div className="pb-4">
    <FamilySession>{(session) => <ScheduleFamily key={session.user.id} session={session} section="goals">
      {(family) => <GoalWorkspace key={family.id} family={family} session={session} />}
    </ScheduleFamily>}</FamilySession>
  </div></AppShell>;
}
