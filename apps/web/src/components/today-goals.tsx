"use client";

import { ArrowRight } from "lucide-react";
import { ModuleIcon } from "./ui/module-icon";
import { useState } from "react";
import { goalsPath, percentageText } from "@/lib/goals";
import { FormFeedback } from "./account-fields";
import { GoalCard } from "./goal-card";
import { useGoalCollection } from "./goals-screen";
import { Button, ButtonLink } from "./ui/button";
import { Segmented } from "./ui/segmented";

export function TodayGoals({ familyId, accessToken }: { familyId: string; accessToken: string }) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const { page, summary, error, retry } = useGoalCollection(accessToken, familyId, { status: "active", scope, limit: 3 });
  return <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6" aria-labelledby="today-goals-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-lavender text-lavender-foreground"><ModuleIcon name="goals" className="size-9" /></span>
        <div>
          <h2 id="today-goals-title" className="text-lg font-semibold">Goal progress</h2>
          {summary && <p className="text-sm text-muted-foreground">
            {summary.active} active · {summary.completed} completed · Average progress {percentageText(summary.average)}
          </p>}
        </div>
      </div>
      <Segmented label="Whose goals" value={scope} onChange={setScope}
        options={[{ value: "mine", label: "My items" }, { value: "all", label: "Whole family" }]} />
    </div>
    <div className="mt-4 grid gap-3">
      {error && <div className="flex flex-wrap gap-3"><FormFeedback error={error} /><Button variant="outline" onClick={retry}>Try again</Button></div>}
      {!page && !error && <FormFeedback note="Loading goals…" />}
      {page?.goals.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">No active goals in this view.</p>}
      {!!page?.goals.length && <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1" aria-label="Active goals">
        {page.goals.map((goal) => <li className="min-w-0" key={goal.id}><GoalCard goal={goal} familyId={familyId} /></li>)}
      </ul>}
    </div>
    <ButtonLink href={goalsPath(familyId)} variant="outline" className="mt-4 gap-2">View all goals<ArrowRight aria-hidden="true" /></ButtonLink>
  </section>;
}
