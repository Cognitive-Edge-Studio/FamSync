"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { Button } from "./ui/button";
import { clockTime } from "./voice-recorder";

type Props = { familyId: string; accessToken: string; fileId: string; fileName: string };

// Links last a minute and are requested when playing. If one expires while playing, a new one continues from the same place.
function useMediaLink({ familyId, accessToken, fileId }: Pick<Props, "familyId" | "accessToken" | "fileId">) {
  const token = useRef(accessToken);
  token.current = accessToken;
  return useCallback(async () => {
    const { data } = await getBrowserApi(token.current).POST("/api/v1/families/{familyId}/files/{fileId}/preview", { params: { path: { familyId, fileId } } });
    if (!data?.url) throw new Error("Unavailable");
    return data.url;
  }, [familyId, fileId]);
}

let playing: HTMLMediaElement | null = null;
/** Starting one recording or video pauses any other. */
function takeOver(element: HTMLMediaElement) {
  if (playing && playing !== element) playing.pause();
  playing = element;
}

export function VoicePlayer({ seconds, ...file }: Props & { seconds: number }) {
  const audio = useRef<HTMLAudioElement>(null), retried = useRef(false), wanted = useRef(0);
  const [active, setActive] = useState(false), [loading, setLoading] = useState(false), [position, setPosition] = useState(0), [error, setError] = useState("");
  const link = useMediaLink(file);
  useEffect(() => { const element = audio.current; return () => { element?.pause(); if (playing === element) playing = null; }; }, []);

  async function load() {
    const element = audio.current;
    if (!element) return;
    setLoading(true);
    setError("");
    try {
      element.src = await link();
      element.currentTime = wanted.current;
      takeOver(element);
      await element.play();
    } catch (problem) {
      // Pausing while it loads is not a failure.
      if (!(problem instanceof DOMException && problem.name === "AbortError")) setError("This recording is unavailable.");
    } finally { setLoading(false); }
  }
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    if (active) return element.pause();
    retried.current = false;
    if (!element.src || element.error) return load();
    takeOver(element);
    await element.play().catch(() => load());
  }
  return (
    <div className="flex w-64 max-w-full items-center gap-2 rounded-xl border border-border bg-panel p-2 text-foreground">
      <Button size="icon" variant="secondary" className="shrink-0 rounded-full" disabled={loading} aria-label={active ? "Pause voice message" : "Play voice message, " + clockTime(seconds)} onClick={() => void toggle()}>
        {active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <div className="min-w-0 grow">
        <input type="range" aria-label="Position in voice message" aria-valuetext={clockTime(position) + " of " + clockTime(seconds)} className="w-full accent-primary" min={0} max={seconds} step={0.1} value={Math.min(position, seconds)}
          onChange={(event) => { const next = Number(event.target.value); wanted.current = next; setPosition(next); if (audio.current?.src) audio.current.currentTime = next; }} />
        <p className="flex justify-between text-xs text-muted-foreground tabular-nums">{error ? <span role="alert" className="text-destructive">{error}</span> : <span>{active || position ? clockTime(position) : "Voice message"}</span>}<span>{clockTime(seconds)}</span></p>
      </div>
      <audio ref={audio} preload="none" onPlay={() => setActive(true)} onPause={() => setActive(false)}
        onTimeUpdate={(event) => { wanted.current = event.currentTarget.currentTime; setPosition(event.currentTarget.currentTime); }}
        onEnded={() => { wanted.current = 0; setPosition(0); setActive(false); }}
        onError={() => { setActive(false); if (!audio.current?.getAttribute("src")) return; if (retried.current) setError("This recording is unavailable."); else { retried.current = true; void load(); } }} />
    </div>
  );
}

export function VideoPlayer(file: Props) {
  const [url, setUrl] = useState<string>(), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null), position = useRef(0), retried = useRef(false);
  const link = useMediaLink(file);
  async function load() {
    setLoading(true);
    setError("");
    try { setUrl(await link()); } catch { setUrl(undefined); setError("This video is unavailable."); } finally { setLoading(false); }
  }
  useEffect(() => { const element = video.current; return () => { if (playing === element) playing = null; }; }, [url]);
  return (
    <div className="grid min-h-40 w-64 max-w-full place-items-center overflow-hidden rounded-lg bg-muted">
      {url ? <video ref={video} src={url} controls autoPlay playsInline aria-label={file.fileName} className="max-h-80 w-full"
        onLoadedMetadata={(event) => { if (position.current) event.currentTarget.currentTime = position.current; }}
        onPlay={(event) => takeOver(event.currentTarget)} onPlaying={() => { retried.current = false; }}
        onTimeUpdate={(event) => { if (event.currentTarget.currentTime) position.current = event.currentTarget.currentTime; }}
        onError={() => { if (retried.current) { setUrl(undefined); setError("This video can’t be played here. You can download it."); } else { retried.current = true; void load(); } }} />
        : <div className="grid justify-items-center gap-2 p-3 text-center">
            <Button variant="secondary" disabled={loading} onClick={() => void load()}><Play aria-hidden="true" />{loading ? "Loading…" : "Play video"}</Button>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>}
    </div>
  );
}
