import type { TextStore } from "./read-cache";

// The web build only checks screens during development and keeps nothing after a reload.
const memory = new Map<string, string>();
export const textStore: TextStore = {
  get: async (key) => memory.get(key) ?? null,
  set: async (key, value) => { memory.set(key, value); },
  remove: async (key) => { memory.delete(key); },
  keys: async () => [...memory.keys()],
};
