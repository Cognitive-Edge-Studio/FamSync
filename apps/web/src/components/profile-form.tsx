"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getBrowserAuth, getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { Button } from "./ui/button";
import { Avatar } from "./ui/avatar";

const profileSchema = z.object({
  firstName: z.string().trim().max(80, "Use at most 80 characters."),
  lastName: z.string().trim().max(80, "Use at most 80 characters."),
  bio: z.string().trim().max(500, "Use at most 500 characters."),
});
type ProfileInput = z.infer<typeof profileSchema>;
const blankProfile = { firstName: "", lastName: "", bio: "" };

async function authHeaders() {
  const { data } = await getBrowserAuth().getSession();
  if (!data.session) throw new Error("Session unavailable");
  return { Authorization: "Bearer " + data.session.access_token };
}

export function ProfileForm({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setFormError] = useState("");
  const [note, setNote] = useState("");
  const { register, handleSubmit, reset, setError, watch, formState: { errors, isSubmitting } } =
    useForm<ProfileInput>({ defaultValues: blankProfile });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const headers = await authHeaders();
        const { data } = await getBrowserApi().GET("/api/v1/me/profile", { headers, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!data) throw new Error("Profile unavailable");
        reset({ firstName: data.firstName, lastName: data.lastName, bio: data.bio });
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load your profile. Refresh the page to try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reset]);

  async function submit(input: ProfileInput) {
    setFormError("");
    setNote("");
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      const fields = z.flattenError(parsed.error).fieldErrors;
      for (const key of ["firstName", "lastName", "bio"] as const) {
        if (fields[key]?.[0]) setError(key, { message: fields[key][0] });
      }
      return;
    }
    try {
      const headers = await authHeaders();
      const { data } = await getBrowserApi().PUT("/api/v1/me/profile", { headers, body: parsed.data });
      if (!data) throw new Error("Profile save failed");
      reset({ firstName: data.firstName, lastName: data.lastName, bio: data.bio });
      setNote("Profile saved.");
    } catch {
      setFormError("We couldn’t save your profile. Try again.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Avatar name={[watch("firstName"), watch("lastName")].filter(Boolean).join(" ") || "Family member"} colorKey={userId} size="lg" className="size-14" />
        <h2 className="text-lg font-semibold">Profile</h2>
      </div>
      {loading ? <p className="mt-4 text-muted-foreground" role="status">Loading your profile…</p> : loadError ? (
        <p className="mt-4 text-destructive" role="alert">{loadError}</p>
      ) : (
        <form className="mt-5 grid gap-4" noValidate onSubmit={handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="first-name" label="First name" error={errors.firstName?.message}>
              <input id="first-name" className={inputClass} autoComplete="given-name" maxLength={80}
                aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "first-name-error" : undefined}
                {...register("firstName")} />
            </Field>
            <Field id="last-name" label="Last name" error={errors.lastName?.message}>
              <input id="last-name" className={inputClass} autoComplete="family-name" maxLength={80}
                aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "last-name-error" : undefined}
                {...register("lastName")} />
            </Field>
          </div>
          <Field id="profile-bio" label="Bio" error={errors.bio?.message}>
            <textarea id="profile-bio" className={inputClass} rows={3} maxLength={500}
              aria-invalid={!!errors.bio} aria-describedby={errors.bio ? "profile-bio-error" : undefined}
              {...register("bio")} />
          </Field>
          <FormFeedback error={error} note={note} />
          <Button type="submit" className="h-9 justify-self-start px-4" disabled={isSubmitting}>Save profile</Button>
        </form>
      )}
    </section>
  );
}
