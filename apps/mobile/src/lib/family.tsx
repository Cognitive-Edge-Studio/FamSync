import type { components } from "@famsync/api-client";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, getApi, required } from "./api";
import { cache } from "./cache";
import { defaultFamily } from "./family-choice";
import { accountStore, guestStore } from "./scope";
import { useSession, useSignedIn } from "./session";

export type Family = components["schemas"]["FamilyDto"];
type State = { status: "loading" } | { status: "none" } | { status: "error"; offline: boolean } | { status: "ready"; family: Family };
const Context = createContext<{ state: State; reload: () => void; replace: (family: Family) => void } | null>(null);

/** Opens the person's one family. Mounted per account, so nothing carries over when the account changes. */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { access_token, user: { id: userId } } = useSignedIn(), { sessionRefused } = useSession();
  const [state, setState] = useState<State>({ status: "loading" }), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const families = required(await getApi(access_token).GET("/api/v1/families", { signal: controller.signal }));
        if (controller.signal.aborted) return;
        const family = defaultFamily(families);
        // Saved data of any other family, or of a family just lost, is removed.
        if (family) { await cache.keepOnly(userId, family.id, guestStore, accountStore); await cache.save(userId, family.id, "family", family); } else await cache.keepOnly(userId, guestStore, accountStore);
        if (controller.signal.aborted) return;
        setState(family ? { status: "ready", family } : { status: "none" });
      } catch (problem) {
        if (controller.signal.aborted) return;
        const status = problem instanceof ApiError ? problem.status : 0;
        if (status === 401) await sessionRefused();
        const saved = status === 0 ? await cache.newest<Family>(userId, "family") : null;
        if (controller.signal.aborted) return;
        // A shown family stays during a passing failure; its own screens report problems.
        setState((old) => old.status === "ready" && status !== 401 ? old : saved ? { status: "ready", family: saved } : { status: "error", offline: status === 0 });
      }
    }
    void load();
    return () => controller.abort();
  }, [access_token, userId, attempt, sessionRefused]);
  const reload = useCallback(() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }, []);
  // A saved change to the family, such as its name or the person's role.
  const replace = useCallback((family: Family) => { setState((old) => old.status === "ready" && old.family.id === family.id ? { status: "ready", family } : old); void cache.save(userId, family.id, "family", family); }, [userId]);
  const value = useMemo(() => ({ state, reload, replace }), [state, reload, replace]);
  return <Context value={value}>{children}</Context>;
}
export function useFamilyState() {
  const value = use(Context);
  if (!value) throw new Error("FamilyProvider is missing.");
  return value;
}
