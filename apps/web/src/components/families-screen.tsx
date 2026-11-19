"use client";

import type { components } from "@famsync/api-client";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import {defaultFamily,saveDefaultFamily} from '@/lib/default-family';
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError, FamilyLayout, familyPath, FamilySession } from "./family-session";
import { ModuleIcon } from "./ui/module-icon";
import { Badge } from "./ui/badge";
import { PageHeader } from "./ui/page-header";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type FamilyInput = components["schemas"]["FamilyInputDto"];

function FamilyList({ accessToken,userId }: { accessToken: string;userId:string }) {
  const [families, setFamilies] = useState<Family[]>();
  const [defaultId,setDefaultId]=useState<string>();
  const [note,setNote]=useState('');
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [reload, setReload] = useState(0);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FamilyInput>({
    defaultValues: { name: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
  });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadError("");
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/families", { signal: controller.signal });
        if (!data) throw new Error("List unavailable");
        if (!controller.signal.aborted) {setFamilies(data);setDefaultId(defaultFamily(data,userId)?.id);}
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load your families. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, userId, reload]);

  async function createFamily(input: FamilyInput) {
    const fallback = "We couldn’t create your family. Try again.";
    setFormError("");
    try {
      const { data, error, response } = await getBrowserApi(accessToken).POST("/api/v1/families", { body: input });
      if (data) {
        saveDefaultFamily(userId,data.id);
        window.location.assign(familyPath(data.id));
        return;
      }
      setFormError(familyError(response.status === 400 ? error : undefined, fallback));
    } catch {
      setFormError(fallback);
    }
  }

  const primary=families?.find(family=>family.id===defaultId)??families?.[0];
  const others=families?.filter(family=>family.id!==primary?.id)??[];
  function makeDefault(family:Family){
    const saved=saveDefaultFamily(userId,family.id);
    setDefaultId(family.id);
    setNote(saved?family.name+' is now your default family.':'Selected '+family.name+' for this view. Browser storage is unavailable.');
  }
  return (
    <div className="grid gap-6">
      {loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <FormFeedback error={loadError} />
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Try again</Button>
        </div>
      )}
      {!families && !loadError && <FormFeedback note="Loading your families…" />}
      {families?.length === 0 && <FormFeedback note="Create a family below or open an invitation email to join one." />}
      {primary&&<section className="rounded-2xl border border-border bg-panel p-5 sm:p-6" aria-label="Default family"><a href={familyPath(primary.id)} className="flex items-center gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted"><ModuleIcon name="families" className="size-10"/></span><div className="min-w-0 grow"><div className="mb-1.5 flex flex-wrap items-center gap-2"><p className="text-xs font-medium text-muted-foreground">Default family</p><Badge tone="outline">{primary.role==='owner'?'Owner':'Member'}</Badge></div><h2 className="wrap-anywhere text-xl font-semibold">{primary.name}</h2></div><ArrowRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground"/></a><p className="mt-4 text-sm text-muted-foreground">Your everyday workspace for plans, tasks and family moments.</p></section>}
      <FormFeedback note={note}/>
      {!!others.length&&<details className="group rounded-xl border border-border bg-panel"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>Other families <span className="ml-1 text-xs font-normal text-muted-foreground">{others.length}</span></span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180"/></summary><ul aria-label="Other family workspaces" className="grid max-h-80 gap-1 overflow-y-auto border-t border-border p-2">{others.map(family=><li key={family.id} className="flex flex-wrap items-center gap-2 rounded-lg p-2 hover:bg-muted/60"><a href={familyPath(family.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><ModuleIcon name="families" className="size-7"/><span className="wrap-anywhere">{family.name}</span></a><Button variant="outline" size="sm" aria-label={'Make '+family.name+' the default family'} onClick={()=>makeDefault(family)}>Make default</Button></li>)}</ul></details>}
      <details open={families?.length===0} className="group rounded-xl border border-border bg-panel">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Plus aria-hidden="true" className="size-4"/>Create a family</span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180"/></summary>
        <div className="border-t border-border p-5 sm:p-6">
        <form className="mt-4 grid gap-4" onSubmit={handleSubmit(createFamily)}>
          <Field id="family-name" label="Family name">
            <input id="family-name" className={inputClass} required maxLength={100} {...register("name")} />
          </Field>
          <Field id="family-time-zone" label="Time zone">
            <input id="family-time-zone" className={inputClass} required maxLength={100} {...register("timeZone")} />
          </Field>
          <FormFeedback error={formError} />
          <Button className="justify-self-start" type="submit" disabled={isSubmitting}>
            <Plus aria-hidden="true" />{isSubmitting ? "Creating…" : "Create family"}
          </Button>
        </form>
        </div>
      </details>
    </div>
  );
}

export function FamiliesScreen() {
  return (
    <FamilyLayout>
      <PageHeader title="Your family" />
      <FamilySession>
        {(session) => <FamilyList key={session.user.id} accessToken={session.access_token} userId={session.user.id} />}
      </FamilySession>
    </FamilyLayout>
  );
}
