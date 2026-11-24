export type TextStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void>; keys(): Promise<string[]> };
export type Saved<T> = { data: T; savedAt: number };

const maxAge = 7 * 24 * 60 * 60_000;
const maxSize = 400_000;
const prefix = "read:";

/**
 * Recent data for reading without a connection, kept per account and family. It is removed on sign-out, when the
 * account changes and when access ends. A failure to store never affects the screen.
 */
export function readCache(store: TextStore, now: () => number = Date.now) {
  // Clearing wins over a save that was already on its way.
  let generation = 0;
  const full = (user: string, family: string, key: string) => prefix + user + ":" + family + ":" + key;
  async function removeWhere(match: (key: string) => boolean) {
    generation += 1;
    try { for (const key of await store.keys()) if (key.startsWith(prefix) && match(key)) await store.remove(key); } catch { /* Nothing readable remains to the app. */ }
  }
  return {
    /** Unsent work is kept until it is sent, discarded or cleared, so it is read with `keep`. */
    async read<T>(user: string, family: string, key: string, keep = false): Promise<Saved<T> | null> {
      const name = full(user, family, key);
      try {
        const text = await store.get(name);
        if (!text) return null;
        const saved = JSON.parse(text) as Saved<T>;
        if (typeof saved.savedAt !== "number" || !keep && (now() - saved.savedAt > maxAge || saved.savedAt > now() + 60_000)) { await store.remove(name); return null; }
        return saved;
      } catch { return null; }
    },
    /** The saved entry of this name in whichever family was kept. */
    async newest<T>(user: string, key: string): Promise<T | null> {
      try {
        const start = prefix + user + ":", name = (await store.keys()).find((item) => item.startsWith(start) && item.endsWith(":" + key) && item.split(":").length === start.split(":").length + 1);
        return name ? (await this.read<T>(user, name.slice(start.length, -key.length - 1), key))?.data ?? null : null;
      } catch { return null; }
    },
    async save(user: string, family: string, key: string, data: unknown) {
      const mine = generation;
      try {
        const text = JSON.stringify({ data, savedAt: now() });
        if (text.length > maxSize || mine !== generation) return;
        await store.set(full(user, family, key), text);
        if (mine !== generation) await store.remove(full(user, family, key));
      } catch { /* The screen already has its data. */ }
    },
    async drop(user: string, family: string, key: string) {
      try { await store.remove(full(user, family, key)); } catch { /* Not stored. */ }
    },
    /** IDs saved under any of these names, such as "chat:" for saved conversations. */
    async ids(user: string, family: string, names: string[]): Promise<string[]> {
      try {
        const keys = await store.keys(), starts = names.map((name) => full(user, family, name));
        return [...new Set(keys.flatMap((key) => { const start = starts.find((item) => key.startsWith(item)); return start ? [key.slice(start.length)] : []; }))];
      } catch { return []; }
    },
    clear: () => removeWhere(() => true),
    /** Keeps one account's data and, when named, only those of its families. */
    keepOnly: (user: string, ...families: string[]) => removeWhere((key) => !(families.length ? families.map((family) => user + ":" + family + ":") : [user + ":"]).some((start) => key.startsWith(prefix + start))),
  };
}
