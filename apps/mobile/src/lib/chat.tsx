import type { components } from "@famsync/api-client";
import type { Channel } from "@famsync/core/chat";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { ApiError, getApi, required } from "./api";
import { cache } from "./cache";
import { useFamilyState } from "./family";
import { chatNames, forgetChat } from "./forget-chat";
import { liveConnection } from "./live";
import { retryOutboxes } from "./outboxes";
import type { QueryError } from "./query";
import { guestStore } from "./scope";
import { useSession, useSignedIn } from "./session";

type Watcher = { signal: () => void; typing: (userId: string, active: boolean) => void };
export type GuestChannel = components["schemas"]["GuestWorkspaceDto"];
type Value = {
  guests?: GuestChannel[]; guestsSavedAt?: number; guestsError?: QueryError; guestUnread: number; refreshGuests: () => void;
  channels?: Channel[]; savedAt?: number; error?: QueryError; loading: boolean; unread: number;
  refresh: () => void; watch: (channelId: string, watcher: Watcher) => () => void;
};
const Context = createContext<Value | null>(null);

/** Keeps the chat list, unread count, delivery acknowledgements, presence and live connection while the app is in front. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { state } = useFamilyState(), { access_token, user } = useSignedIn(), { sessionRefused } = useSession();
  const family = state.status === "ready" ? state.family.id : null;
  const [list, setList] = useState<{ channels?: Channel[]; savedAt?: number; error?: QueryError; loading: boolean }>({ loading: true });
  const [guestList, setGuestList] = useState<{ guests?: GuestChannel[]; savedAt?: number; error?: QueryError }>({}), guestRun = useRef(0);
  const watchers = useRef(new Map<string, Set<Watcher>>()), [watched, setWatched] = useState<string[]>([]);
  const token = useRef(access_token), run = useRef(0), checkedAt = useRef(0), connection = useRef<ReturnType<typeof liveConnection>>(undefined);
  token.current = access_token;

  const refresh = useCallback(async () => {
    if (!family) return;
    const mine = ++run.current, api = getApi(token.current), path = { familyId: family };
    setList((old) => ({ ...old, loading: true }));
    try {
      const channels: Channel[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const result = required(await api.GET("/api/v1/families/{familyId}/channels", { params: { path, query: { kind: "all", limit: 100, cursor } } }));
        channels.push(...result.channels);
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      if (mine !== run.current) return;
      const unique = [...new Map(channels.map((channel) => [channel.id, channel])).values()];
      setList({ channels: unique, loading: false });
      void cache.save(user.id, family, "chats", unique);
      // A saved chat that left the list is archived for this person, or no longer theirs. The server decides which.
      if (Date.now() - checkedAt.current > 60_000) {
        checkedAt.current = Date.now();
        for (const id of await cache.ids(user.id, family, chatNames)) {
          if (mine !== run.current) return;
          if (unique.some((channel) => channel.id === id) || !/^[0-9a-f-]{36}$/.test(id)) continue;
          const { response } = await api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: id } } });
          if (response.status === 403 || response.status === 404) { await forgetChat(user.id, family, id); watchers.current.get(id)?.forEach((watcher) => watcher.signal()); }
        }
      }
      // This phone now has the latest message of each chat. Reading is acknowledged separately.
      const items = unique.filter((channel) => channel.lastPosition > channel.deliveredPosition).slice(0, 100).map((channel) => ({ id: channel.id, position: channel.lastPosition }));
      if (items.length) void api.PUT("/api/v1/families/{familyId}/channels/delivered", { params: { path }, body: { items } }).catch(() => {});
    } catch (problem) {
      if (mine !== run.current) return;
      const status = problem instanceof ApiError ? problem.status : 0;
      if (status === 401) await sessionRefused();
      const lost = status === 403 || status === 404;
      if (lost) await cache.drop(user.id, family, "chats");
      setList((old) => lost ? { error: "lost", loading: false } : { ...old, error: status === 0 ? "offline" : "failed", loading: false });
    }
  }, [family, user.id, sessionRefused]);

  const refreshGuests = useCallback(async () => {
    const mine = ++guestRun.current, guests: GuestChannel[] = [];
    try {
      let cursor: string | undefined, complete = false;
      for (let page = 0; page < 5 && !complete; page += 1) {
        const result = required(await getApi(token.current).GET("/api/v1/guest-channels", { params: { query: { limit: 100, cursor } } }));
        guests.push(...result.channels);
        cursor = result.nextCursor ?? undefined;
        complete = !cursor;
      }
      if (mine !== guestRun.current) return;
      setGuestList({ guests });
      void cache.save(user.id, guestStore, "guests", guests);
      // Saved guest channels that are no longer granted are removed.
      if (complete) for (const id of await cache.ids(user.id, guestStore, chatNames)) {
        if (mine !== guestRun.current) return;
        if (guests.some((channel) => channel.id === id)) continue;
        await forgetChat(user.id, guestStore, id);
        watchers.current.get(id)?.forEach((watcher) => watcher.signal());
      }
    } catch (problem) {
      if (mine !== guestRun.current) return;
      const status = problem instanceof ApiError ? problem.status : 0;
      if (status === 401) await sessionRefused();
      setGuestList((old) => ({ ...old, error: status === 0 ? "offline" : "failed" }));
    }
  }, [user.id, sessionRefused]);

  // Saved chats first, then fresh ones, then whenever the app comes back or something may have changed.
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { timer ??= setTimeout(() => { timer = undefined; if (!stopped) { void refresh(); void refreshGuests(); } }, 300); };
    setList({ loading: true });
    if (family) void cache.read<Channel[]>(user.id, family, "chats").then((saved) => { if (!stopped && saved) setList((old) => old.channels ? old : { ...old, channels: saved.data, savedAt: saved.savedAt }); });
    void cache.read<GuestChannel[]>(user.id, guestStore, "guests").then((saved) => { if (!stopped && saved) setGuestList((old) => old.guests ? old : { ...old, guests: saved.data, savedAt: saved.savedAt }); });
    checkedAt.current = 0;
    void refresh();
    void refreshGuests();
    const live = liveConnection(user.id, {
      signal: (id) => { soon(); watchers.current.get(id)?.forEach((watcher) => watcher.signal()); },
      typing: (id, userId, active) => watchers.current.get(id)?.forEach((watcher) => watcher.typing(userId, active)),
    });
    connection.current = live;
    const presence = (online: boolean) => void getApi(token.current).PUT("/api/v1/me/presence", { body: { online } }).catch(() => {});
    let front = AppState.currentState === "active" || AppState.currentState === null;
    if (front) presence(true);
    const everyone = () => watchers.current.forEach((set) => set.forEach((watcher) => watcher.signal()));
    const app = AppState.addEventListener("change", (next) => {
      const active = next === "active";
      if (active === front) return;
      front = active;
      presence(active);
      if (active) { checkedAt.current = 0; live.resume(); retryOutboxes(); soon(); everyone(); } else live.pause();
    });
    const poll = setInterval(() => { if (front) { soon(); } }, 20_000), beat = setInterval(() => { if (front) presence(true); }, 60_000);
    return () => { stopped = true; run.current += 1; guestRun.current += 1; if (timer) clearTimeout(timer); clearInterval(poll); clearInterval(beat); app.remove(); live.stop(); connection.current = undefined; };
  }, [family, user.id, refresh, refreshGuests]);

  const ids = useMemo(() => [...new Set([...(list.channels ?? []).map((channel) => channel.id), ...(guestList.guests ?? []).map((channel) => channel.id), ...watched])].sort().join(","), [list.channels, guestList.guests, watched]);
  useEffect(() => { connection.current?.watch(ids ? ids.split(",") : []); }, [ids, family]);

  const watch = useCallback((channelId: string, watcher: Watcher) => {
    const set = watchers.current.get(channelId) ?? new Set();
    set.add(watcher);
    watchers.current.set(channelId, set);
    setWatched((old) => old.includes(channelId) ? old : [...old, channelId]);
    return () => {
      set.delete(watcher);
      if (set.size === 0) { watchers.current.delete(channelId); setWatched((old) => old.filter((id) => id !== channelId)); }
    };
  }, []);
  const unread = (list.channels ?? []).filter((channel) => !channel.muted && (channel.unread > 0 || channel.markedUnread)).length;
  // Screens load again when this changes, so it must not change with the list.
  const reload = useCallback(() => void refresh(), [refresh]);
  const reloadGuests = useCallback(() => void refreshGuests(), [refreshGuests]), guestUnread = (guestList.guests ?? []).filter((channel) => channel.unread > 0).length;
  const value = useMemo(() => ({ ...list, unread, refresh: reload, watch, guests: guestList.guests, guestsSavedAt: guestList.savedAt, guestsError: guestList.error, guestUnread, refreshGuests: reloadGuests }), [list, unread, reload, watch, guestList, guestUnread, reloadGuests]);
  return <Context value={value}>{children}</Context>;
}

export function useChats() {
  const value = use(Context);
  if (!value) throw new Error("ChatProvider is missing.");
  return value;
}
