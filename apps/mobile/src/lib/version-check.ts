import { readSavedVersionPolicy, readVersionPolicy, versionState, type SavedVersionPolicy, type VersionState } from './version-policy.ts';

type Dependencies = {
  build: number; server: string;
  read: () => Promise<string | null>; write: (raw: string) => Promise<void>; remove: () => Promise<void>;
  fetch: (signal: AbortSignal) => Promise<unknown>;
  changed: (state: VersionState) => void;
  now?: () => number;
};

/** Owns startup, refresh and offline decisions. Superseded requests cannot undo a newer decision. */
export function versionCheck(deps: Dependencies) {
  let saved: SavedVersionPolicy | undefined, loaded = false, generation = 0, request: AbortController | undefined, writing = Promise.resolve();
  const now = deps.now ?? Date.now;
  return {
    async refresh() {
      const mine = ++generation;
      request?.abort();
      const current = new AbortController(); request = current;
      const live = () => mine === generation && !current.signal.aborted;
      if (!loaded) {
        const raw = await deps.read().catch(() => null);
        if (!live()) return;
        saved = readSavedVersionPolicy(raw, deps.server, now()); loaded = true;
      }
      deps.changed(versionState(deps.build, saved, now(), true));
      try {
        const policy = readVersionPolicy(await deps.fetch(current.signal));
        if (!live()) return;
        saved = { server: deps.server, checkedAt: now(), policy };
        deps.changed({ ...versionState(deps.build, saved, now(), false), cached: false });
        // Storage failure does not invalidate the live server response. Next startup will need a connection.
        const raw = JSON.stringify(saved);
        writing = writing.then(() => deps.write(raw)).catch(() => deps.remove().catch(() => {}));
        await writing;
      } catch {
        if (live()) deps.changed(versionState(deps.build, saved, now(), false));
      }
    },
    stop() { generation += 1; request?.abort(); },
  };
}
