import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session";

type Result<T> = { data?: T; error?: unknown; response: Response };
export type Outcome<T> = { ok: true; data: T } | { ok: false; conflict: boolean; gone: boolean };

const serverMessage = (error: unknown) => {
  const message = (error as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : null;
};

/** Saves one change at a time. Nothing is queued: changes need a connection, and the form keeps its text on failure. */
export function useSave() {
  const { sessionRefused } = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const working = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = useCallback(async <T,>(call: () => Promise<Result<T>>, fallback: string): Promise<Outcome<T>> => {
    const failed = { ok: false, conflict: false, gone: false } as const;
    if (working.current) return failed;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: problem, response } = await call();
      if (data !== undefined) return { ok: true, data };
      const status = response.status;
      if (status === 401) await sessionRefused();
      if (mounted.current) setError([400, 403, 404, 409, 413, 503].includes(status) ? serverMessage(problem) ?? fallback : fallback);
      return { ok: false, conflict: status === 409, gone: status === 403 || status === 404 };
    } catch {
      if (mounted.current) setError("You’re offline, or FamSync can’t be reached. Nothing was lost; try again when you’re connected.");
      return failed;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [sessionRefused]);
  return { busy, error, setError, save };
}
