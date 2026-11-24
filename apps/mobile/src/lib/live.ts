import { RealtimeClient } from "@supabase/realtime-js";
import { getAuth } from "./auth";
import { checkedUrl } from "./config";

type Listener = { signal: (channelId: string) => void; typing: (channelId: string, userId: string, active: boolean) => void };

/**
 * One connection for every conversation on screen or in the list. Signals carry no message content: data is always
 * fetched from the API, and a periodic check covers anything missed.
 */
export function liveConnection(userId: string, listener: Listener) {
  let client: RealtimeClient | undefined, wanted: string[] = [], stopped = false;
  const joined = new Map<string, ReturnType<RealtimeClient["channel"]>>();
  function address() {
    const value = process.env.EXPO_PUBLIC_SUPABASE_REALTIME_URL;
    // The check expects http(s); the same rule (secure outside development) then applies to the socket.
    try { return value ? checkedUrl("EXPO_PUBLIC_SUPABASE_REALTIME_URL", value.replace(/^ws/, "http"), __DEV__).replace(/^http/, "ws") : null; } catch { return null; }
  }
  async function sync() {
    const url = address();
    if (!url || stopped) return;
    if (!client) {
      const key = process.env.EXPO_PUBLIC_SUPABASE_REALTIME_KEY || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
      client = new RealtimeClient(url, { params: { apikey: key }, accessToken: async () => (await getAuth().getSession()).data.session?.access_token ?? null });
    }
    const current = client;
    try {
      // The person's token is needed before the first join; otherwise the socket joins as nobody.
      await current.setAuth();
    } catch { return; }
    if (stopped || current !== client) return;
    for (const [id, channel] of joined) if (!wanted.includes(id)) { joined.delete(id); void current.removeChannel(channel); }
    for (const id of wanted) {
      if (joined.has(id)) continue;
      const channel = current.channel("famsync:channel:" + id + ":" + userId, { config: { private: true } });
      joined.set(id, channel);
      channel.on("broadcast", { event: "refresh" }, () => listener.signal(id))
        .on("broadcast", { event: "typing" }, ({ payload }) => { if (typeof payload?.userId === "string") listener.typing(id, payload.userId, payload.active === true); })
        // Anything that happened while connecting is picked up once joined.
        .subscribe((status) => { if (status === "SUBSCRIBED") listener.signal(id); });
    }
  }
  function disconnect() {
    const old = client;
    client = undefined;
    joined.clear();
    void old?.removeAllChannels();
    void old?.disconnect();
  }
  return {
    watch(ids: string[]) { wanted = [...new Set(ids)]; void sync(); },
    /** Phones stop sockets in the background, so it is closed there and opened again in front. */
    pause: disconnect,
    resume() { void sync(); },
    stop() { stopped = true; disconnect(); },
  };
}
