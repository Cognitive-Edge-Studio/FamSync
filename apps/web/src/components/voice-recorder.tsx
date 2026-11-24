"use client";

import { Mic, RotateCcw, Send, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormFeedback } from "./account-fields";
import { Button } from "./ui/button";

export const maxVoiceSeconds = 600;
export const clockTime = (seconds: number) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
export const canRecord = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

// AAC in MP4 plays in every current browser and on Android, so it is preferred when the browser can record it.
function recordingType() {
  return ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}
function microphoneProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "FamSync can’t use your microphone. Allow it in your browser’s site settings, then try again.";
  if (name === "NotFoundError") return "No microphone was found.";
  if (name === "NotReadableError") return "Your microphone is being used by another app.";
  return "We couldn’t start recording. Try again.";
}

export type Recording = { id: string; file: File; seconds: number };

/** Records, lets the person listen, and sends. Nothing is uploaded before Send. */
export function VoiceRecorder({ onSend, onClose }: {
  onSend: (recording: Recording, signal: AbortSignal, progress: (percent: number) => void) => Promise<void>; onClose: () => void;
}) {
  const [stage, setStage] = useState<"starting" | "recording" | "review" | "sending" | "failed">("starting");
  const [seconds, setSeconds] = useState(0), [percent, setPercent] = useState(0), [error, setError] = useState(""), [url, setUrl] = useState<string>();
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), recording = useRef<Recording | null>(null);
  const sending = useRef<AbortController | null>(null), attempt = useRef(0);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  const start = useCallback(async () => {
    const mine = ++attempt.current;
    setStage("starting");
    setError("");
    setSeconds(0);
    setUrl(undefined);
    recording.current = null;
    try {
      const type = recordingType();
      if (!type) throw new Error();
      const input = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (mine !== attempt.current) return input.getTracks().forEach((track) => track.stop());
      stream.current = input;
      const media = new MediaRecorder(input, { mimeType: type, audioBitsPerSecond: 32000 }), parts: Blob[] = [];
      const began = performance.now();
      let ended = 0;
      media.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      media.onstop = () => {
        if (mine !== attempt.current) return;
        ended = performance.now();
        release();
        const length = Math.max(1, Math.min(maxVoiceSeconds, Math.round((ended - began) / 1000)));
        const mp4 = type.startsWith("audio/mp4"), blob = new Blob(parts, { type: mp4 ? "audio/mp4" : "audio/webm" });
        if (!blob.size || ended - began < 500) {
          setError("That recording was too short.");
          setStage("failed");
          return;
        }
        recording.current = { id: crypto.randomUUID(), file: new File([blob], "Voice message." + (mp4 ? "m4a" : "weba"), { type: blob.type }), seconds: length };
        setSeconds(length);
        setUrl(URL.createObjectURL(blob));
        setStage("review");
      };
      // Unplugging the microphone or a call taking it over keeps what was recorded so far.
      input.getAudioTracks()[0]?.addEventListener("ended", () => { if (media.state === "recording") media.stop(); });
      recorder.current = media;
      media.start(1000);
      setStage("recording");
    } catch (problem) {
      if (mine !== attempt.current) return;
      release();
      setError(microphoneProblem(problem));
      setStage("failed");
    }
  }, [release]);

  useEffect(() => {
    void start();
    return () => {
      attempt.current += 1;
      if (recorder.current?.state === "recording") recorder.current.stop();
      sending.current?.abort();
      release();
    };
  }, [start, release]);
  useEffect(() => {
    if (stage !== "recording") return;
    const began = performance.now();
    const timer = window.setInterval(() => {
      const now = (performance.now() - began) / 1000;
      setSeconds(now);
      if (now >= maxVoiceSeconds) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [stage, stop]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  // Leaving would lose an unsent recording.
  useEffect(() => {
    if (stage === "failed" && !recording.current) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  async function send() {
    const item = recording.current;
    if (!item || stage === "sending") return;
    setStage("sending");
    setError("");
    setPercent(0);
    sending.current = new AbortController();
    try {
      await onSend(item, sending.current.signal, setPercent);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "We couldn’t send this recording. Try again.");
      setStage("review");
    }
  }

  return (
    <div role="group" aria-label="Voice message" className="grid gap-2">
      <div className="flex min-h-13 flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-1.5">
        <Button variant="ghost" size="icon" aria-label="Discard recording" title="Discard recording" onClick={onClose}><Trash2 aria-hidden="true" /></Button>
        {stage === "starting" && <p className="grow text-sm text-muted-foreground">Starting the microphone…</p>}
        {stage === "recording" && <p className="flex grow items-center gap-2 text-sm"><span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" />Recording <span className="tabular-nums">{clockTime(seconds)}</span></p>}
        {stage === "review" && url && <audio controls src={url} aria-label="Listen to your recording" className="h-10 min-w-0 grow" />}
        {stage === "sending" && <p className="flex grow items-center gap-2 text-sm text-muted-foreground">Sending…<progress aria-label="Sending voice message" max={100} value={percent} className="w-24" /></p>}
        {stage === "failed" && <span className="grow" />}
        {stage === "recording" && <Button variant="outline" size="icon" aria-label="Stop recording" title="Stop recording" onClick={stop}><Square aria-hidden="true" /></Button>}
        {(stage === "review" || stage === "failed") && <Button variant="ghost" size="icon" aria-label="Record again" title="Record again" onClick={() => void start()}><RotateCcw aria-hidden="true" /></Button>}
        {stage === "review" && <Button size="icon" aria-label="Send voice message" title="Send voice message" onClick={() => void send()}><Send aria-hidden="true" /></Button>}
      </div>
      <FormFeedback error={error} />
      <p role="status" className="sr-only">{stage === "recording" ? "Recording started" : stage === "review" ? "Recording stopped, " + seconds + " seconds" : ""}</p>
    </div>
  );
}

export function VoiceButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" size="icon" className="shrink-0" aria-label="Record a voice message" title="Record a voice message" onClick={onClick}><Mic aria-hidden="true" /></Button>;
}
