import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { ApiError, getApi, required } from "./api";
import { cache } from "./cache";
import { useChats } from "./chat";
import { useFamilyState } from "./family";
import { noticeTarget, type NoticeItem, type NoticeTarget } from "./notice-rules";
import type { QueryError } from "./query";
import { accountStore } from "./scope";
import { useSession, useSignedIn } from "./session";

export type Notice = NoticeItem & { target: NoticeTarget };
type Value = { items?: Notice[]; savedAt?: number; error?: QueryError; unread: number; refresh: () => void; markRead: (ids: string[]) => Promise<void> };
const Context = createContext<Value | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const { access_token, user } = useSignedIn(), { sessionRefused } = useSession(), { state } = useFamilyState(), { guests } = useChats();
  const family = state.status === "ready" ? state.family.id : null, [list, setList] = useState<{ items?: NoticeItem[]; savedAt?: number; error?: QueryError }>({}), token = useRef(access_token), run = useRef(0);
  token.current = access_token;
  const refresh = useCallback(async () => {
    const mine = ++run.current;
    try {
      const { items } = required(await getApi(token.current).GET("/api/v1/notifications", { params: { query: { limit: 100 } } }));
      if (mine !== run.current) return;
      setList({ items });
      void cache.save(user.id, accountStore, "notifications", items);
    } catch (problem) {
      if (mine !== run.current) return;
      const status = problem instanceof ApiError ? problem.status : 0;
      if (status === 401) await sessionRefused();
      setList((old) => ({ ...old, error: status === 0 ? "offline" : "failed" }));
    }
  }, [user.id, sessionRefused]);
  useEffect(() => {
    let stopped = false;
    void cache.read<NoticeItem[]>(user.id, accountStore, "notifications").then((saved) => { if (!stopped && saved) setList((old) => old.items ? old : { items: saved.data, savedAt: saved.savedAt }); });
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === "active" || AppState.currentState === null) void refresh(); }, 60_000);
    const app = AppState.addEventListener("change", (next) => { if (next === "active") void refresh(); });
    return () => { stopped = true; run.current += 1; clearInterval(timer); app.remove(); };
  }, [user.id, refresh]);
  // Only what can be opened here is shown and counted.
  const items = useMemo(() => list.items?.flatMap((item) => { const target = noticeTarget(item.path, family, (guests ?? []).map((channel) => channel.id)); return target ? [{ ...item, target }] : []; }), [list.items, family, guests]);
  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    required(await getApi(token.current).POST("/api/v1/notifications/read", { body: { ids } }));
    run.current += 1;
    setList((old) => ({ ...old, items: old.items?.map((item) => ids.includes(item.id) ? { ...item, read: true } : item) }));
  }, []);
  const reload = useCallback(() => void refresh(), [refresh]);
  const value = useMemo(() => ({ ...list, items, unread: items?.filter((item) => !item.read).length ?? 0, refresh: reload, markRead }), [list, items, reload, markRead]);
  return <Context value={value}>{children}</Context>;
}
export function useNotices() {
  const value = use(Context);
  if (!value) throw new Error("NoticeProvider is missing.");
  return value;
}
