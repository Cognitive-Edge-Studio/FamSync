"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserAuth, recoveryMarker } from "@/lib/browser-auth";
import { postAuthPath } from "@/lib/pending-invitation";
import { AppShell } from "./app-shell";
import { ButtonLink } from "./ui/button";

export function AuthCallback() {
  const started = useRef(false);
  const [fromGoogle, setFromGoogle] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const flow = url.searchParams.get("flow");
    const isGoogle = flow === "google";
    setFromGoogle(isGoogle);
    window.history.replaceState(null, "", "/auth/callback/");

    async function complete() {
      if (!code && flow === "email-change" && url.searchParams.has("message")) {
        setMessage("Follow the remaining confirmation link to finish changing your email.");
        return;
      }
      if (!code) throw new Error("Missing confirmation code");

      const auth = getBrowserAuth();
      let isRecovery = false;
      const { data: { subscription } } = auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") isRecovery = true;
      });
      try {
        const { data, error } = await auth.exchangeCodeForSession(code);
        if (error || !data.session) throw new Error("Confirmation failed");

        if (isRecovery) {
          sessionStorage.setItem(recoveryMarker, data.session.user.id);
          window.location.replace("/reset-password/");
          return;
        }
        if (flow === "recovery") throw new Error("Invalid recovery flow");
        window.location.replace(postAuthPath());
      } finally {
        subscription.unsubscribe();
      }
    }

    void complete().catch(() => {
      setMessage(isGoogle
        ? "Google sign-in couldn’t be completed. Try again or use your email."
        : "This email link couldn’t be confirmed. Try again in the browser where you requested it.");
    });
  }, []);

  return (
    <AppShell activePage="account" variant="public">
      <section className="mx-auto my-12 max-w-lg rounded-2xl border border-border bg-panel p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">{fromGoogle ? "Google sign-in" : "Confirm your account"}</h1>
        <p className="mt-4 text-muted-foreground" role="status">
          {message || (fromGoogle ? "Completing sign-in…" : "Checking your email link…")}
        </p>
        {message && (
          <ButtonLink href={fromGoogle ? "/sign-in/" : "/account/"} className="mt-5">
            {fromGoogle ? "Back to sign in" : "Back to account"}
          </ButtonLink>
        )}
      </section>
    </AppShell>
  );
}
