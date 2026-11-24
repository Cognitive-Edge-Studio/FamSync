import Storage from "expo-sqlite/kv-store";
import type { TextStore } from "./read-cache";

// Private to the app, and left out of device backups (allowBackup is off).
export const textStore: TextStore = {
  get: (key) => Storage.getItem(key),
  set: (key, value) => Storage.setItem(key, value),
  remove: (key) => Storage.removeItem(key),
  keys: async () => [...await Storage.getAllKeys()],
};
