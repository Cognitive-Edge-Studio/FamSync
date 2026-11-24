"use client";

import type { components } from "@famsync/api-client";
import { useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { FormFeedback } from "./account-fields";
import { Button } from "./ui/button";

type Settings = components["schemas"]["ChatPrivacyDto"];
const options = [
  { key: "shareReceipts", label: "Read receipts", text: "Show others when you have read their messages. When off, you won’t see theirs either. Delivery is always shown." },
  { key: "sharePresence", label: "Online, last seen and typing", text: "Show your family when you are online, were last seen, or are typing. When off, you won’t see theirs either, and nothing is stored." },
] as const;

export function ChatPrivacy({ accessToken }: { accessToken: string }) {
  const [settings, setSettings] = useState<Settings>(), [reload, setReload] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getBrowserApi(accessToken).GET("/api/v1/me/chat-privacy", { signal: controller.signal })
      .then(({ data }) => { if (controller.signal.aborted) return; if (data) setSettings(data); else setError("We couldn’t load your chat privacy. Try again."); })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your chat privacy. Try again."); });
    return () => controller.abort();
  }, [accessToken, reload]);
  async function change(next: Settings) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { data } = await getBrowserApi(accessToken).PUT("/api/v1/me/chat-privacy", { body: next });
      if (!data) throw new Error();
      setSettings(data);
      setNote("Chat privacy saved.");
    } catch { setError("We couldn’t save your chat privacy. Try again."); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Chat privacy</h2>
      <div className="mt-4 grid gap-3">
        {settings && options.map(({ key, label, text }) => (
          <label key={key} className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={settings[key]} disabled={busy} onChange={(event) => void change({ ...settings, [key]: event.target.checked })} />
            <span><span className="block text-sm font-semibold">{label}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
          </label>
        ))}
      </div>
      <FormFeedback error={error} note={!settings && !error ? "Loading chat privacy…" : note} />
      {!settings && error && <Button variant="outline" className="mt-2" onClick={() => setReload((value) => value + 1)}>Try again</Button>}
    </section>
  );
}
