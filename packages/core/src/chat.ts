import type { components } from "@famsync/api-client";

// Chat rules shared by web and Android.
export type Channel = components["schemas"]["ChannelDto"];
export type ChannelDetail = components["schemas"]["ChannelDetailDto"];
export type ChannelMessage = components["schemas"]["ChannelMessageDto"];
export type AttachmentKind = "voice" | "photo" | "video" | "file" | null;

export const quickReactions = ["👍", "❤️", "🎉", "😂", "🙏"] as const;

export const attachmentLabel = (kind: AttachmentKind, count = 1) =>
  count > 1 ? count + " attachments" : kind === "voice" ? "Voice message" : kind === "photo" ? "Photo" : kind === "video" ? "Video" : "File";

export const replyText = (reply: { body: string; deleted: boolean; fileCount: number; attachment: AttachmentKind }) =>
  reply.deleted ? "Message deleted" : reply.body || (reply.fileCount ? attachmentLabel(reply.attachment, reply.fileCount) : "Attachment removed");

export function attachmentOf(files: ChannelMessage["files"]): AttachmentKind {
  const first = files[0];
  if (!first) return null;
  return first.voiceSeconds ? "voice" : first.mime?.startsWith("image/") ? "photo" : first.mime?.startsWith("video/") ? "video" : "file";
}

/** A slower response never replaces a newer state of the same message. */
export function mergeMessages(old: ChannelMessage[], incoming: ChannelMessage[]) {
  const all = new Map(old.map((message) => [message.id, message]));
  for (const message of incoming) if ((all.get(message.id)?.changeSeq ?? -1) <= message.changeSeq) all.set(message.id, message);
  return [...all.values()].sort((a, b) => a.position - b.position);
}

export type Receipt = "sent" | "delivered" | "read" | null;
/** People who were in the conversation when the message was sent, other than its author. */
export const receiptPeople = (channel: ChannelDetail, message: ChannelMessage) =>
  channel.members.filter((member) => member.userId !== message.author?.userId && member.joinedPosition < message.position);
export function receiptOf(channel: ChannelDetail, message: ChannelMessage): Receipt {
  const people = receiptPeople(channel, message);
  if (!people.length) return null;
  if (people.every((member) => (member.readPosition ?? 0) >= message.position)) return "read";
  return people.every((member) => member.deliveredPosition >= message.position) ? "delivered" : "sent";
}

export function previewText(channel: Channel, userId: string) {
  const last = channel.lastMessage;
  if (!last) return channel.topic || (channel.kind === "dm" ? "No messages yet" : channel.memberCount + (channel.memberCount === 1 ? " member" : " members"));
  const author = last.author?.userId === userId ? "You: " : channel.kind === "dm" ? "" : (last.author?.name ?? "Former member") + ": ";
  return author + (last.deleted ? "Message deleted" : last.body.replace(/\s+/g, " ") || (last.fileCount ? attachmentLabel(last.attachment, last.fileCount) : "Attachment removed"));
}

export function typingLabel(names: string[], direct: boolean) {
  if (!names.length) return "";
  if (names.length === 1) return direct ? "typing…" : names[0] + " is typing…";
  return names.length === 2 ? names.join(" and ") + " are typing…" : "Several people are typing…";
}

