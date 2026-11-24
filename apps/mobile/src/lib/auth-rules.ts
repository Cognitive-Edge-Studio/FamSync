const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
/** The same rule as on web: 8 characters or more, and at most 72 bytes. */
export function passwordProblem(value: string) {
  if (value.length < 8) return "Use at least 8 characters.";
  return new TextEncoder().encode(value).length > 72 ? "Use a shorter password." : null;
}

export type InvitationKind = "family" | "channel";
export type PendingInvitation = { kind: InvitationKind; token: string; until: number };
const lifetime = 24 * 60 * 60_000;

/** The token of an invitation link: "famsync://join?token=…", or the website's "/join/#token=…". */
export function invitationToken(params: { token?: string; "#"?: string }): string | null | undefined {
  const token = params.token ?? (params["#"] ? new URLSearchParams(params["#"]).get("token") ?? undefined : undefined);
  return token === undefined ? undefined : tokenPattern.test(token) ? token : null;
}
export const pendingFrom = (kind: InvitationKind, token: string, now = Date.now()): PendingInvitation => ({ kind, token, until: now + lifetime });
export function readPending(text: string | null, now = Date.now()): PendingInvitation | null {
  try {
    const value = JSON.parse(text ?? "null") as Partial<PendingInvitation> | null;
    return value && (value.kind === "family" || value.kind === "channel") && typeof value.token === "string" && tokenPattern.test(value.token) && typeof value.until === "number" && value.until > now ? value as PendingInvitation : null;
  } catch { return null; }
}
