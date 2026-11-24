import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "./api";
import { cache } from "./cache";
import { useSession, useSignedIn } from "./session";

export type QueryError = "offline" | "lost" | "failed";

/**
 * Loads when the screen is shown. Saved data from the last visit appears first and stays while offline; it is marked
 * as saved until fresh data arrives, and removed when the server says access has ended.
 */
export function useQuery<T>(family: string, key: string, load: (signal: AbortSignal) => Promise<T>, persist = true) {
  const { sessionRefused } = useSession(), user = useSignedIn().user.id, name = user + ":" + family + ":" + key;
  const [state, setState] = useState<{ name: string; data?: T; savedAt?: number; error?: QueryError; loading: boolean }>({ name, loading: true });
  const run = useRef(0), refused = useRef(false), current = useRef<AbortController | null>(null);
  const start = useCallback(async (signal: AbortSignal) => {
    const mine = ++run.current, live = () => mine === run.current && !signal.aborted;
    setState((old) => old.name === name ? { ...old, loading: true } : { name, loading: true });
    const saved = persist ? await cache.read<T>(user, family, key) : null;
    if (!live()) return;
    if (saved) setState((old) => old.data === undefined ? { ...old, data: saved.data, savedAt: saved.savedAt } : old);
    try {
      const data = await load(signal);
      if (!live()) return;
      refused.current = false;
      setState({ name, data, loading: false });
      if (persist) void cache.save(user, family, key, data);
    } catch (problem) {
      if (!live()) return;
      const status = problem instanceof ApiError ? problem.status : 0;
      if (status === 401 && !refused.current) {
        // A refreshed session brings a new token, which loads again. A second refusal is shown as a failure.
        refused.current = true;
        await sessionRefused();
        if (!live()) return;
      }
      const lost = status === 403 || status === 404;
      if (lost) await cache.drop(user, family, key);
      if (live()) setState((old) => lost ? { name, error: "lost", loading: false } : { ...old, error: status === 0 ? "offline" : "failed", loading: false });
    }
  }, [load, name, user, family, key, sessionRefused, persist]);
  const refresh = useCallback(() => {
    current.current?.abort();
    current.current = new AbortController();
    void start(current.current.signal);
  }, [start]);
  useFocusEffect(useCallback(() => {
    refresh();
    return () => {
      current.current?.abort();
      if (!persist) setState({ name, loading: true });
    };
  }, [refresh, persist, name]));
  // A change shown before the next load, such as a saved status.
  const replace = useCallback((change: (data: T) => T) => setState((old) => old.data === undefined ? old : { ...old, data: change(old.data) }), []);
  const shown = state.name === name ? state : { name, loading: true, data: undefined, savedAt: undefined, error: undefined };
  return { data: shown.data, savedAt: shown.savedAt, error: shown.error, loading: shown.loading, refresh, replace };
}
