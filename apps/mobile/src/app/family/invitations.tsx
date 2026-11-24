import type { components } from "@famsync/api-client";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ErrorText, Field } from "@/components/form";
import { confirm, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Notice, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { validEmail } from "@/lib/auth-rules";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Invitation = components["schemas"]["InvitationDto"];
const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), labels = { pending: "Pending", accepted: "Accepted", expired: "Expired", revoked: "Revoked" };
export default function Invitations() { return <><Stack.Screen options={{ title: "Invitations" }} /><WithFamily>{(family) => family.role === "owner" ? <Body key={family.id} family={family} /> : <Notice icon="lock-closed-outline" title="Only the owner can invite" action={{ title: "Go back", onPress: () => router.back() }} />}</WithFamily></>; }
function Body({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), [email, setEmail] = useState(""), [note, setNote] = useState(""), path = { familyId: family.id };
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/invitations", { params: { path: { familyId: family.id } }, signal }).then(required), [access_token, family.id]);
  const query = useQuery(family.id, "invitations", load), state = queryState(query, { loading: "Loading invitations…", failed: "Invitations couldn’t load", lost: "You no longer manage this family" });
  if (state || !query.data) return state;
  const keep = (item: Invitation) => query.replace((list) => list.some((old) => old.id === item.id) ? list.map((old) => old.id === item.id ? item : old) : [item, ...list]);
  const delivery = (item: Invitation) => { if (item.deliveryStatus === "failed") setError("The invitation was saved, but the email couldn’t be sent. Use Resend to try again."); else setNote(item.deliveryStatus === "sent" ? "Invitation email sent." : "Invitation saved. The email is on its way."); };
  async function send() {
    setNote("");
    if (!validEmail(email)) return setError("Enter a valid email address.");
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/invitations", { params: { path }, body: { email: email.trim() } }), "We couldn’t send the invitation. Try again.");
    if (result.ok) { keep(result.data); setEmail(""); delivery(result.data); }
  }
  async function change(item: Invitation, resend: boolean) {
    setNote("");
    const api = getApi(access_token), params = { path: { ...path, invitationId: item.id } };
    const result = await save(() => resend ? api.POST("/api/v1/families/{familyId}/invitations/{invitationId}/resend", { params }) : api.DELETE("/api/v1/families/{familyId}/invitations/{invitationId}", { params }), "We couldn’t update the invitation. Try again.");
    if (result.ok) { keep(result.data); if (resend) delivery(result.data); else setNote("Invitation revoked."); } else if (result.gone) query.refresh();
  }
  return (
    <Page query={query}>
      <Card><Field label="Email address" value={email} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onChangeText={setEmail} /><ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}<Button title="Send invitation" busy={busy} onPress={() => void send()} /></Card>
      <Card>{query.data.length === 0 && <Text muted>No invitations yet.</Text>}{query.data.map((item) => { const open = item.status === "pending" || item.status === "expired"; return (
        <View key={item.id} style={{ gap: 6, paddingVertical: 6 }}><Text weight="600">{item.email}</Text><Text muted size={13}>{labels[item.status] + (item.status === "pending" ? " · Expires " + day.format(new Date(item.expiresAt)) : "") + (open && item.deliveryStatus === "failed" ? " · Email failed" : open && item.deliveryStatus === "pending" ? " · Sending email" : "")}</Text>
          {open && <View style={{ flexDirection: "row", gap: 8 }}><Button variant="outline" title="Resend" busy={busy} onPress={() => void change(item, true)} /><Button variant="outline" title="Revoke" busy={busy} onPress={() => confirm("Revoke this invitation?", "Its link stops working. You can invite " + item.email + " again.", "Revoke", () => void change(item, false))} /></View>}</View>); })}</Card>
    </Page>
  );
}
