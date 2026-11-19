import { createHash, createHmac } from "node:crypto";

// The link token is derived from the delivery attempt, so a retried send repeats the same link
// and no raw token is ever stored. Resending creates a new attempt and therefore a new token.
export function invitationToken(attempt: string) {
  const secret = process.env.INVITATION_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("INVITATION_TOKEN_SECRET must be at least 32 characters.");
  return createHmac("sha256", secret).update("famsync-invitation:" + attempt).digest("base64url");
}

export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
