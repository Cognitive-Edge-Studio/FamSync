"use client";

import { AppShell } from "./app-shell";
import { FamilySession } from "./family-session";
import { ScheduleFamily } from "./schedule-family";
import dynamic from "next/dynamic";

const FamilyBaseUniverse = dynamic(() => import("./family-base-universe"), {
  ssr: false,
  loading: () => <div role="status" className="grid flex-1 place-items-center bg-[#f4f6f3] text-sm text-muted-foreground dark:bg-[#08101e]">Opening your family universe…</div>,
});

export function FamilyBaseScreen() {
  return (
    <AppShell activePage="family-base" contentLayout="canvas">
      <div className="flex min-h-0 flex-1 flex-col">
        <h1 className="sr-only">Family Base</h1>
        <FamilySession>
          {(session) => (
            <ScheduleFamily key={session.user.id} session={session} section="family-base">
              {(family) => <FamilyBaseUniverse key={family.id} familyId={family.id} accessToken={session.access_token} timeZone={family.timeZone} />}
            </ScheduleFamily>
          )}
        </FamilySession>
      </div>
    </AppShell>
  );
}
