"use client";

import { useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { enablePush, forgetPush, pushEnabled, pushSupported } from "@/lib/push";
import { FormFeedback } from "./account-fields";
import { Button } from "./ui/button";

export function PushPreferences({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [publicKey, setPublicKey] = useState<string>(), [supported, setSupported] = useState(true), [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setSupported(pushSupported());
    void pushEnabled(userId).then((value) => { if (!controller.signal.aborted) setEnabled(value); }).catch(() => {});
    getBrowserApi(accessToken).GET("/api/v1/me/push", { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { if (data) setPublicKey(data.publicKey); else setError("We couldn’t check push notifications. Try again later."); } })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t check push notifications. Try again later."); });
    return () => controller.abort();
  }, [accessToken, userId]);
  async function change() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (enabled) {
        if (!await forgetPush(accessToken)) throw new Error("We couldn’t turn off push. Try again.");
        setEnabled(false);
        setNote("Push is off in this browser.");
      } else {
        await enablePush(accessToken, userId, publicKey ?? "");
        setEnabled(true);
        setNote("Push is on in this browser.");
      }
    } catch (problem) {
      setError(problem instanceof DOMException ? "Your browser couldn’t connect to its push service." : problem instanceof Error ? problem.message : "We couldn’t change push. Try again.");
    } finally { setBusy(false); }
  }
  return (
    <section className="grid gap-3 rounded-2xl border border-border bg-panel p-5 sm:p-6" aria-labelledby="push-settings">
      <div>
        <h2 id="push-settings" className="text-lg font-semibold">Push on this device</h2>
        <p className="mt-1 text-sm text-muted-foreground">Get messages, reminders and changes when FamSync is closed. Lock screens show only what kind of notification it is. Muted chats stay quiet, and quiet hours make push silent.</p>
      </div>
      {!supported ? <p className="text-sm text-muted-foreground">This browser doesn’t support push. On iPhone and iPad, add FamSync to the Home Screen first.</p>
        : publicKey === "" ? <p className="text-sm text-muted-foreground">Push is not available on this server yet.</p>
        : publicKey !== undefined && <Button className="justify-self-start" variant={enabled ? "outline" : "default"} disabled={busy} onClick={() => void change()}>{busy ? "Working…" : enabled ? "Turn off push" : "Turn on push"}</Button>}
      <FormFeedback error={error} note={note} />
    </section>
  );
}
