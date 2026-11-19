"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { components } from "@famsync/api-client";
import { Settings } from "lucide-react";
import { Avatar } from "./ui/avatar";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { getBrowserApi } from "@/lib/browser-auth";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Family = components["schemas"]["FamilyDto"];
type FamilyInput = components["schemas"]["FamilyInputDto"];
type Member = components["schemas"]["FamilyMemberDto"];
type Change = { kind: "remove" | "transfer"; member: Member };

type ManageFamilyProps = {
  family: Family;
  accessToken: string;
  onFamilyChange: (family: Family) => void;
};

function displayName(member: Member, showEmail: boolean) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ")
    || (showEmail ? member.email : null)
    || "Family member";
}

export function FamilySettings({ family, accessToken, onFamilyChange }: ManageFamilyProps) {
  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<FamilyInput>({
    defaultValues: { name: family.name, timeZone: family.timeZone },
  });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function save(body: FamilyInput) {
    const fallback = "We couldn’t update your family settings. Try again.";
    setError("");
    setNote("");
    try {
      const { data, error, response } = await getBrowserApi(accessToken).PUT("/api/v1/families/{familyId}/settings", {
        params: { path: { familyId: family.id } }, body,
      });
      if (!data) {
        setError(familyError([400, 403, 404].includes(response.status) ? error : undefined, fallback));
        return;
      }
      reset({ name: data.name, timeZone: data.timeZone });
      onFamilyChange(data);
      setNote("Family settings saved.");
    } catch {
      setError(fallback);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Settings className="size-5 text-primary" aria-hidden="true" />Family settings
      </h2>
      <form className="mt-4 grid gap-4" onSubmit={handleSubmit(save)}>
        <fieldset className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" disabled={isSubmitting}>
          <Field label="Family name" id="edit-family-name">
            <input id="edit-family-name" className={inputClass} required maxLength={100} {...register("name")} />
          </Field>
          <Field label="Time zone" id="edit-family-time-zone">
            <input id="edit-family-time-zone" className={inputClass} required maxLength={100} {...register("timeZone")} />
          </Field>
        </fieldset>
        <FormFeedback error={error} note={note} />
        <Button type="submit" className="h-9 justify-self-start px-4" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </section>
  );
}

export function FamilyMembers({
  family, accessToken, userId, onFamilyChange, onMemberRemoved,
}: ManageFamilyProps & { userId: string; onMemberRemoved: () => void }) {
  const [members, setMembers] = useState<Member[]>();
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [change, setChange] = useState<Change>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const owner = family.role === "owner";
  const familyId = family.id;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadError("");
      try {
        const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/members", {
          params: { path: { familyId } }, signal: controller.signal,
        });
        if (!data) throw new Error("Members unavailable");
        if (!controller.signal.aborted) setMembers(data);
      } catch {
        if (!controller.signal.aborted) {
          setMembers(undefined);
          setLoadError("We couldn’t load family members. Try again.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, owner, reload]);

  function requestChange(kind: Change["kind"], member: Member, trigger: HTMLButtonElement) {
    actionButton.current = trigger;
    setError("");
    setNote("");
    setChange({ kind, member });
  }

  async function confirmChange() {
    if (!change) return;
    setBusy(true);
    setError("");
    const { kind, member } = change;
    const params = { path: { familyId, memberId: member.userId } };
    const fallback = kind === "transfer" ? "We couldn’t transfer ownership. Try again." : "We couldn’t remove this member. Try again.";
    try {
      const api = getBrowserApi(accessToken);
      if (kind === "transfer") {
        const { data, error, response } = await api.POST(
          "/api/v1/families/{familyId}/members/{memberId}/transfer-ownership", { params },
        );
        if (!data) {
          setError(familyError([400, 403, 404].includes(response.status) ? error : undefined, fallback));
          return;
        }
        setMembers((list) => list?.map<Member>((item) => ({
          ...item, email: null, role: item.userId === member.userId ? "owner" : "member",
        })).sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner")));
        onFamilyChange(data);
        setNote("Ownership transferred.");
      } else {
        const { error, response } = await api.DELETE("/api/v1/families/{familyId}/members/{memberId}", { params });
        if (!response.ok) {
          setError(familyError([400, 403, 404].includes(response.status) ? error : undefined, fallback));
          return;
        }
        setMembers((list) => list?.filter((item) => item.userId !== member.userId));
        onMemberRemoved();
        setNote("Member removed.");
      }
      actionButton.current = null;
      setChange(undefined);
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  const transferring = change?.kind === "transfer";
  const selectedName = change ? displayName(change.member, owner) : "";

  return (
    <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">Family members</h2>
      </div>
      <div className="mt-3 space-y-2">
        <FormFeedback note={note} error={loadError} />
        {loadError && <Button variant="outline" onClick={() => setReload((count) => count + 1)}>Try again</Button>}
        {!members && !loadError && <FormFeedback note="Loading family members…" />}
        {members && (
          <ul className="divide-y divide-border" aria-label="Family members">
            {members.map((member) => {
              const name = displayName(member, owner);
              return (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={member.userId}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={name} colorKey={member.userId} className="size-9" />
                    <div className="min-w-0">
                      <p className="wrap-anywhere text-sm font-semibold">{name}{member.userId === userId && " (you)"}</p>
                      <p className="wrap-anywhere text-sm text-muted-foreground">
                        {member.role === "owner" ? "Owner" : "Member"}
                        {owner && member.email && member.email !== name && " · " + member.email}
                      </p>
                    </div>
                  </div>
                  {owner && member.role === "member" && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="h-9" aria-label={"Transfer ownership to " + name}
                        onClick={(event) => requestChange("transfer", member, event.currentTarget)}>
                        Transfer ownership
                      </Button>
                      <Button variant="ghost" className="h-9 text-destructive" aria-label={"Remove " + name}
                        onClick={(event) => requestChange("remove", member, event.currentTarget)}>Remove</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AlertDialog.Root open={!!change} onOpenChange={(open) => { if (!open && !busy) setChange(undefined); }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <AlertDialog.Popup initialFocus={cancelButton} finalFocus={() => actionButton.current ?? heading.current}
            className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 gap-4 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
            <AlertDialog.Title className="text-xl font-semibold">
              {transferring ? "Transfer ownership?" : "Remove family member?"}
            </AlertDialog.Title>
            <AlertDialog.Description className="wrap-anywhere text-sm text-muted-foreground">
              {transferring
                ? selectedName + " will become the owner. You’ll stay in the family as a member."
                : selectedName + " will lose access to this family."}
            </AlertDialog.Description>
            <FormFeedback error={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Close render={<Button ref={cancelButton} variant="outline" className="h-9 px-4" disabled={busy} />}>
                Cancel
              </AlertDialog.Close>
              <Button variant={transferring ? "default" : "destructive"} className="h-9 px-4" disabled={busy}
                onClick={() => void confirmChange()}>
                {busy ? "Saving…" : transferring ? "Transfer ownership" : "Remove member"}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
