"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { keepTurns, minutesLeft, speechGate, voiceLimits, voiceNotice, voiceStep, type VoiceStatus, type VoiceTurn } from "@famsync/core/voice";
import { ArrowUpRight, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import type { FamilyBaseGraph } from "@/lib/family-base";
import { FormFeedback } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Reply = components["schemas"]["FamilyVoiceReplyDto"];
type Stage = "idle" | "starting" | "listening" | "thinking" | "speaking" | "paused";
const stageText: Record<Stage, string> = { idle: "Hello! What would you like to know?", starting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", paused: "Paused" };
const recordingType = () => typeof MediaRecorder === "undefined" ? undefined : ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));

function Notice() {
  return <ul className="grid list-disc gap-1.5 pl-5 text-sm text-foreground/80">{voiceNotice.map((line) => <li key={line}>{line}</li>)}</ul>;
}

export function FamilyCallDialog({ graph, familyId, accessToken, onSelect, onClose }: { graph: FamilyBaseGraph; familyId: string; accessToken: string; onSelect: (nodeId: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<VoiceStatus>(), [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0), [adult, setAdult] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const token = useRef(accessToken);
  token.current = accessToken;
  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    getBrowserApi(token.current).GET("/api/v1/families/{familyId}/base/voice", { params: { path: { familyId } }, signal: controller.signal })
      .then(({ data }) => { if (!data) throw new Error("Status unavailable"); if (!controller.signal.aborted) setStatus(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadError("We couldn’t check whether voice is available."); });
    return () => controller.abort();
  }, [familyId, revision]);
  async function change(work: () => Promise<{ data?: VoiceStatus; error?: unknown }>) {
    setBusy(true); setError("");
    try { const result = await work(); if (result.data) { setStatus(result.data); setAdult(false); } else setError(familyError(result.error, "We couldn’t save this. Try again.")); }
    catch { setError("We couldn’t save this. Try again."); } finally { setBusy(false); }
  }
  const setEnabled = (enabled: boolean) => change(() => getBrowserApi(token.current).PUT("/api/v1/families/{familyId}/base/voice/settings", { params: { path: { familyId } }, body: { enabled } }));
  const setConsent = (accepted: boolean) => change(() => getBrowserApi(token.current).PUT("/api/v1/families/{familyId}/base/voice/consent", { params: { path: { familyId } }, body: { accepted, adult } }));
  const step = status && voiceStep(status);
  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold"><Phone aria-hidden="true" className="size-4 text-primary" />Talk to Family Base</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Answers come only from records you can already see.</Dialog.Description>
          <div className="mt-5 grid gap-4">
            {!status && !loadError && <p role="status" className="text-sm text-muted-foreground">Checking…</p>}
            <FormFeedback error={loadError} />
            {loadError && <Button variant="outline" className="w-fit" onClick={() => setRevision((value) => value + 1)}>Try again</Button>}
            {step === "unavailable" && <p className="text-sm">Voice isn’t set up on this server yet.</p>}
            {step === "off" && (status!.canManage ? <><p className="text-sm">Voice is off for this family. As the owner, you can turn it on. Each adult then decides for themselves before their first call.</p><Notice /><Button className="w-fit" disabled={busy} onClick={() => void setEnabled(true)}>Turn on for this family</Button></> : <p className="text-sm">Voice is off. Your family owner can turn it on here.</p>)}
            {step === "consent" && <><p className="text-sm font-medium">Before your first call</p><Notice />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={adult} disabled={busy} onChange={(event) => setAdult(event.target.checked)} />I am 18 or older and agree to this.</label>
              <Button className="w-fit" disabled={busy || !adult} onClick={() => void setConsent(true)}>Agree and continue</Button></>}
            {step === "used" && <p className="text-sm">You have used today’s voice time. It starts again tomorrow.</p>}
            {step === "ready" && <Talk graph={graph} familyId={familyId} token={token} remaining={status!.remainingSeconds} onSelect={onSelect} onUsed={(remainingSeconds) => setStatus((old) => old && { ...old, remainingSeconds })} onRefused={() => setRevision((value) => value + 1)} />}
            <FormFeedback error={error} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              {(step === "ready" || step === "used") && <Button variant="ghost" disabled={busy} onClick={() => void setConsent(false)}>Withdraw my consent</Button>}
              {status?.enabled && status.canManage && <Button variant="ghost" disabled={busy} onClick={() => void setEnabled(false)}>Turn off for family</Button>}
              <Dialog.Close render={<Button variant="outline" />}>Close</Dialog.Close>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// What is said stays in memory and is gone when the call ends. No recording is kept after it is sent.
function Talk({ graph, familyId, token, remaining, onSelect, onUsed, onRefused }: { graph: FamilyBaseGraph; familyId: string; token: { current: string }; remaining: number; onSelect: (nodeId: string) => void; onUsed: (seconds: number) => void; onRefused: () => void }) {
  const [stage, setStage] = useState<Stage>("idle"), [last, setLast] = useState<Reply>(), [error, setError] = useState(""), [elapsed, setElapsed] = useState(0);
  const phase = useRef<Stage>("idle"), generation = useRef(0), turns = useRef<VoiceTurn[]>([]), stream = useRef<MediaStream | null>(null), context = useRef<AudioContext | null>(null), recorder = useRef<MediaRecorder | null>(null);
  const meter = useRef<ReturnType<typeof setInterval>>(undefined), player = useRef<HTMLAudioElement | null>(null), request = useRef<AbortController | null>(null), began = useRef(0);
  const change = (next: Stage) => { phase.current = next; setStage(next); };
  const quiet = useCallback(() => {
    clearInterval(meter.current);
    request.current?.abort();
    if (recorder.current?.state === "recording") { recorder.current.onstop = null; recorder.current.stop(); }
    recorder.current = null;
    if (player.current) { player.current.onended = null; player.current.pause(); player.current.src = ""; player.current = null; }
  }, []);
  const hangUp = useCallback(() => {
    generation.current += 1;
    quiet();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    turns.current = [];
    change("idle");
  }, [quiet]);
  useEffect(() => hangUp, [hangUp]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden" && phase.current !== "idle") hangUp(); };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [hangUp]);
  useEffect(() => {
    if (stage === "idle") return;
    const timer = setInterval(() => { const seconds = Math.round((Date.now() - began.current) / 1000); setElapsed(seconds); if (seconds >= voiceLimits.callSeconds && phase.current !== "speaking") { hangUp(); setError("This call reached five minutes. Call again to go on."); } }, 1000);
    return () => clearInterval(timer);
  }, [stage, hangUp]);

  function listen() {
    const mine = generation.current, type = recordingType();
    quiet();
    if (!stream.current || !context.current || !type) return hangUp();
    const media = new MediaRecorder(stream.current, { mimeType: type, audioBitsPerSecond: 32000 }), parts: Blob[] = [], source = context.current.createMediaStreamSource(stream.current), analyser = context.current.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize), gate = speechGate();
    media.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
    media.onstop = () => { source.disconnect(); if (mine === generation.current) void send(new Blob(parts, { type: type.split(";")[0] })); };
    recorder.current = media;
    media.start(500);
    change("listening");
    meter.current = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const power = samples.reduce((sum, value) => sum + value * value, 0) / samples.length, heard = gate.hear(10 * Math.log10(power || 1e-10), Date.now());
      if (heard === "done") finish();
      else if (heard === "silent") { quiet(); change("paused"); }
    }, 100);
  }
  function finish() {
    clearInterval(meter.current);
    if (recorder.current?.state === "recording") { change("thinking"); recorder.current.stop(); recorder.current = null; }
  }
  async function send(audio: Blob) {
    const mine = generation.current, controller = new AbortController(), alive = () => mine === generation.current;
    request.current = controller;
    try {
      const form = new FormData();
      form.set("turns", JSON.stringify(turns.current));
      form.set("file", audio, audio.type === "audio/mp4" ? "voice.m4a" : "voice.webm");
      const result = await getBrowserApi(token.current).POST("/api/v1/families/{familyId}/base/voice/turns", { params: { path: { familyId } }, body: { file: "" }, bodySerializer: () => form, signal: controller.signal });
      if (!alive()) return;
      if (!result.data) { setError(familyError([400, 403, 404, 413, 422, 429, 502, 503].includes(result.response.status) ? result.error : undefined, "We couldn’t get an answer. Try again.")); change("paused"); return onRefused(); }
      const reply = result.data;
      turns.current = keepTurns(turns.current, { you: reply.heard, reply: reply.answer });
      setLast(reply); setError(""); onUsed(reply.remainingSeconds);
      if (reply.remainingSeconds <= 0) return hangUp();
      if (!reply.audio) return change("paused");
      const sound = new Audio("data:audio/mpeg;base64," + reply.audio);
      player.current = sound;
      sound.onended = () => { if (alive() && phase.current === "speaking") listen(); };
      change("speaking");
      await sound.play();
    } catch {
      if (!alive() || controller.signal.aborted) return;
      setError(phase.current === "speaking" ? "The answer couldn’t be played. It is shown below." : "We couldn’t get an answer. Check your connection and try again.");
      change("paused");
    }
  }
  async function call() {
    if (phase.current !== "idle") return;
    const mine = ++generation.current;
    setError(""); setLast(undefined); setElapsed(0); change("starting");
    try {
      if (!recordingType() || !navigator.mediaDevices?.getUserMedia) { change("idle"); return setError("This browser can’t record. Try a current version of Chrome, Edge, Firefox or Safari."); }
      const input = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (mine !== generation.current) return input.getTracks().forEach((track) => track.stop());
      stream.current = input;
      context.current = new AudioContext();
      await context.current.resume();
      began.current = Date.now();
      listen();
    } catch (problem) {
      if (mine !== generation.current) return;
      hangUp();
      setError(problem instanceof DOMException && problem.name === "NotAllowedError" ? "FamSync can’t use your microphone. Allow it in your browser’s site settings, then call again." : "We couldn’t use the microphone. Try again.");
    }
  }
  const live = stage !== "idle", sources = (last?.nodeIds ?? []).flatMap((id) => graph.nodes.find((node) => node.id === id) ?? []);
  return <div className="grid gap-4">
    <div className="grid justify-items-center gap-2 rounded-2xl bg-muted/50 p-6 text-center">
      <span aria-hidden="true" className={"grid size-20 place-items-center rounded-full bg-primary/15 text-primary " + (stage === "listening" || stage === "speaking" ? "motion-safe:animate-pulse" : "")}><Phone className="size-8" /></span>
      <p role="status" className="text-base font-semibold">{stageText[stage]}</p>
      <p className="text-xs text-muted-foreground">{(live ? Math.floor(elapsed / 60) + ":" + String(elapsed % 60).padStart(2, "0") + " · " : "") + minutesLeft(remaining)}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {!live && <Button onClick={() => void call()}><Phone aria-hidden="true" />Call</Button>}
      {stage === "listening" && <Button onClick={finish}>Done talking</Button>}
      {stage === "speaking" && <Button variant="outline" onClick={listen}>Interrupt and talk</Button>}
      {stage === "paused" && <Button onClick={() => { setError(""); listen(); }}>Talk</Button>}
      {live && <Button variant="outline" onClick={hangUp}><PhoneOff aria-hidden="true" />End call</Button>}
    </div>
    <FormFeedback error={error} />
    {last && <section aria-live="polite" className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground wrap-anywhere">You: {last.heard}</p><p className="text-sm leading-relaxed wrap-anywhere">{last.answer}</p>
      {sources.length > 0 && <ul aria-label="Records used" className="flex flex-wrap gap-1.5">{sources.map((node) => <li key={node.id}><button type="button" onClick={() => { hangUp(); onSelect(node.id); }} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-panel px-3 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="wrap-anywhere">{node.name}</span><ArrowUpRight aria-hidden="true" className="size-3 shrink-0" /></button></li>)}</ul>}
      <p className="text-xs text-muted-foreground">Spoken by AI. Check the records before relying on it.</p>
    </section>}
  </div>;
}
