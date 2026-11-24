import type { Session } from "@supabase/auth-js";

export function readSaved(text: string | null): Session | null {
  try {
    const saved = JSON.parse(text ?? "null") as Partial<Session> | null;
    return saved && typeof saved.access_token === "string" && typeof saved.refresh_token === "string" && typeof saved.user?.id === "string" ? saved as Session : null;
  } catch { return null; }
}
