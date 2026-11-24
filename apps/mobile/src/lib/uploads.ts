import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentProblem, uploadFile, type Picked } from "./attachments";

export type Uploading = { id: string; name: string; percent: number; error?: string };

/** Sends files one at a time. A retry keeps the file's ID, so a lost response cannot store it twice. */
export function useUploads<T>(target: () => { path: string; fields: Record<string, string>; token: string }, onStored: (file: T) => void) {
  const [uploads, setUploads] = useState<Uploading[]>([]), queue = useRef(new Map<string, { file: Picked; stop?: AbortController }>()), busy = useRef(false), mounted = useRef(true);
  const latest = useRef({ target, onStored });
  latest.current = { target, onStored };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; for (const { stop } of queue.current.values()) stop?.abort(); }; }, []);
  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (;;) {
        const next = [...queue.current].find(([, value]) => !value.stop);
        if (!next || !mounted.current) return;
        const [id, entry] = next, stop = new AbortController(), { path, fields, token } = latest.current.target();
        entry.stop = stop;
        const patch = (value: Partial<Uploading>) => { if (mounted.current) setUploads((old) => old.map((item) => item.id === id ? { ...item, ...value } : item)); };
        try {
          const stored = await uploadFile<T>({ path, fields: { id, ...fields }, file: entry.file, token, signal: stop.signal, onProgress: (percent) => patch({ percent }) });
          queue.current.delete(id);
          if (mounted.current) { setUploads((old) => old.filter((item) => item.id !== id)); latest.current.onStored(stored); }
        } catch (problem) { patch({ error: problem instanceof Error ? problem.message : "We couldn’t upload this file." }); }
      }
    } finally { busy.current = false; }
  }, []);
  const add = useCallback((files: Picked[]) => {
    const problems: string[] = [], accepted = files.filter((file) => { const problem = attachmentProblem(file); if (problem) problems.push(file.name + ": " + problem); return !problem; }).map((file) => ({ id: randomUUID(), file }));
    for (const { id, file } of accepted) queue.current.set(id, { file });
    setUploads((old) => [...old, ...accepted.map(({ id, file }) => ({ id, name: file.name, percent: 0 }))]);
    void run();
    return problems.join(" ");
  }, [run]);
  const retry = useCallback((id: string) => { const entry = queue.current.get(id); if (!entry) return; entry.stop = undefined; setUploads((old) => old.map((item) => item.id === id ? { ...item, error: undefined, percent: 0 } : item)); void run(); }, [run]);
  const cancel = useCallback((id: string) => { queue.current.get(id)?.stop?.abort(); queue.current.delete(id); setUploads((old) => old.filter((item) => item.id !== id)); }, []);
  return { uploads, add, retry, cancel };
}
