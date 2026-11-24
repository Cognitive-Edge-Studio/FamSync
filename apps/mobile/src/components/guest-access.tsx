import type { components } from "@famsync/api-client";
import { randomUUID } from "expo-crypto";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { getApi, required } from "@/lib/api";
import { validEmail } from "@/lib/auth-rules";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { ErrorText, Field } from "./form";
import { confirm, queryState, StaleNotice } from "./screen";
import { Button, Card, Text } from "./ui";

type Entry = components["schemas"]["GuestEntryDto"];
const labels = { pending: "Pending", accepted: "Accepted", expired: "Expired", revoked: "Revoked", active: "Active" };

/** Guests of one channel, for its admins; or of the whole family, for its owner. */
export function GuestAccess({ familyId, channelId, owner = false }: { familyId: string; channelId?: string; owner?: boolean }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), [pages, setPages] = useState(1), [email, setEmail] = useState(""), [note, setNote] = useState(""), draft = useRef("");
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), path = { familyId }, policy = required(await api.GET("/api/v1/families/{familyId}/guest-policy", { params: { path }, signal })), entries: Entry[] = [];
    let cursor: string | undefined, next: string | null = null;
    for (let page = 0; page < pages; page += 1) { const result = required(await api.GET("/api/v1/families/{familyId}/guest-access", { params: { path, query: { channelId, cursor, limit: 20 } }, signal })); entries.push(...result.entries); next = result.nextCursor; if (!next) break; cursor = next; }
    return { policy, entries, next };
  }, [access_token, familyId, channelId, pages]);
  const query = useQuery(familyId, "guest-access:" + (channelId ?? ""), load), state = queryState(query, { loading: "Loading guests…", failed: "Guest access couldn’t load", lost: "You no longer manage guests here" });
  if (state || !query.data) return state;
  const { policy, entries, next } = query.data;
  const done = (text: string) => { setNote(text); query.refresh(); };
  async function setPolicy() {
    setNote("");
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/guest-policy", { params: { path: { familyId } }, body: { allowed: !policy.allowed, version: policy.version } }), "We couldn’t save the guest policy. Try again.");
    if (result.ok) done(result.data.allowed ? "Channel guests enabled. Channel managers can send invitations." : "Channel guests disabled. Guest access and pending invitations were revoked."); else if (result.conflict) query.refresh();
  }
  async function invite() {
    setNote("");
    if (!validEmail(email)) return setError("Enter a valid email address.");
    draft.current ||= randomUUID();
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/guest-invitations", { params: { path: { familyId, channelId: channelId! } }, body: { id: draft.current, email: email.trim() } }), "We couldn’t save the invitation. Your email entry is kept.");
    if (result.ok) { draft.current = ""; setEmail(""); done("Invitation saved. Email delivery appears in the list."); }
  }
  async function act(entry: Entry, resend: boolean) {
    setNote("");
    const api = getApi(access_token), path = { familyId, channelId: entry.channelId, invitationId: entry.id };
    const result = await save((): Promise<{ data?: unknown; error?: unknown; response: Response }> => resend ? api.POST("/api/v1/families/{familyId}/channels/{channelId}/guest-invitations/{invitationId}/resend", { params: { path } })
      : entry.kind === "invitation" ? api.DELETE("/api/v1/families/{familyId}/channels/{channelId}/guest-invitations/{invitationId}", { params: { path } })
      : api.DELETE("/api/v1/families/{familyId}/channels/{channelId}/guests/{userId}", { params: { path: { familyId, channelId: entry.channelId, userId: entry.id } } }), "We couldn’t update this guest access. Try again.");
    if (result.ok) done(resend ? "New invitation queued. The earlier link no longer works." : "Guest access revoked.");
  }
  return (
    <>
      <StaleNotice query={query} />
      <Card><Text muted size={13}>Guests take part only in the channels they were given. Family work and the member list stay hidden from them.</Text><Text weight="600">{"Guest invitations " + (policy.allowed ? "enabled" : "disabled")}</Text>
        {owner && <Button variant="outline" busy={busy} title={policy.allowed ? "Disable and revoke all guests" : "Enable channel guests"} onPress={() => policy.allowed ? confirm("Disable channel guests?", "All current guest access and pending channel invitations are revoked at once. Enabling again needs new invitations.", "Disable", () => void setPolicy()) : void setPolicy()} />}
        {channelId && !policy.allowed && <Text muted>Ask the family owner to enable channel guests.</Text>}
        {channelId && policy.allowed && <><Field label="Guest email" value={email} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { draft.current = ""; setEmail(value); }} /><Button title="Invite guest" busy={busy} onPress={() => void invite()} /></>}
        <ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}</Card>
      <Card>{entries.length === 0 && <Text muted>No guests or invitations yet.</Text>}{entries.map((entry) => { const open = entry.kind === "invitation" && ["pending", "expired"].includes(entry.status), active = entry.kind === "grant" && entry.status === "active"; return (
        <View key={entry.kind + entry.channelId + entry.id} style={{ gap: 6, paddingVertical: 6 }}><Text weight="600">{entry.email}</Text><Text muted size={13}>{entry.channelName + " · " + (entry.kind === "grant" ? "Guest access" : "Invitation") + " · " + labels[entry.status] + (entry.deliveryStatus && open ? " · Email " + entry.deliveryStatus : "") + (open && entry.expiresAt ? " · Expires " + new Date(entry.expiresAt).toLocaleDateString() : "")}</Text>
          {(open || active) && <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{channelId && open && <Button variant="outline" title="Resend" busy={busy} disabled={!policy.allowed} onPress={() => void act(entry, true)} />}<Button variant="outline" title="Revoke" busy={busy} onPress={() => confirm(active ? "Revoke guest access?" : "Revoke this invitation?", active ? entry.email + " loses access to " + entry.channelName + " at once." : "Its link stops working.", "Revoke", () => void act(entry, false))} /></View>}</View>); })}</Card>
      {next && <Button variant="outline" title="Load more" busy={query.loading} onPress={() => setPages(pages + 1)} />}
    </>
  );
}
