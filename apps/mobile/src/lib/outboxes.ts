import { createOutbox, type ChannelMessage, type Outbox, type Outgoing } from "@famsync/core/chat";
import { getApi } from "./api";
import { getAuth } from "./auth";
import { cache } from "./cache";

type Handlers = { sent: (message: ChannelMessage) => void; lost: () => void };
const open = new Map<string, { outbox: Outbox; handlers: Set<Handlers> }>();
const keyOf = (user: string, channel: string) => user + ":" + channel;

const messageOf = (error: unknown) => {
  const text = (error as { message?: unknown } | undefined)?.message;
  return typeof text === "string" ? text : "We couldn’t send this message. Try again.";
};

/** The conversation's queue, shared by every screen that shows it and kept while the app runs. */
export function outboxFor(user: string, family: string, channel: string, store: string) {
  const key = keyOf(user, channel);
  const existing = open.get(key);
  if (existing) return existing;
  const handlers = new Set<Handlers>();
  const outbox = createOutbox({
    load: async () => (await cache.read<Outgoing[]>(user, store, "unsent:" + channel, true))?.data ?? [],
    save: (items) => items.length ? cache.save(user, store, "unsent:" + channel, items) : cache.drop(user, store, "unsent:" + channel),
    post: async (item) => {
      const token = (await getAuth().getSession()).data.session?.access_token;
      if (!token) return { status: "unknown" };
      const { data, error, response } = await getApi(token).POST("/api/v1/families/{familyId}/channels/{channelId}/messages", {
        params: { path: { familyId: family, channelId: channel } },
        body: { id: item.id, body: item.body, replyToId: item.reply?.id ?? null, mentionedUserIds: item.mentions, fileIds: item.files.map((file) => file.id) },
      });
      if (data) return { status: "sent", message: data };
      return [400, 403, 404, 409].includes(response.status) ? { status: "refused", error: messageOf(error), lost: response.status === 403 || response.status === 404 } : { status: "unknown", error: "We couldn’t send this message. Try again." };
    },
    onSent: (message) => { for (const handler of handlers) handler.sent(message); },
    onLost: () => { for (const handler of handlers) handler.lost(); },
  });
  const entry = { outbox, handlers };
  open.set(key, entry);
  return entry;
}

export function closeOutbox(user: string, channel: string) {
  open.get(keyOf(user, channel))?.outbox.close();
  open.delete(keyOf(user, channel));
}
export function closeOutboxes(exceptUser?: string) {
  for (const [key, { outbox }] of open) if (!exceptUser || !key.startsWith(exceptUser + ":")) { outbox.close(); open.delete(key); }
}
export function retryOutboxes() { for (const { outbox } of open.values()) void outbox.retryUncertain(); }
