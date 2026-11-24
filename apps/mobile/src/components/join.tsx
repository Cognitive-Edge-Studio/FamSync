import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { getApi } from "@/lib/api";
import { invitationToken, type InvitationKind } from "@/lib/auth-rules";
import { useFamilyState } from "@/lib/family";
import { forgetInvitation, keepInvitation, pendingInvitation } from "@/lib/invitations";
import { useSave } from "@/lib/save";
import { useSession, useSignedIn } from "@/lib/session";
import { AuthPage } from "./auth-form";
import { ErrorText } from "./form";
import { Button, Loading, Text } from "./ui";

/** An invitation is accepted only when the person chooses to, never by opening its link. */
export function Join({ kind }: { kind: InvitationKind }) {
  const params = useLocalSearchParams<{ token?: string; "#"?: string }>(), { state } = useSession();
  const given = invitationToken(params), [token, setToken] = useState<string | null | undefined>(given);
  useEffect(() => {
    let stopped = false;
    if (given) { setToken(given); void keepInvitation(kind, given); return; }
    if (given === null) { setToken(null); return; }
    void pendingInvitation().then((saved) => { if (!stopped) setToken(saved?.kind === kind ? saved.token : null); });
    return () => { stopped = true; };
  }, [given, kind]);
  const leave = () => { void forgetInvitation().then(() => router.replace("/")); };
  const title = kind === "family" ? "Join a family" : "Join a channel", note = kind === "family" ? undefined : "This invitation gives access to one channel of another family.";
  return (
    <AuthPage title={title} note={note}>
      {token === undefined || state.status === "loading" ? <Loading label="Opening your invitation…" />
        : token === null ? <Text>Open the link from a current invitation email to continue.</Text>
        : state.status === "signedIn" ? <Accept key={token} kind={kind} token={token} />
        : <><Text>Use the email address that received this invitation.</Text><Button title="Sign in" onPress={() => router.push("/sign-in")} /><Button variant="outline" title="Create an account" onPress={() => router.push("/sign-up")} /></>}
      <Button variant="outline" title={token ? "Leave invitation" : "Continue"} onPress={leave} />
    </AuthPage>
  );
}

function Accept({ kind, token }: { kind: InvitationKind; token: string }) {
  const { access_token, user } = useSignedIn(), { reload } = useFamilyState(), { busy, error, setError, save } = useSave(), { signOut } = useSession();
  async function accept() {
    const api = getApi(access_token);
    if (kind === "family") {
      const result = await save(() => api.POST("/api/v1/invitations/accept", { body: { token } }), "We couldn’t accept your invitation. Try again in a moment.");
      // The invitation stays until it is accepted or left, so the reason can be put right.
      if (!result.ok) { if (result.gone) setError("This invitation is unavailable for your account. It may have expired, or it was sent to another email address."); return; }
      await forgetInvitation();
      reload();
      router.replace("/today");
      return;
    }
    const result = await save(() => api.POST("/api/v1/guest-invitations/accept", { body: { token } }), "We couldn’t accept this invitation. Try again.");
    if (!result.ok) return;
    await forgetInvitation();
    router.replace("/guests");
    router.push({ pathname: "/chat/[id]", params: { id: result.data.channelId, family: result.data.familyId } });
  }
  return <><Text>{"Signed in as " + user.email}</Text><ErrorText>{error}</ErrorText><Button title="Accept invitation" busy={busy} onPress={() => void accept()} /><Button variant="outline" title="Use another account" disabled={busy} onPress={() => void signOut()} /></>;
}
