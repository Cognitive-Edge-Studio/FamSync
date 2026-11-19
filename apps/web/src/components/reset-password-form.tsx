"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { authMessage, getBrowserAuth, passwordInput, recoveryMarker } from "@/lib/browser-auth";
import { postAuthPath } from "@/lib/pending-invitation";
import { AppShell } from "./app-shell";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button, ButtonLink } from "./ui/button";

export function ResetPasswordForm() {
  const [ready, setReady] = useState<boolean>();
  const [formError, setFormError] = useState("");
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<{ password: string }>({ defaultValues: { password: "" } });

  useEffect(() => {
    async function verify() {
      const { data } = await getBrowserAuth().getSession();
      setReady(!!data.session && data.session.user.id === sessionStorage.getItem(recoveryMarker));
    }
    void verify().catch(() => setReady(false));
  }, []);

  async function submit({ password }: { password: string }) {
    setFormError("");
    const parsed = passwordInput.safeParse(password);
    if (!parsed.success) {
      setError("password", { message: parsed.error.issues[0].message }, { shouldFocus: true });
      return;
    }
    try {
      const auth = getBrowserAuth();
      const { data: { session } } = await auth.getSession();
      if (!session || session.user.id !== sessionStorage.getItem(recoveryMarker)) {
        setReady(false);
        return;
      }
      const { error } = await auth.updateUser({ password });
      if (error) return setFormError(authMessage(error));
      sessionStorage.removeItem(recoveryMarker);
      window.location.replace(postAuthPath());
    } catch {
      setFormError("We couldn’t update your password. Try again.");
    }
  }

  return (
    <AppShell activePage="account" variant="public">
      <section className="mx-auto my-12 max-w-md rounded-2xl border border-border bg-panel p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        {ready === undefined && <p className="mt-5 text-muted-foreground" role="status">Checking your reset link…</p>}
        {ready === false && (
          <>
            <p className="mt-5 text-muted-foreground">Open a password reset link to continue.</p>
            <ButtonLink href="/forgot-password/" className="mt-5">Send a new link</ButtonLink>
          </>
        )}
        {ready && (
          <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit(submit)}>
            <Field id="reset-password" label="New password" error={errors.password?.message}>
              <input id="reset-password" type="password" className={inputClass} autoComplete="new-password"
                aria-invalid={!!errors.password} aria-describedby={errors.password ? "reset-password-error" : undefined}
                {...register("password")} />
            </Field>
            <FormFeedback error={formError} />
            <Button type="submit" disabled={isSubmitting}>Save new password</Button>
          </form>
        )}
      </section>
    </AppShell>
  );
}
