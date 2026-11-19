"use client";

import type { Session } from "@supabase/auth-js";
import { useEffect, useState, type ReactNode } from "react";
import { getBrowserAuth } from "@/lib/browser-auth";
import { FormFeedback } from "./account-fields";
import { AppShell } from "./app-shell";
import { ButtonLink } from "./ui/button";

export function FamilyLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell activePage="families">
      <div className="mx-auto max-w-5xl pb-4">{children}</div>
    </AppShell>
  );
}

export function FamilySession({
  children, forInvitation = false,
}: { children: (session: Session) => ReactNode; forInvitation?: boolean }) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const { data: { subscription } } = getBrowserAuth().onAuthStateChange((_event, value) => setSession(value));
      return () => subscription.unsubscribe();
    } catch {
      setError("Sign-in is temporarily unavailable. Try again in a moment.");
    }
  }, []);

  if (error) return <FormFeedback error={error} />;
  if (session === undefined) return <FormFeedback note="Checking your account…" />;
  if (session === null) return (
    <div className="grid gap-4">
      <p className="text-muted-foreground">
        {forInvitation ? "Use the email address that received this invitation." : "Sign in to open your family workspace."}
      </p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/sign-in/" className="h-9 px-4">Sign in</ButtonLink>
        {forInvitation && <ButtonLink href="/sign-up/" className="h-9 px-4" variant="outline">Create an account</ButtonLink>}
      </div>
    </div>
  );
  return children(session);
}

export function familyPath(id: string) {
  return "/family/?id=" + encodeURIComponent(id);
}

export function familyError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}
