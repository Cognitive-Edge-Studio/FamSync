"use client";

import type { components } from "@famsync/api-client";
import { useEffect, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";

type Preferences = components["schemas"]["NotificationPreferencesDto"];

export function NotificationPreferences({ accessToken }: { accessToken: string }) {
  const [value, setValue] = useState<Preferences>();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getBrowserApi(accessToken).GET("/api/v1/account/notification-preferences", { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data) setValue(data);
        else setError("We couldn’t load your notification settings.");
      })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your notification settings."); });
    return () => controller.abort();
  }, [accessToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value || busy) return;
    setError("");
    setNote("");
    if (value.quietEnabled && value.quietStart === value.quietEnd) {
      setError("Quiet hours need different start and end times.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await getBrowserApi(accessToken).PUT("/api/v1/account/notification-preferences", { body: value });
      if (!data) throw new Error("Not saved");
      setValue(data);
      setNote("Notification settings saved.");
    } catch {
      setError("We couldn’t save your notification settings. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Preferences>) => setValue((current) => current && { ...current, ...patch });
  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-panel p-5 sm:p-6" aria-labelledby="notification-settings">
      <div>
        <h2 id="notification-settings" className="text-lg font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminders always appear in FamSync. Choose what also arrives by email.
        </p>
      </div>
      {!value && !error && <FormFeedback note="Loading notification settings…" />}
      {value && (
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy} className="grid min-w-0 gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={value.emailReminders}
                onChange={(event) => set({ emailReminders: event.target.checked })} />
              <span><span className="font-semibold">Email reminders</span> for tasks and events</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={value.emailUpdates}
                onChange={(event) => set({ emailUpdates: event.target.checked })} />
              <span><span className="font-semibold">Email updates</span> when you’re assigned something or a schedule changes</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={value.quietEnabled}
                onChange={(event) => set({ quietEnabled: event.target.checked })} />
              <span><span className="font-semibold">Quiet hours</span>: hold emails until they end. In-app reminders still appear.</span>
            </label>
            {value.quietEnabled && (
              <div className="grid max-w-md gap-3 sm:grid-cols-2">
                <Field id="quiet-start" label="Quiet hours start">
                  <input id="quiet-start" type="time" className={inputClass} required value={value.quietStart}
                    onChange={(event) => set({ quietStart: event.target.value })} />
                </Field>
                <Field id="quiet-end" label="Quiet hours end">
                  <input id="quiet-end" type="time" className={inputClass} required value={value.quietEnd}
                    onChange={(event) => set({ quietEnd: event.target.value })} />
                </Field>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Quiet hours use each family’s time zone.</p>
          </fieldset>
          <FormFeedback error={error} note={note} />
          <Button type="submit" className="h-9 justify-self-start px-4" disabled={busy}>
            {busy ? "Saving…" : "Save notification settings"}
          </Button>
        </form>
      )}
      {!value && <FormFeedback error={error} />}
    </section>
  );
}
