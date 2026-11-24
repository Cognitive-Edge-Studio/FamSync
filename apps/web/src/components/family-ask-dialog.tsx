"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { universeGroups, type FamilyBaseGraph } from "@/lib/family-base";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Status = components["schemas"]["FamilyAiStatusDto"];
export type FamilyAnswer = { question: string; answer: string; nodeIds: string[] };
const examples = ["What’s due this week?", "What is coming up for the family?", "Which goals are furthest along?"];

/** The notice members accept. Raise noticeVersion in family-ai.service.ts whenever this wording changes. */
function Notice() {
  return <ul className="grid list-disc gap-1.5 pl-5 text-sm text-foreground/80">
    <li>Your question and the Family Base records you can see are sent to Google’s Gemini service to write an answer.</li>
    <li>That includes names, titles, dates, statuses, locations, and notes on memories, places and ideas, including your private ones.</li>
    <li>Chat messages, file contents and email addresses are not sent.</li>
    <li>FamSync doesn’t store questions or answers. Google may keep them for a limited time to detect misuse.</li>
    <li>Answers can be wrong. Check the linked records.</li>
  </ul>;
}

export function FamilyAskDialog({ graph, familyId, accessToken, last, onAnswer, onSelect, onClose }: {
  graph: FamilyBaseGraph; familyId: string; accessToken: string; last?: FamilyAnswer;
  onAnswer: (answer: FamilyAnswer) => void; onSelect: (nodeId: string) => void; onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>();
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [question, setQuestion] = useState("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = useRef(accessToken);
  token.current = accessToken;
  const open = useRef(true);
  useEffect(() => { open.current = true; return () => { open.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    getBrowserApi(token.current).GET("/api/v1/families/{familyId}/base/ai", { params: { path: { familyId } }, signal: controller.signal })
      .then(({ data }) => { if (!data) throw new Error("Status unavailable"); if (!controller.signal.aborted) setStatus(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadError("We couldn’t check whether questions are available."); });
    return () => controller.abort();
  }, [familyId, revision]);

  async function change(work: () => Promise<{ data?: Status; error?: unknown }>) {
    setBusy(true); setError("");
    try {
      const result = await work();
      if (!open.current) return;
      if (result.data) setStatus(result.data);
      else setError(familyError(result.error, "We couldn’t save this. Try again."));
    } catch {
      if (open.current) setError("We couldn’t save this. Try again.");
    }
    if (open.current) setBusy(false);
  }
  const setEnabled = (enabled: boolean) => change(() => getBrowserApi(token.current).PUT("/api/v1/families/{familyId}/base/ai/settings", { params: { path: { familyId } }, body: { enabled } }));
  const setConsent = (accepted: boolean) => change(() => getBrowserApi(token.current).PUT("/api/v1/families/{familyId}/base/ai/consent", { params: { path: { familyId } }, body: { accepted, adult } }));

  async function ask(event: FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (busy || asked.length < 3) return;
    setBusy(true); setError("");
    const fallback = "We couldn’t get an answer. Try again.";
    try {
      const result = await getBrowserApi(token.current).POST("/api/v1/families/{familyId}/base/ai/questions", { params: { path: { familyId } }, body: { question: asked } });
      if (!open.current) return;
      if (result.data) {
        onAnswer({ question: asked, answer: result.data.answer, nodeIds: result.data.nodeIds });
        setStatus((current) => current && { ...current, remaining: result.data!.remaining });
        setQuestion("");
      } else {
        setError(familyError([400, 403, 404, 422, 429, 502, 503].includes(result.response.status) ? result.error : undefined, fallback));
        setRevision((value) => value + 1);
      }
    } catch {
      if (open.current) setError(fallback);
    }
    if (open.current) setBusy(false);
  }

  const sources = (last?.nodeIds ?? []).flatMap((id) => graph.nodes.find((node) => node.id === id) ?? []);
  const ready = status?.available && status.enabled && status.consented;

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Sparkles aria-hidden="true" className="size-4 text-primary" />Ask Family Base</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Answers come only from records you can already see.</Dialog.Description>
          <div className="mt-5 grid gap-4">
            {!status && !loadError && <p role="status" className="text-sm text-muted-foreground">Checking…</p>}
            <FormFeedback error={loadError} />
            {loadError && <Button variant="outline" className="w-fit" onClick={() => setRevision((value) => value + 1)}>Try again</Button>}
            {status && !status.available && <p className="text-sm">Questions aren’t set up on this server yet.</p>}
            {status?.available && !status.enabled && (status.canManage ? <>
              <p className="text-sm">Questions are off for this family. As the owner, you can turn them on. Each adult then decides for themselves before their first question.</p>
              <Notice />
              <Button className="w-fit" disabled={busy} onClick={() => void setEnabled(true)}>Turn on for this family</Button>
            </> : <p className="text-sm">Questions are off. Your family owner can turn them on here.</p>)}
            {status?.available && status.enabled && !status.consented && <>
              <p className="text-sm font-medium">Before your first question</p>
              <Notice />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={adult} disabled={busy} onChange={(event) => setAdult(event.target.checked)} />I am 18 or older and agree to this.</label>
              <Button className="w-fit" disabled={busy || !adult} onClick={() => void setConsent(true)}>Agree and continue</Button>
            </>}
            {ready && <>
              {last && <section aria-live="polite" className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium wrap-anywhere">{last.question}</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 wrap-anywhere">{last.answer}</p>
                {sources.length > 0 && <ul aria-label="Records used" className="flex flex-wrap gap-1.5">{sources.map((node) => <li key={node.id}>
                  <button type="button" onClick={() => onSelect(node.id)} title={"Show this " + universeGroups.find((group) => group.id === node.kind)!.singular.toLowerCase() + " in the graph"}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-panel px-3 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="wrap-anywhere">{node.name}</span><ArrowUpRight aria-hidden="true" className="size-3 shrink-0" /></button>
                </li>)}</ul>}
                <p className="text-xs text-muted-foreground">Written by AI. Check the records before relying on it.</p>
              </section>}
              <form className="grid gap-3" onSubmit={(event) => void ask(event)}>
                <Field id="family-question" label="Your question">
                  <textarea id="family-question" className={inputClass} rows={3} minLength={3} maxLength={500} required disabled={busy || status.remaining === 0}
                    value={question} onChange={(event) => setQuestion(event.target.value)} />
                </Field>
                {!last && <div className="flex flex-wrap gap-1.5">{examples.map((example) => <button key={example} type="button" disabled={busy} onClick={() => setQuestion(example)}
                  className="min-h-8 rounded-full border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{example}</button>)}</div>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p role="status" className="text-xs text-muted-foreground">{busy ? "Looking through your records…" : status.remaining + (status.remaining === 1 ? " question" : " questions") + " left today"}</p>
                  <Button type="submit" disabled={busy || status.remaining === 0 || question.trim().length < 3}>{busy ? "Asking…" : "Ask"}</Button>
                </div>
              </form>
            </>}
            <FormFeedback error={error} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              {ready && <Button variant="ghost" disabled={busy} onClick={() => { setAdult(false); void setConsent(false); }}>Withdraw my consent</Button>}
              {status?.enabled && status.canManage && <Button variant="ghost" disabled={busy} onClick={() => void setEnabled(false)}>Turn off for family</Button>}
              <Dialog.Close render={<Button variant="outline" />}>Close</Dialog.Close>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
