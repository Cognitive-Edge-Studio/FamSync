import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { KeyStore } from "./secure-chunks";

// The web build exists only to check screens during development; it keeps nothing after a reload.
const memory = new Map<string, string>();
export const keyStore: KeyStore = Platform.OS === "web"
  ? { get: async (key) => memory.get(key) ?? null, set: async (key, value) => { memory.set(key, value); }, remove: async (key) => { memory.delete(key); } }
  : {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
      remove: (key) => SecureStore.deleteItemAsync(key),
    };
