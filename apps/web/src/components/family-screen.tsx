"use client";

import type { components } from "@famsync/api-client";
import { ArrowLeft, MailPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { FamilyMembers, FamilySettings } from "./family-management";
import { familyError, FamilyLayout, familyPath, FamilySession } from "./family-session";
import { Button, ButtonLink } from "./ui/button";
import { PageHeader } from "./ui/page-header";
import {GuestAccessPanel} from './guest-access-panel';

type Family = components["schemas"]["FamilyDto"];
type Invitation = components["schemas"]["InvitationDto"];
const expiryDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function Invitations({ familyId, accessToken }: { familyId: string; accessToken: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>();
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const { register, handleSubmit, reset } = useForm<{ email: string }>({ defaultValues: { email: "" } });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadError("");
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/invitations",
          { params: { path: { familyId } }, signal: controller.signal });
        if (!data) throw new Error("Invitations unavailable");
        if (!controller.signal.aborted) setInvitations(data);
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load invitations. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, reload]);

  function saveInvitation(invitation: Invitation) {
    setInvitations((current) => {
      const list = current ?? [];
      if (!list.some(({ id }) => id === invitation.id)) return [invitation, ...list];
      return list.map((item) => item.id === invitation.id ? invitation : item);
    });
  }

  function reportDelivery(invitation: Invitation) {
    if (invitation.deliveryStatus === "failed") {
      setError("The invitation was saved, but the email couldn’t be sent. Use Resend to try again.");
    } else if (invitation.deliveryStatus === "sent") {
      setNote("Invitation email sent.");
    } else {
      setNote("Invitation saved. The email is on its way. If it can’t be sent, this list will show it with a Resend option.");
    }
  }

  async function send({ email }: { email: string }) {
    setBusy(true);
    setError("");
    setNote("");
    const fallback = "We couldn’t send the invitation. Try again.";
    try {
      const result = await getBrowserApi(accessToken).POST("/api/v1/families/{familyId}/invitations", {
        params: { path: { familyId } }, body: { email },
      });
      if (result.data) {
        saveInvitation(result.data);
        reportDelivery(result.data);
        reset();
      } else {
        const showMessage = [400, 409].includes(result.response.status);
        setError(familyError(showMessage ? result.error : undefined, fallback));
      }
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  async function change(invitationId: string, action: "resend" | "revoke") {
    setBusy(true);
    setError("");
    setNote("");
    const fallback = "We couldn’t " + action + " the invitation. Try again.";
    try {
      const api = getBrowserApi(accessToken);
      const params = { path: { familyId, invitationId } };
      const result = action === "resend"
        ? await api.POST("/api/v1/families/{familyId}/invitations/{invitationId}/resend", { params })
        : await api.DELETE("/api/v1/families/{familyId}/invitations/{invitationId}", { params });
      if (result.data) {
        saveInvitation(result.data);
        if (action === "resend") reportDelivery(result.data);
        else setNote("Invitation revoked.");
      } else {
        setError(familyError(result.response.status === 404 ? result.error : undefined, fallback));
        if (result.response.status === 404) setReload((value) => value + 1);
      }
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Family invitations</h2>
      <form className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmit(send)}>
        <Field label="Email address" id="invite-email">
          <input className={inputClass} id="invite-email" type="email" autoComplete="email" maxLength={254}
            required {...register("email")} />
        </Field>
        <Button className="h-9 px-4" type="submit" disabled={busy || !invitations}>
          <MailPlus aria-hidden="true" />Send invitation
        </Button>
      </form>
      <div className="mt-4 space-y-2">
        <FormFeedback error={error} note={note} />
        {loadError && (
          <div className="flex flex-wrap items-center gap-3">
            <FormFeedback error={loadError} />
            <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Try again</Button>
          </div>
        )}
        {!invitations && !loadError && <FormFeedback note="Loading invitations…" />}
        {invitations?.length === 0 && <p className="text-sm text-muted-foreground">No invitations yet.</p>}
        {!!invitations?.length && (
          <ul className="divide-y divide-border" aria-label="Invitations">
            {invitations.map((invitation) => {
              const open = invitation.status === "pending" || invitation.status === "expired";
              return (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={invitation.id}>
                  <div className="min-w-0">
                    <p className="wrap-anywhere font-medium">{invitation.email}</p>
                    <div className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                      <span className="capitalize">{invitation.status}</span>
                      {invitation.status === "pending" && <span>Expires {expiryDate.format(new Date(invitation.expiresAt))}</span>}
                      {open && invitation.deliveryStatus === "failed" && <span className="text-destructive">Email failed</span>}
                      {open && invitation.deliveryStatus === "pending" && <span>Sending email</span>}
                    </div>
                  </div>
                  {open && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="h-9" disabled={busy} onClick={() => void change(invitation.id, "resend")}>
                        Resend
                      </Button>
                      <Button variant="ghost" className="h-9 text-destructive" disabled={busy}
                        onClick={() => void change(invitation.id, "revoke")}>Revoke</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Workspace({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [family, setFamily] = useState<Family>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const [reload, setReload] = useState(0);
  const [invitationRevision, setInvitationRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      let familyId = new URL(window.location.href).searchParams.get("id");
      try {
        // The sidebar's Family link carries no id: open the family the person was just viewing, or their first family.
        if (!familyId) {
          const { data: families } = await getBrowserApi(accessToken).GET("/api/v1/families", { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!families) throw new Error("Families unavailable");
          const wanted = new URL(window.location.href).searchParams.get("family");
          const chosen = families.find(({ id }) => id === wanted) ?? families[0];
          if (!chosen) { window.location.replace("/families/"); return; }
          familyId = chosen.id;
          window.history.replaceState(window.history.state, "", familyPath(familyId));
        }
        const { data, response } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}", {
          params: { path: { familyId } }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (data) {
          setFamily(data);
          return;
        }
        if (response.status === 404 || response.status === 400) {
          setFamily(undefined);
          setRetry(false);
          setError("Family workspace not found.");
          return;
        }
        throw new Error("Workspace unavailable");
      } catch {
        if (!controller.signal.aborted) {
          setRetry(true);
          setError("We couldn’t load this workspace. Try again.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, reload]);

  if (error) return (
    <div className="flex flex-wrap items-center gap-3">
      <FormFeedback error={error} />
      {retry && <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Try again</Button>}
    </div>
  );
  if (!family) return <FormFeedback note="Loading your family workspace…" />;
  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title={family.name}
        description={<>{family.role === "owner" ? "Owner" : "Member"} <span aria-hidden="true">·</span> {family.timeZone}</>}
        actions={<ButtonLink href="/families/" variant="outline">All families</ButtonLink>} />
      <FamilyMembers family={family} accessToken={accessToken} userId={userId}
        onFamilyChange={({ role }) => setFamily((current) => current && { ...current, role })}
        onMemberRemoved={() => setInvitationRevision((value) => value + 1)} />
      {family.role === "owner" && (
        <>
          <FamilySettings family={family} accessToken={accessToken}
            onFamilyChange={({ name, timeZone }) => setFamily((current) => current && { ...current, name, timeZone })} />
          <Invitations key={invitationRevision} familyId={family.id} accessToken={accessToken} />
          <GuestAccessPanel owner familyId={family.id} accessToken={accessToken}/>
        </>
      )}
    </div>
  );
}

export function FamilyScreen() {
  return (
    <FamilyLayout>
      <FamilySession>
        {(session) => <Workspace key={session.user.id} userId={session.user.id} accessToken={session.access_token} />}
      </FamilySession>
    </FamilyLayout>
  );
}
