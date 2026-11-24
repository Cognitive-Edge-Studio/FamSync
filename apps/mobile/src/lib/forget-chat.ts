import { cache } from "./cache";
import { closeOutbox } from "./outboxes";

export const chatNames = ["chat:", "unsent:", "draft:", "chat-details:", "channel-form:"];

/** Removes everything this phone holds about a conversation the person can no longer open. */
export async function forgetChat(user: string, store: string, id: string) {
  closeOutbox(user, id);
  for (const name of chatNames) await cache.drop(user, store, name + id);
  // These lists can quote its messages. They are loaded again when opened.
  for (const name of ["starred", "chats-archived", "folders:" + id]) await cache.drop(user, store, name);
}
