import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { getAuth, linkSecret } from "./auth";
import { checkedUrl } from "./config";

export type Flow = "signup" | "recovery" | "email-change" | "google";
/** Where emails and Google return to. The sign-in server must allow this address. */
export const callbackUrl = (flow: Flow) => (Platform.OS === "web" ? window.location.origin + "/auth/callback" : "famsync://auth/callback") + "?flow=" + flow;

let recovering: string | null = null;
export const isRecovering = (userId: string) => recovering === userId;
export const endRecovery = () => { recovering = null; };

const running = new Map<string, Promise<"recovery" | "done">>();
/** A link can reach the app twice, but its code works once. It also works only on the phone that asked for it. */
export function completeSignIn(code: string, flow: string | undefined) {
  const started = running.get(code);
  if (started) return started;
  const work = (async () => {
    const auth = getAuth();
    let recovery = false;
    const secret = await linkSecret.read();
    const { data: { subscription } } = auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") recovery = true; });
    try {
      const { data, error } = await auth.exchangeCodeForSession(code);
      // A wrong or old link must not spoil the one still on its way.
      if (error || !data.session) { await linkSecret.restore(secret); throw new Error("This link couldn’t be confirmed."); }
      if (recovery) { recovering = data.session.user.id; return "recovery" as const; }
      if (flow === "recovery") throw new Error("This link couldn’t be confirmed.");
      return "done" as const;
    } finally { subscription.unsubscribe(); }
  })();
  running.set(code, work);
  // A link that failed, for example without a connection, can be opened again.
  work.catch(() => running.delete(code));
  return work;
}

export async function googleEnabled(signal: AbortSignal) {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, url = checkedUrl("EXPO_PUBLIC_SUPABASE_AUTH_URL", process.env.EXPO_PUBLIC_SUPABASE_AUTH_URL, __DEV__);
  const response = await fetch(url + "/settings", { headers: key ? { apikey: key } : {}, signal });
  if (!response.ok) return false;
  return ((await response.json()) as { external?: { google?: boolean } } | null)?.external?.google === true;
}

/** Opens Google in the phone's browser. False when the person closed it. */
export async function signInWithGoogle() {
  const redirectTo = callbackUrl("google");
  const { data, error } = await getAuth().signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error("Google sign-in couldn’t start.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return false;
  const code = /[?&]code=([^&#]+)/.exec(result.url)?.[1];
  if (!code) throw new Error("Google sign-in couldn’t be completed.");
  await completeSignIn(decodeURIComponent(code), "google");
  return true;
}
