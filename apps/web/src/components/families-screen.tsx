"use client";

import type { components } from "@famsync/api-client";
import { useEffect, useState } from "react";
import { ArrowRight, House, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError, FamilyLayout, familyPath, FamilySession } from "./family-session";
import { ModuleIcon } from "./ui/module-icon";
import { Badge } from "./ui/badge";
import { PageHeader } from "./ui/page-header";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type FamilyInput = components["schemas"]["FamilyInputDto"];

function FamilyList({ accessToken }: { accessToken: string }) {
  const [families, setFamilies] = useState<Family[]>();
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
        if (!controller.signal.aborted) setFamilies(data);
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load your families. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, reload]);

  async function createFamily(input: FamilyInput) {
    const fallback = "We couldn’t create your family. Try again.";
    setFormError("");
    try {
      const { data, error, response } = await getBrowserApi(accessToken).POST("/api/v1/families", { body: input });
      if (data) {
        window.location.assign(familyPath(data.id));
        return;
      }
      setFormError(familyError(response.status === 400 ? error : undefined, fallback));
    } catch {
      setFormError(fallback);
    }
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
      {!!families?.length && (
        <ul className="grid max-h-[32rem] gap-0.5 overflow-y-auto rounded-2xl border border-border bg-panel p-2" aria-label="Your family workspaces">
          {families.map((family) => (
            <li key={family.id}>
              <a href={familyPath(family.id)}
                className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <ModuleIcon name="families" className="size-8" />
                <span className="min-w-0 grow truncate text-sm font-medium">{family.name}</span>
                <Badge tone={family.role === "owner" ? "solid" : "outline"}>{family.role === "owner" ? "Owner" : "Member"}</Badge>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Create a family</h2>
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
      </section>
    </div>
  );
}

export function FamiliesScreen() {
  return (
    <FamilyLayout>
      <PageHeader title="Your families" />
      <FamilySession>
        {(session) => <FamilyList key={session.user.id} accessToken={session.access_token} />}
      </FamilySession>
    </FamilyLayout>
  );
}
