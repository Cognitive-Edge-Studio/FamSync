import "./web-crypto";
import { GoTrueClient, isAuthRetryableFetchError, type AuthError, type Session } from "@supabase/auth-js";
import { checkedUrl } from "./config";
import { readSaved } from "./saved-session";
import { chunkedStorage } from "./secure-chunks";
import { keyStore } from "./secure-store";

const storageKey = "famsync-session";
const storage = chunkedStorage(keyStore);
let client: GoTrueClient | undefined;

export function getAuth() {
  if (client) return client;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = new GoTrueClient({
    url: checkedUrl("EXPO_PUBLIC_SUPABASE_AUTH_URL", process.env.EXPO_PUBLIC_SUPABASE_AUTH_URL, __DEV__),
    headers: key ? { apikey: key } : {},
    storageKey, storage, flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  });
  return client;
}

/** Signing out works offline too: whatever the server says, nothing stays on this device. */
export async function signOutHere() {
  const { error } = await getAuth().signOut({ scope: "local" });
  if (!error) return;
  await getAuth().stopAutoRefresh();
  client = undefined;
  await storage.removeItem(storageKey);
}

/** The session saved on this device, even if its token has expired. The server refuses an expired token. */
export const savedSession = async (): Promise<Session | null> => readSaved(await storage.getItem(storageKey).catch(() => null));

/** The secret that proves a sign-in link was asked for on this phone. A failed attempt removes it, so it can be put back. */
export const linkSecret = {
  read: () => storage.getItem(storageKey + "-code-verifier").catch(() => null),
  restore: (value: string | null) => value ? storage.setItem(storageKey + "-code-verifier", value).catch(() => {}) : undefined,
};

export const isOffline = (error: unknown) => isAuthRetryableFetchError(error);

export function authMessage(error: AuthError) {
  if (isOffline(error)) return "We couldn’t reach FamSync. Check your connection and try again.";
  switch (error.code) {
    case "email_not_confirmed": return "Confirm your email before signing in. Use the link we sent you.";
    case "invalid_credentials": return "Check your email and password and try again.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Wait a moment and try again.";
    case "weak_password": return "Choose a stronger password.";
    case "same_password": return "Choose a different password.";
    case "email_exists": return "That email address is already in use.";
    default: return "We couldn’t complete that request. Please try again.";
  }
}
