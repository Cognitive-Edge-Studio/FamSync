"use client";

import type { components } from "@famsync/api-client";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";

type Preferences = components["schemas"]["PrivacyPreferencesDto"];
const sections = [
  { name: "calendar", label: "Calendar" },
  { name: "tasks", label: "Tasks" },
  { name: "goals", label: "Goals" },
] as const;

export function PrivacyPreferences({ accessToken }: { accessToken: string }) {
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { register, handleSubmit, reset, formState: { isSubmitting, dirtyFields } } = useForm<Preferences>();
  const hasChanges = Object.keys(dirtyFields).length > 0;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadError("");
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/me/privacy", { signal: controller.signal });
        if (!data) throw new Error("Preferences unavailable");
        if (!controller.signal.aborted) {
          reset(data, { keepDirtyValues: true });
          setReady(true);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load your privacy preferences. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, reload, reset]);

  async function save(body: Preferences) {
    setError("");
    setNote("");
    try {
      const { data } = await getBrowserApi(accessToken).PUT("/api/v1/me/privacy", { body });
      if (!data) throw new Error("Preferences were not saved");
      reset(data);
      setNote("Privacy preferences saved.");
    } catch {
      setError("We couldn’t save your privacy preferences. Try again.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Shield className="size-5 text-primary" aria-hidden="true" />Privacy preferences
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">These defaults apply to new items. You can choose a different audience when creating an item.</p>
      {loadError && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FormFeedback error={loadError} />
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Try again</Button>
        </div>
      )}
      {!ready && !loadError && <div className="mt-4"><FormFeedback note="Loading privacy preferences…" /></div>}
      {ready && (
        <form className="mt-4 grid gap-4" onSubmit={handleSubmit(save)}>
          <fieldset className="grid min-w-0 gap-4" disabled={isSubmitting}>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
              <input className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" {...register("privateMode")} />
              <span>
                <span className="block text-sm font-semibold">Private Mode</span>
                <span className="block text-sm text-muted-foreground">Start all new items as Only me when enabled.</span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {sections.map(({ name, label }) => (
                <Field key={name} id={"privacy-" + name} label={label + " default"}>
                  <select className={inputClass} id={"privacy-" + name} {...register(name)}>
                    <option value="family">Family</option>
                    <option value="selected">Selected members</option>
                    <option value="private">Only me</option>
                  </select>
                </Field>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">With Selected members, you choose who can see each item when you create it.</p>
          </fieldset>
          <FormFeedback error={error} note={note} />
          <Button className="h-9 justify-self-start px-4" type="submit" disabled={isSubmitting || !hasChanges}>
            {isSubmitting ? "Saving…" : "Save privacy preferences"}
          </Button>
        </form>
      )}
    </section>
  );
}
