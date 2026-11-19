"use client";

import { cn } from "@/lib/utils";

// Live updates are expected to just work, so nothing is shown while they do.
// Only a dropped or unavailable connection is announced; data still refreshes on focus and every 15 seconds.
const quiet = new Set(["Live updates connected", "Connecting to updates…", "Updates will connect when a conversation opens."]);

export function LiveStatus({ state, className }: { state: string; className?: string }) {
  if (quiet.has(state)) return null;
  return (
    <p role="status" className={cn("text-xs text-muted-foreground", className)}>
      {state.startsWith("Reconnecting") ? "Offline — reconnecting. Changes will appear shortly." : "Live updates are unavailable. Changes appear when you return to this page."}
    </p>
  );
}