const dayKey = (value: string) => new Date(value).toDateString();
export const clockText = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
export function dayLabel(value: string, now = new Date()) {
  const day = new Date(value), yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day.toDateString() === now.toDateString()) return "Today";
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}
export function listTime(value: string) {
  const label = dayLabel(value);
  return label === "Today" ? clockText(value) : label === "Yesterday" ? label : new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function seenText(value: string) {
  const label = dayLabel(value);
  return "Last seen " + (label === "Today" ? "today at " + clockText(value) : label === "Yesterday" ? "yesterday at " + clockText(value) : "on " + new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
}

export type FeedRow = { message: ChannelMessage; day: string | null; unread: boolean; grouped: boolean };
/** Day separators, the first unread message and runs by one sender within five minutes. Oldest first. */
export function feedRows(messages: ChannelMessage[], me: string, unreadAfter: number | null): FeedRow[] {
  const firstUnread = unreadAfter === null ? undefined : messages.find((message) => message.position > unreadAfter && message.author?.userId !== me)?.id;
  return messages.map((message, index) => {
    const previous = messages[index - 1], newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt), unread = message.id === firstUnread;
    const grouped = !newDay && !unread && !!previous.author && previous.author.userId === message.author?.userId && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000;
    return { message, day: newDay ? dayLabel(message.createdAt) : null, unread, grouped };
  });
}

/** True when the text already shows this person's @name. */
export const showsMention = (body: string, name: string) => body.includes("@" + name);

export type TextPart = { kind: "text" | "mention"; text: string } | { kind: "link"; text: string; href: string };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const link = "(?:https?:\\/\\/|www\\.)[^\\s<>\"]+";

// Sentence punctuation after a link is not part of it; a closing bracket is kept only when it was opened inside.
function trimLink(text: string) {
  let value = text;
  for (;;) {
    const last = value.at(-1);
    if (last && /[.,!?;:'*_]/.test(last)) value = value.slice(0, -1);
    else if (last === ")" && value.split("(").length < value.split(")").length) value = value.slice(0, -1);
    else return value;
  }
}
function safeUrl(text: string) {
  try {
    const url = new URL(/^www\./i.test(text) ? "https://" + text : text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

/** Plain text split into web links, the message's own mentions and everything else. Nothing is interpreted as markup. */
export function messageParts(body: string, mentions: string[]): TextPart[] {
  const names = mentions.map((name) => "@" + name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp("(" + [link, ...names.map(escape)].join("|") + ")", "gi"), whole = new RegExp("^" + link + "$", "i");
  const parts: TextPart[] = [];
  let end = 0;
  for (const match of body.matchAll(pattern)) {
    let text = match[0];
    const mention = names.includes(text), web = !mention && whole.test(text);
    if (!mention && !web) continue;
    if (web) text = trimLink(text);
    const href = web ? safeUrl(text) : null;
    if (web && !href) continue;
    if (match.index > end) parts.push({ kind: "text", text: body.slice(end, match.index) });
    end = match.index + text.length;
    parts.push(href ? { kind: "link", text, href } : { kind: "mention", text });
  }
  if (end < body.length) parts.push({ kind: "text", text: body.slice(end) });
  return parts;
}

/** The "@name" being typed at the cursor, if any. */
export function mentionQuery(value: string, position: number) {
  const match = /(?:^|\s)@([^\s@][^@\n]{0,30})?$/.exec(value.slice(0, position)), text = match?.[1] ?? "";
  return match ? { start: position - text.length - 1, end: position, text } : null;
}

export type DraftReply = { id: string; body: string; author: string };
export type DraftFile = { id: string; fileName: string };
export type Outgoing = {
  id: string; body: string; reply: DraftReply | null; mentions: string[]; files: DraftFile[]; createdAt: string;
  state: "sending" | "failed"; error?: string;
  /** The server refused it, so it was certainly not saved and may be edited under a new ID. */
  refused?: boolean;
};
export const uncertainSend = "Connection problem. It may not have been sent; retrying is safe.";

type Posted = { status: "sent"; message: ChannelMessage } | { status: "refused"; error: string; lost: boolean } | { status: "unknown"; error?: string };
/**
 * Messages of one conversation waiting to be sent, in order. Each keeps its ID until it is saved or discarded, so a
 * retry cannot create a second copy. Sending continues after the screen closes; what is unsent survives a restart.
 */
export function createOutbox({ load, save, post, onSent, onLost }: {
  load: () => Promise<Outgoing[]>; save: (items: Outgoing[]) => Promise<void>; post: (item: Outgoing) => Promise<Posted>;
  onSent: (message: ChannelMessage) => void; onLost: () => void;
}) {
  let items: Outgoing[] = [], running = false, closed = false;
  const listeners = new Set<(items: Outgoing[]) => void>();
  const ready = load().then((saved) => { items = [...saved.map((item) => item.state === "sending" ? { ...item, state: "failed" as const, error: uncertainSend } : item), ...items]; tell(); }, () => {});
  let saving: Promise<void> = Promise.resolve();
  function tell() { for (const listener of listeners) listener(items); }
  function change(next: Outgoing[]) {
    if (closed) return;
    items = next;
    tell();
    const snapshot = items;
    saving = saving.then(() => closed ? undefined : save(snapshot)).catch(() => {});
  }
  const patch = (id: string, value: Partial<Outgoing>) => change(items.map((item) => item.id === id ? { ...item, ...value } : item));
  async function flush() {
    if (running) return;
    running = true;
    try {
      await ready;
      for (;;) {
        const item = items.find((entry) => entry.state === "sending");
        if (!item || closed) return;
        const result = await post(item).catch((): Posted => ({ status: "unknown" }));
        if (closed) return;
        if (result.status === "sent") { change(items.filter((entry) => entry.id !== item.id)); onSent(result.message); }
        else if (result.status === "refused") { patch(item.id, { state: "failed", error: result.error, refused: true }); if (result.lost) onLost(); }
        else patch(item.id, { state: "failed", error: result.error ?? uncertainSend, refused: false });
      }
    } finally { running = false; }
  }
  return {
    ready, items: () => items, settled: () => saving,
    subscribe(listener: (items: Outgoing[]) => void) { listeners.add(listener); listener(items); return () => { listeners.delete(listener); }; },
    send(item: Omit<Outgoing, "state" | "createdAt">) { change([...items, { ...item, createdAt: new Date().toISOString(), state: "sending" }]); return flush(); },
    retry(id: string) { patch(id, { state: "sending", error: undefined, refused: false }); return flush(); },
    /** After a lost connection: retry everything that was not refused. */
    retryUncertain() { if (items.some((item) => item.state === "failed" && !item.refused)) { change(items.map((item) => item.refused ? item : { ...item, state: "sending", error: undefined })); return flush(); } return Promise.resolve(); },
    discard(id: string) { change(items.filter((item) => item.id !== id)); },
    /** Takes a refused message out for editing. */
    take(id: string) { const item = items.find((entry) => entry.id === id && entry.refused); if (item) change(items.filter((entry) => entry.id !== id)); return item; },
    /** Drops messages that did arrive, for example after a restart. */
    arrived(ids: Set<string>) { if (items.some((item) => item.state === "failed" && ids.has(item.id))) change(items.filter((item) => item.state !== "failed" || !ids.has(item.id))); },
    close() { closed = true; items = []; tell(); },
  };
}
export type Outbox = ReturnType<typeof createOutbox>;
