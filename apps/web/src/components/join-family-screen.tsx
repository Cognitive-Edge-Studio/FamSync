"use client";
import { ModuleIcon } from "./ui/module-icon";


import { useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { capturePendingInvitation, clearPendingInvitation } from "@/lib/pending-invitation";
import { OpenInApp } from "./open-in-app";
import { FormFeedback } from "./account-fields";
import { familyError, FamilyLayout, familyPath, FamilySession } from "./family-session";
import { Users } from "lucide-react";
import { Button, ButtonLink } from "./ui/button";

function AcceptInvitation({ token, accessToken, email }: { token: string; accessToken: string; email?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const { data, error: problem, response } = await getBrowserApi(accessToken).POST("/api/v1/invitations/accept", { body: { token } });
      if (data) {
        clearPendingInvitation();
        window.location.replace(familyPath(data.id));
        return;
      }
      if (response.status === 409) {
        setError(familyError(problem, "Your account already belongs to a family."));
        return;
      }
      if (response.status === 404) {
        setError("This invitation is unavailable for your account. Check that you’re signed in with the invited email address.");
        return;
      }
      throw new Error("Invitation acceptance failed");
    } catch {
      setError("We couldn’t accept your invitation. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {email && <p className="wrap-anywhere text-muted-foreground">Signed in as {email}</p>}
      <FormFeedback error={error} />
      <div className="flex flex-wrap gap-3">
        <Button className="h-9 px-4" disabled={busy} onClick={() => void accept()}>
          {busy ? "Joining…" : "Accept invitation"}
        </Button>
        <ButtonLink className="h-9 px-4" href="/account/" variant="outline">Manage account</ButtonLink>
      </div>
    </div>
  );
}

export function JoinFamilyScreen() {
  const [token, setToken] = useState<string | null>();

  useEffect(() => {
    function capture() {
      setToken(capturePendingInvitation());
    }
    capture();
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, []);

  return (
    <FamilyLayout>
      <section className="mx-auto mt-8 max-w-lg space-y-4 rounded-2xl border border-border bg-panel p-6 shadow-sm sm:mt-14 sm:p-8">
        <span className="grid size-11 place-items-center rounded-full bg-sage text-sage-foreground"><ModuleIcon name="families" className="size-5" /></span>
        <h1 className="text-xl font-semibold">Join a family</h1>
        {token === undefined && <FormFeedback note="Loading your invitation…" />}
        {token === null && <FormFeedback note="Open the link from your invitation email to continue." />}
        {token && (
          <FamilySession forInvitation>
            {(session) => <AcceptInvitation key={session.user.id} token={token} accessToken={session.access_token}
              email={session.user.email} />}
          </FamilySession>
        )}
        {token && <OpenInApp kind="join" token={token} />}
        {token !== undefined && (
          <a className="inline-block text-sm font-medium underline underline-offset-4" href="/families/"
            onClick={clearPendingInvitation}>{token ? "Leave invitation" : "Back to your family"}</a>
        )}
      </section>
    </FamilyLayout>
  );
}
