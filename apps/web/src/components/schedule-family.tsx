"use client";
import { ModuleIcon } from "./ui/module-icon";


import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { ChevronsUpDown, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getBrowserApi } from "@/lib/browser-auth";
import { FormFeedback } from "./account-fields";
import { familySlotId } from "./app-shell";
import { currentFamilyKey } from "@/lib/quick-create";
import { Button, ButtonLink } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type EventRange = components["schemas"]["EventRangeDto"];

export function ScheduleFamily({
  session, section, children,
}: {
  session: Session;
  section: "today" | "calendar" | "tasks" | "goals" | "channels" | "messages" | "family-base" | 'folders';
  children: (family: Family) => ReactNode;
}) {
  const [families, setFamilies] = useState<Family[]>();
  const [requested, setRequested] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(familySlotId)), []);
  const shownFamily = families && (requested ? families.find(({ id }) => id === requested) : families[0]);
  useEffect(() => {
    if (!shownFamily) return;
    document.documentElement.dataset[currentFamilyKey] = shownFamily.id;
    return () => { delete document.documentElement.dataset[currentFamilyKey]; };
  }, [shownFamily]);

  useEffect(() => {
    const controller = new AbortController();
    setRequested(new URLSearchParams(window.location.search).get("family"));
    setError("");
    async function load() {
      try {
        const { data } = await getBrowserApi(session.access_token).GET("/api/v1/families", { signal: controller.signal });
        if (!data) throw new Error("Families unavailable");
        if (!controller.signal.aborted) setFamilies(data);
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load your families.");
      }
    }
    void load();
    return () => controller.abort();
  }, [session.access_token, revision]);

  if (error) return (
    <div className="flex flex-wrap items-center gap-3">
      <FormFeedback error={error} />
      <Button variant="outline" onClick={() => setRevision((current) => current + 1)}>Try again</Button>
    </div>
  );
  if (!families) return <FormFeedback note="Loading your family workspace…" />;
  const family = requested ? families.find(({ id }) => id === requested) : families[0];
  if (!family) return (
    <section className="grid justify-items-start gap-4 rounded-2xl border border-border bg-panel p-5">
      <p className="text-muted-foreground">
        {requested ? "Family workspace not found." : "Create or join a family to see its schedule."}
      </p>
      <ButtonLink href="/families/" className="h-9 px-4">Your families</ButtonLink>
    </section>
  );

  const switcher = <FamilySwitcher families={families} family={family} section={section} />;
  return (
    <>
      {slot ? createPortal(switcher, slot) : <div className="mt-4">{switcher}</div>}
      {children(family)}
    </>
  );
}

// The family picker lives in the shell's top bar. With one family it shows the name; with several it switches the current screen.
function FamilySwitcher({ families, family, section }: { families: Family[]; family: Family; section: string }) {
  const icon = <ModuleIcon name="families" className="pointer-events-none size-4 shrink-0 text-muted-foreground" />;
  if (families.length < 2) return (
    <p className="flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-sm font-medium" title="Current family">
      {icon}<span className="truncate">{family.name}</span>
    </p>
  );
  return (
    <div className="relative flex h-9 max-w-[min(16rem,46vw)] min-w-0 items-center rounded-lg border border-border bg-panel hover:bg-accent">
      <span className="absolute left-2.5">{icon}</span>
      <label htmlFor={section + "-family"} className="sr-only">Family</label>
      <select id={section + "-family"} value={family.id}
        className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-8 pl-8 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        onChange={(event) => window.location.assign("/" + section + "/?" + new URLSearchParams({ family: event.target.value }))}>
        {families.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
      </select>
      <ChevronsUpDown aria-hidden="true" className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
    </div>
  );
}

export function useEventRange(accessToken: string, familyId: string, start?: string, end?: string) {
  const [range, setRange] = useState<EventRange>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRange(undefined);
    setError("");
    async function load() {
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/events", {
          params: { path: { familyId }, query: { start, end } }, signal: controller.signal,
        });
        if (!data) throw new Error("Events unavailable");
        if (!controller.signal.aborted) setRange(data);
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load the family schedule.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, start, end, revision]);
  return { range, error, retry: () => setRevision((current) => current + 1) };
}
