import { mergeMessages, type ChannelDetail, type ChannelMessage, type Outgoing } from "@famsync/core/chat";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError, getApi, required } from "./api";
import { cache } from "./cache";
import { useChats } from "./chat";
import { forgetChat } from "./forget-chat";
import { outboxFor } from "./outboxes";
import type { QueryError } from "./query";
import { useSession, useSignedIn } from "./session";

type Saved = { channel: ChannelDetail; messages: ChannelMessage[]; before: number | null };
const page = 50;

/** One conversation: saved copy first, then only new and changed messages, older ones on request, read position and typing. */
export function useConversation(family: string, channelId: string, store: string) {
  const { access_token, user } = useSignedIn(), { sessionRefused } = useSession(), { watch, refresh: refreshChats } = useChats();
  const path = useMemo(() => ({ familyId: family, channelId }), [family, channelId]);
  const [channel, setChannel] = useState<ChannelDetail>(), [messages, setMessages] = useState<ChannelMessage[]>([]), [savedAt, setSavedAt] = useState<number>();
  const [error, setError] = useState<QueryError>(), [hasOlder, setHasOlder] = useState(false), [loadingOlder, setLoadingOlder] = useState(false), [loading, setLoading] = useState(true);
  const [unreadAfter, setUnreadAfter] = useState<number | null>(null), [typing, setTyping] = useState<Record<string, number>>({}), [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const token = useRef(access_token), focused = useRef(false), atBottom = useRef(false), live = useRef(true);
  token.current = access_token;
  // Positions of what is loaded. They follow the server's data, not the saved copy.
  // Nothing counts as read until the screen says the newest message is showing (atBottom).
  const loaded = useRef(false), cursor = useRef(0), earliest = useRef(0), before = useRef<number | null>(null), olderBusy = useRef(false), run = useRef(0), reading = useRef(false), readTo = useRef(0), lost = useRef(false);
  const entry = useMemo(() => outboxFor(user.id, family, channelId, store), [user.id, family, channelId, store]);

  const lose = useCallback(async () => {
    lost.current = true;
    await forgetChat(user.id, store, channelId);
    if (!live.current) return;
    setChannel(undefined); setMessages([]); setTyping({}); setError("lost"); setLoading(false);
    refreshChats();
  }, [user.id, store, channelId, refreshChats]);

  const load = useCallback(async () => {
    if (lost.current) return;
    const mine = ++run.current, api = getApi(token.current), current = () => live.current && mine === run.current && !lost.current;
    setLoading(true);
    try {
      const detail = required(await api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path } }));
      const first = !loaded.current, from = first ? undefined : earliest.current, incoming: ChannelMessage[] = [];
      let since = first ? undefined : cursor.current, older: number | null = null, latest = 0;
      for (;;) {
        const result = required(await api.GET("/api/v1/families/{familyId}/channels/{channelId}/messages", { params: { path, query: { changedSince: since, from, limit: first ? page : 100 } } }));
        incoming.push(...result.messages);
        if (first) older = result.nextBefore;
        latest = result.latestChange;
        if (result.nextChange === null || !current()) break;
        since = result.nextChange;
      }
      if (!current()) return;
      cursor.current = Math.max(cursor.current, latest);
      setChannel(detail); setError(undefined); setSavedAt(undefined); setLoading(false);
      if (first) {
        loaded.current = true;
        earliest.current = incoming[0]?.position ?? 0;
        before.current = older;
        setHasOlder(older !== null);
        setMessages(incoming);
        if (detail.unread > 0) setUnreadAfter(detail.readPosition);
        if (detail.markedUnread) void api.PUT("/api/v1/families/{familyId}/channels/{channelId}/preferences", { params: { path }, body: { unread: false } }).catch(() => {});
      } else if (incoming.length) {
        setMessages((old) => mergeMessages(old, incoming));
        // Someone whose message has arrived is no longer typing it.
        const newest = incoming.reduce((a, b) => a.position > b.position ? a : b).author?.userId;
        if (newest) setTyping(({ [newest]: _, ...rest }) => rest);
      }
      if (detail.deliveredPosition < detail.lastPosition) void api.PUT("/api/v1/families/{familyId}/channels/delivered", { params: { path: { familyId: family } }, body: { items: [{ id: channelId, position: detail.lastPosition }] } }).catch(() => {});
    } catch (problem) {
      if (!current()) return;
      const status = problem instanceof ApiError ? problem.status : 0;
      if (status === 401) await sessionRefused();
      if (status === 403 || status === 404) return lose();
      if (current()) { setError(status === 0 ? "offline" : "failed"); setLoading(false); }
    }
  }, [path, family, channelId, lose, sessionRefused]);

  const markRead = useCallback(async () => {
    const position = newest.current;
    if (!position || position <= readTo.current || reading.current || lost.current || !loaded.current || !focused.current || !atBottom.current || AppState.currentState !== "active") return;
    reading.current = true;
    try {
      const { data } = await getApi(token.current).PUT("/api/v1/families/{familyId}/channels/{channelId}/read", { params: { path }, body: { position } });
      if (data) { readTo.current = position; refreshChats(); }
    } catch { /* The next refresh tries again. */ } finally { reading.current = false; }
  }, [path, refreshChats]);
  const newest = useRef(0);
  newest.current = messages.at(-1)?.position ?? 0;

  useEffect(() => {
    live.current = true;
    const handlers = { sent: (message: ChannelMessage) => { if (live.current && !lost.current) { setMessages((old) => mergeMessages(old, [message])); refreshChats(); } }, lost: () => void lose() };
    entry.handlers.add(handlers);
    const stopItems = entry.outbox.subscribe(setOutgoing);
    void cache.read<Saved>(user.id, store, "chat:" + channelId).then((saved) => {
      if (!saved || !live.current || loaded.current || lost.current) return;
      setChannel(saved.data.channel); setMessages(saved.data.messages); setSavedAt(saved.savedAt);
    });
    const stopWatch = watch(channelId, { signal: () => { if (focused.current) void load(); }, typing: (userId, active) => { if (userId !== user.id) setTyping(({ [userId]: _, ...rest }) => active ? { ...rest, [userId]: Date.now() } : rest); } });
    return () => { live.current = false; run.current += 1; entry.handlers.delete(handlers); stopItems(); stopWatch(); };
  }, [entry, user.id, store, channelId, watch, load, lose, refreshChats]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load();
    void entry.outbox.retryUncertain();
    const poll = setInterval(() => { if (AppState.currentState === "active") { void load(); void entry.outbox.retryUncertain(); } }, 15_000);
    return () => { focused.current = false; clearInterval(poll); };
  }, [load, entry]));
  useEffect(() => { void markRead(); }, [messages, markRead]);
  useEffect(() => { if (messages.length) entry.outbox.arrived(new Set(messages.map((message) => message.id))); }, [messages, entry]);
  // Only what the server sent is saved, and only its most recent part.
  useEffect(() => { if (loaded.current && channel && !lost.current) void cache.save(user.id, store, "chat:" + channelId, { channel, messages: messages.slice(-page), before: null } satisfies Saved); }, [channel, messages, user.id, store, channelId]);
  const someone = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!someone) return;
    const timer = setInterval(() => setTyping((old) => Object.fromEntries(Object.entries(old).filter(([, at]) => Date.now() - at < 6000))), 1000);
    return () => clearInterval(timer);
  }, [someone]);

  const older = useCallback(async (limit = page) => {
    const start = before.current;
    if (start === null || olderBusy.current || !loaded.current) return false;
    olderBusy.current = true;
    setLoadingOlder(true);
    const since = cursor.current;
    try {
      const result = required(await getApi(token.current).GET("/api/v1/families/{familyId}/channels/{channelId}/messages", { params: { path, query: { before: start, limit } } }));
      if (!live.current || lost.current) return false;
      earliest.current = result.messages[0]?.position ?? earliest.current;
      before.current = result.nextBefore;
      setHasOlder(result.nextBefore !== null);
      setMessages((old) => mergeMessages(old, result.messages));
      // Changes to this page while it loaded were outside the last check, so check again from where it began.
      cursor.current = Math.min(cursor.current, since);
      return true;
    } catch { return false; } finally { olderBusy.current = false; if (live.current) setLoadingOlder(false); }
  }, [path]);

  /** Loads back to a message. False when it is gone or cannot be reached. */
  const reach = useCallback(async (id: string, isLoaded: (id: string) => boolean): Promise<"ready" | "gone" | "failed"> => {
    if (isLoaded(id)) return "ready";
    try {
      const { data, response } = await getApi(token.current).GET("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}", { params: { path: { ...path, messageId: id } } });
      if (!data) return response.status === 404 ? "gone" : "failed";
      while (live.current && earliest.current > data.position && before.current !== null) {
        if (olderBusy.current) await new Promise((done) => setTimeout(done, 100));
        else if (!await older(100)) return "failed";
      }
      return "ready";
    } catch { return "failed"; }
  }, [path, older]);

  const replace = useCallback((message: ChannelMessage) => setMessages((old) => mergeMessages(old, [message])), []);
  const setBottom = useCallback((value: boolean) => { atBottom.current = value; if (value) void markRead(); }, [markRead]);
  return { channel, setChannel, messages, savedAt, error, loading, hasOlder, loadingOlder, unreadAfter, clearUnread: () => setUnreadAfter(null), typing, outgoing, outbox: entry.outbox, refresh: () => void load(), older, reach, replace, setBottom, lose };
}
