// Unsent work is kept on this device per account and conversation. It is removed on sign-out or when access ends.
export type DraftReply = { id: string; body: string; author: string };
export type DraftFile = { id: string; fileName: string };
export type Outgoing = {
  id: string; body: string; reply: DraftReply | null; mentions: string[]; files: DraftFile[]; createdAt: string;
  state: "sending" | "failed"; error?: string;
  /** The server refused it, so it was certainly not saved and may be edited under a new ID. */
  refused?: boolean;
};
export type ChatDraft = { body: string; mentions: string[]; reply: DraftReply | null; files: DraftFile[]; outgoing: Outgoing[] };

const prefix = "famsync-chat:";
const keyFor = (userId: string, channelId: string) => prefix + userId + ":" + channelId;
export const emptyDraft = (): ChatDraft => ({ body: "", mentions: [], reply: null, files: [], outgoing: [] });

export function readDraft(userId: string, channelId: string): ChatDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(userId, channelId)) ?? "null") as Partial<ChatDraft> | null;
    if (!saved || typeof saved !== "object") return emptyDraft();
    return {
      body: typeof saved.body === "string" ? saved.body : "",
      mentions: Array.isArray(saved.mentions) ? saved.mentions : [],
      reply: saved.reply ?? null,
      files: Array.isArray(saved.files) ? saved.files : [],
      outgoing: Array.isArray(saved.outgoing) ? saved.outgoing : [],
    };
  } catch { return emptyDraft(); }
}

export function saveDraft(userId: string, channelId: string, change: Partial<ChatDraft>) {
  try {
    const next = { ...readDraft(userId, channelId), ...change };
    if (!next.body && !next.reply && !next.files.length && !next.outgoing.length) localStorage.removeItem(keyFor(userId, channelId));
    else localStorage.setItem(keyFor(userId, channelId), JSON.stringify(next));
  } catch { /* Without storage, the draft lasts until the page closes. */ }
}

export function removeDraft(userId: string, channelId: string) {
  try { localStorage.removeItem(keyFor(userId, channelId)); } catch { /* Nothing was stored. */ }
}

export function clearChatDrafts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
  } catch { /* Nothing was stored. */ }
}
