"use client";

import { useEffect, useState } from "react";
import type { components } from "@famsync/api-client";
import { getBrowserApi } from "@/lib/browser-auth";
import { FormFeedback } from "./account-fields";
import { Button } from "./ui/button";

export function ProfileActivity({ accessToken }: { accessToken: string }) {
  const [activity, setActivity] = useState<components["schemas"]["ProfileActivityDto"]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/me/profile/activity", { signal: controller.signal });
        if (!data) throw new Error("Activity unavailable");
        if (!controller.signal.aborted) setActivity(data);
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load your activity. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, revision]);
  return <section aria-label="Your activity" className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Your activity</h2>
      <Button variant="outline" className="h-9 px-3" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
        {error ? "Try again" : "Refresh activity"}
      </Button>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Across your current families: tasks assigned to you or created by you while unassigned, and goals you created or are assigned. Archived items are excluded.</p>
    {loading && <FormFeedback note="Loading your activity…" />}
    <FormFeedback error={error} />
    {!loading && !error && activity && <dl className="mt-5 grid grid-cols-2 gap-3">
      {([["Active tasks", activity.activeTasks], ["Completed tasks", activity.completedTasks],
        ["Active goals", activity.activeGoals], ["Completed goals", activity.completedGoals]] as const).map(([label, count]) =>
        <div key={label} className="rounded-xl bg-background p-4"><dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums">{count}</dd></div>)}
    </dl>}
  </section>;
}
