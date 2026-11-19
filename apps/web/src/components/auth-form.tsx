"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { getBrowserAuth, authMessage, callbackUrl, emailInput, isGoogleSignInEnabled, passwordInput } from "@/lib/browser-auth";
import { postAuthPath } from "@/lib/pending-invitation";
import { AppShell } from "./app-shell";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";

type Mode = "sign-in" | "sign-up" | "recovery";

const text = {
  "sign-in": { title: "Sign in", action: "Sign in" },
  "sign-up": { title: "Create your account", action: "Create account" },
  recovery: { title: "Reset your password", action: "Send reset link" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<{ email: string; password: string }>({ defaultValues: { email: "", password: "" } });
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const needsPassword = mode !== "recovery";

  useEffect(() => {
    if (!needsPassword) return;
    const controller = new AbortController();
    void isGoogleSignInEnabled(controller.signal).then((enabled) => {
      if (!controller.signal.aborted) setGoogleEnabled(enabled);
    }).catch(() => {
      if (!controller.signal.aborted) setGoogleEnabled(false);
    });
    return () => controller.abort();
  }, [needsPassword]);

  async function signInWithGoogle() {
    setGoogleSubmitting(true);
    setGoogleError("");
    setFormError("");
    setNote("");
    try {
      const { error } = await getBrowserAuth().signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl("google") },
      });
      if (error) throw error;
    } catch {
      setGoogleError("Google sign-in couldn’t start. Try again or use your email.");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function submit({ email, password }: { email: string; password: string }) {
    setFormError("");
    setNote("");
    setGoogleError("");
    const parsedEmail = emailInput.safeParse(email);
    if (!parsedEmail.success) {
      setError("email", { message: parsedEmail.error.issues[0].message }, { shouldFocus: true });
      return;
    }
    if (needsPassword && !password) {
      setError("password", { message: "Enter your password." }, { shouldFocus: true });
      return;
    }
    if (mode === "sign-up") {
      const parsedPassword = passwordInput.safeParse(password);
      if (!parsedPassword.success) {
        setError("password", { message: parsedPassword.error.issues[0].message }, { shouldFocus: true });
        return;
      }
    }

    try {
      const auth = getBrowserAuth();
      if (mode === "recovery") {
        const { error } = await auth.resetPasswordForEmail(parsedEmail.data, { redirectTo: callbackUrl("recovery") });
        if (error) setFormError(authMessage(error));
        else setNote("If that address has an account, you’ll receive a reset link. Open it in this browser.");
        return;
      }
      if (mode === "sign-up") {
        const { data, error } = await auth.signUp({
          email: parsedEmail.data, password, options: { emailRedirectTo: callbackUrl("signup") },
        });
        if (error) return setFormError(authMessage(error));
        if (!data.session) {
          setNote("Check your email for a confirmation link. Open it in this browser.");
          return;
        }
      } else {
        const { error } = await auth.signInWithPassword({ email: parsedEmail.data, password });
        if (error) return setFormError(authMessage(error));
      }
      window.location.assign(postAuthPath());
    } catch {
      setFormError("Sign-in is temporarily unavailable. Try again in a moment.");
    }
  }

  return (
    <AppShell activePage="account" variant="public">
      <div className="mx-auto my-8 grid max-w-4xl overflow-hidden rounded-2xl border border-border bg-panel shadow-sm sm:my-14 lg:grid-cols-2">
        <div className="hidden flex-col justify-between gap-6 bg-muted p-8 lg:flex">
          <div><p className="text-lg font-semibold">Plan the day together.</p>
            <p className="mt-1 text-sm text-muted-foreground">One calm place for your family’s schedule, tasks, goals and conversations.</p></div>
          <img data-dim src="/illustrations/family-planning.svg" alt="" className="w-full" />
        </div>
        <div className="p-6 sm:p-10">
        <h1 className="text-xl font-semibold">{text[mode].title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "sign-in" ? "Welcome back to your family workspace." : mode === "sign-up" ? "Create an account to start or join a family." : "We’ll email you a link to choose a new password."}</p>
        <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit(submit)}>
          <Field id="email" label="Email" error={errors.email?.message}>
            <input className={inputClass} id="email" type="email" autoComplete="email" aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
          </Field>
          {needsPassword && (
            <Field id="password" label="Password" error={errors.password?.message}>
              <input className={inputClass} id="password" type="password" aria-invalid={!!errors.password}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
            </Field>
          )}
          <FormFeedback error={formError} note={note} />
          <Button type="submit" size="lg" disabled={isSubmitting || googleSubmitting}>
            {isSubmitting ? "Please wait…" : text[mode].action}
          </Button>
        </form>
        {needsPassword && googleEnabled && (
          <div className="mt-5 grid justify-items-center gap-3">
            <div className="flex w-full items-center gap-3 text-sm text-muted-foreground">
              <span className="h-px grow bg-border" />or<span className="h-px grow bg-border" />
            </div>
            <Button type="button" variant="ghost" aria-label="Sign in with Google" aria-busy={googleSubmitting}
              className="h-9 bg-transparent p-0 hover:bg-transparent"
              disabled={isSubmitting || googleSubmitting} onClick={() => void signInWithGoogle()}>
              <Image src="/google-sign-in.png" width={180} height={40} alt="" unoptimized />
            </Button>
            <FormFeedback error={googleError} />
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
          {mode === "sign-in" ? (
            <>
              <a className="underline underline-offset-4" href="/sign-up/">Create an account</a>
              <a className="underline underline-offset-4" href="/forgot-password/">Forgot password?</a>
            </>
          ) : (
            <a className="underline underline-offset-4" href="/sign-in/">Back to sign in</a>
          )}
        </div>
        </div>
      </div>
    </AppShell>
  );
}
