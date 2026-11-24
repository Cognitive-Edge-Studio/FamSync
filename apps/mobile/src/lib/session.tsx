import type { Session } from "@supabase/auth-js";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { addNetworkStateListener } from 'expo-network';
import { getAuth, isOffline, savedSession, signOutHere } from "./auth";
import { cache } from "./cache";
import { closeOutboxes } from "./outboxes";
import { clearShared } from "./share-file";
import { retryPhonePushRemoval, stopPhonePush } from "./push-device";
import { stopMedia } from './media-focus';
import { clearVoiceFiles } from './voice-files';

type State = { status: "loading" } | { status: "signedOut" } | { status: "offline" } | { status: "misconfigured" } | { status: "signedIn"; session: Session };
type Value = { state: State; retry: () => void; signOut: () => Promise<void>; sessionRefused: () => Promise<void> };
const Context = createContext<Value | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" }), [attempt, setAttempt] = useState(0);
  const latest = useRef(state); latest.current = state;
  useEffect(() => {
    let stopped = false;
    let unsubscribe = () => {};
    async function start() {
      clearVoiceFiles();
      void retryPhonePushRemoval().catch(() => {});
      try {
        const auth = getAuth();
        const { data: { session }, error } = await auth.getSession();
        if (stopped) return;
        // A saved session that cannot be refreshed offline is kept; only a refused one returns to sign-in.
        if (error && isOffline(error)) {
          // Saved data can be read. Requests fail until the connection returns, and then the token is renewed or refused.
          const saved = await savedSession();
          if (saved) await cache.keepOnly(saved.user.id);
          if (!stopped) setState(saved ? { status: "signedIn", session: saved } : { status: "offline" });
        }
        else { if (session) await cache.keepOnly(session.user.id); else await cache.clear(); if (!stopped) setState(session ? { status: "signedIn", session } : { status: "signedOut" }); }
        const { data } = auth.onAuthStateChange((event, next) => {
          if (stopped || event === "INITIAL_SESSION") return;
          if (next) {
            const previous = latest.current;
            if (previous.status === 'signedIn' && previous.session.user.id !== next.user.id) { void stopPhonePush(previous.session.access_token, previous.session.user.id).catch(() => {}); void stopMedia(); clearVoiceFiles(); }
            // Another account must never see the last one's saved data.
            if (event === "SIGNED_IN") { closeOutboxes(next.user.id); void cache.keepOnly(next.user.id); }
            setState({ status: "signedIn", session: next });
          } else if (event === "SIGNED_OUT") {
            void stopMedia(); clearVoiceFiles();
            const previous = latest.current;
            if (previous.status === 'signedIn') void stopPhonePush(previous.session.access_token, previous.session.user.id).catch(() => {});
            closeOutboxes();
            clearShared();
            void cache.clear();
            setState({ status: "signedOut" });
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch {
        if (!stopped) setState({ status: "misconfigured" });
      }
    }
    void start();
    // Tokens refresh only while the app is in use.
    const app = AppState.addEventListener("change", (next) => {
      if (next === 'active') void retryPhonePushRemoval().catch(() => {});
      try { void (next === "active" ? getAuth().startAutoRefresh() : getAuth().stopAutoRefresh()); } catch { /* Shown as misconfigured. */ }
    });
    const network = addNetworkStateListener((next) => { if (next.isConnected) void retryPhonePushRemoval().catch(() => {}); });
    return () => { stopped = true; unsubscribe(); app.remove(); network.remove(); };
  }, [attempt]);

  const retry = useCallback(() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }, []);
  const signOut = useCallback(async () => {
    await stopMedia(); clearVoiceFiles();
    const previous = latest.current;
    if (previous.status === 'signedIn') await stopPhonePush(previous.session.access_token, previous.session.user.id).catch(() => {});
    await signOutHere();
    closeOutboxes();
    clearShared();
    await cache.clear();
    setState({ status: "signedOut" });
    setAttempt((value) => value + 1);
  }, []);
  // The API refused the token: refresh it once, and return to sign-in only if that is refused too.
  const sessionRefused = useCallback(async () => {
    const { data, error } = await getAuth().refreshSession();
    if (data.session) return;
    if (error && isOffline(error)) return;
    await signOut();
  }, [signOut]);
  const value = useMemo(() => ({ state, retry, signOut, sessionRefused }), [state, retry, signOut, sessionRefused]);
  return <Context value={value}>{children}</Context>;
}

export function useSession() {
  const value = use(Context);
  if (!value) throw new Error("SessionProvider is missing.");
  return value;
}
export function useSignedIn() {
  const { state } = useSession();
  if (state.status !== "signedIn") throw new Error("This screen needs a signed-in person.");
  return state.session;
}
