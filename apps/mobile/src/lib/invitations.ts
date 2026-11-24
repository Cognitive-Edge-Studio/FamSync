import { pendingFrom, readPending, type InvitationKind } from "./auth-rules";
import { keyStore } from "./secure-store";

const key = "famsync-invitation";

/** Keeps one invitation for a day, so it survives creating an account or signing in. */
export const keepInvitation = (kind: InvitationKind, token: string) => keyStore.set(key, JSON.stringify(pendingFrom(kind, token))).catch(() => {});
export const forgetInvitation = () => keyStore.remove(key).catch(() => {});
export async function pendingInvitation() {
  const value = readPending(await keyStore.get(key).catch(() => null));
  if (!value) await forgetInvitation();
  return value;
}
