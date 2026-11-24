"use client";

import type { components } from "@famsync/api-client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import {defaultFamily} from '@/lib/default-family';
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError, FamilyLayout, familyPath, FamilySession } from "./family-session";
import { PageHeader } from "./ui/page-header";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type FamilyInput = components["schemas"]["FamilyInputDto"];

function FamilyList({ accessToken,userId }: { accessToken: string;userId:string }) {
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
        if (!controller.signal.aborted) {
          // People work in one family: open it, and offer creation only when there is none.
          const family=defaultFamily(data);
          if(family) window.location.replace(familyPath(family.id));
          else setFamilies(data);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load your family. Try again.");
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
        window.location.assign(familyPath(data.id));
        return;
      }
      setFormError(familyError([400, 409].includes(response.status) ? error : undefined, fallback));
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
      {!families && !loadError && <FormFeedback note="Loading your family…" />}
      {families?.length === 0 && <FormFeedback note="Create a family below or open an invitation email to join one." />}
      {families && <section aria-label="Create a family" className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
        <h2 className="font-semibold">Create a family</h2>
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
      </section>}
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
