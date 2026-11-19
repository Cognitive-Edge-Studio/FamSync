"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { authMessage, callbackUrl, emailInput, getBrowserAuth, passwordInput } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";

export function AccountSecurityForm({ kind, email }: { kind: "email" | "password"; email: string }) {
  const changeEmail = kind === "email";
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<{
    currentPassword: string;
    newValue: string;
  }>({ defaultValues: { currentPassword: "", newValue: "" } });
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");

  async function submit(input: { currentPassword: string; newValue: string }) {
    setFormError("");
    setNote("");
    if (!input.currentPassword) {
      setError("currentPassword", { message: "Enter your current password." }, { shouldFocus: true });
      return;
    }
    const parsed = (changeEmail ? emailInput : passwordInput).safeParse(input.newValue);
    if (!parsed.success) {
      setError("newValue", { message: parsed.error.issues[0].message }, { shouldFocus: true });
      return;
    }
    try {
      const auth = getBrowserAuth();
      const login = await auth.signInWithPassword({ email, password: input.currentPassword });
      if (login.error) {
        setFormError(authMessage(login.error));
        return;
      }
      const result = changeEmail
        ? await auth.updateUser({ email: parsed.data }, { emailRedirectTo: callbackUrl("email-change") })
        : await auth.updateUser({ password: parsed.data });
      if (result.error) {
        setFormError(authMessage(result.error));
        return;
      }
      reset();
      setNote(changeEmail ? "Check your current and new inboxes for confirmation links." : "Password updated.");
    } catch {
      setFormError("We couldn’t update your account. Try again.");
    }
  }

  const currentId = kind + "-current-password";
  const newId = kind + "-new-value";

  return (
    <details className="border-t border-border py-4">
      <summary className="cursor-pointer rounded-md font-semibold">Change {kind}</summary>
      <form className="mt-4 grid max-w-md gap-4" noValidate onSubmit={handleSubmit(submit)}>
        <Field id={currentId} label="Current password" error={errors.currentPassword?.message}>
          <input id={currentId} type="password" className={inputClass} autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? currentId + "-error" : undefined}
            {...register("currentPassword")} />
        </Field>
        <Field id={newId} label={changeEmail ? "New email" : "New password"} error={errors.newValue?.message}>
          <input id={newId} type={changeEmail ? "email" : "password"} className={inputClass}
            autoComplete={changeEmail ? "email" : "new-password"} aria-invalid={!!errors.newValue}
            aria-describedby={errors.newValue ? newId + "-error" : undefined}
            {...register("newValue")} />
        </Field>
        <FormFeedback error={formError} note={note} />
        <Button type="submit" variant="outline" className="h-9 justify-self-start px-4" disabled={isSubmitting}>
          {changeEmail ? "Send confirmation links" : "Update password"}
        </Button>
      </form>
    </details>
  );
}
