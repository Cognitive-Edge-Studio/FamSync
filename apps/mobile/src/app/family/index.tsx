import type { components } from "@famsync/api-client";
import { memberName } from "@famsync/core/forms";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ErrorText, Sheet } from "@/components/form";
import { Avatar } from "@/components/message";
import { Badge, confirm, LinkRow, MenuItem, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useFamilyState, type Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Member = components["schemas"]["FamilyMemberDto"];
export default function FamilyScreen() { return <><Stack.Screen options={{ title: "Family" }} /><WithFamily>{(family, onLost) => <Body key={family.id} family={family} onLost={onLost} />}</WithFamily></>; }
function Body({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token, user } = useSignedIn(), { replace } = useFamilyState(), { busy, error, save } = useSave(), [member, setMember] = useState<Member>(), [note, setNote] = useState(""), owner = family.role === "owner";
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), path = { familyId: family.id };
    const [members, current] = await Promise.all([api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal }).then(required), api.GET("/api/v1/families/{familyId}", { params: { path }, signal }).then(required)]);
    // The role may have changed on another device.
    if (!signal.aborted && (current.role !== family.role || current.name !== family.name || current.timeZone !== family.timeZone)) replace(current);
    return members;
  }, [access_token, family, replace]);
  const query = useQuery(family.id, "members", load), state = queryState(query, { loading: "Loading your family…", failed: "Family members couldn’t load", lost: "You no longer have access" }, onLost);
  if (state || !query.data) return state;
  function change(kind: "remove" | "transfer", person: Member) {
    const name = memberName(person), path = { familyId: family.id, memberId: person.userId };
    setMember(undefined); setNote("");
    confirm(kind === "transfer" ? "Transfer ownership?" : "Remove " + name + "?", kind === "transfer" ? name + " becomes the owner and controls settings, invitations and members. You stay in the family as a member. Only " + name + " can give it back." : name + " loses access to this family, its chats and files. An owner can invite them again.", kind === "transfer" ? "Transfer" : "Remove", () => void (async () => {
      const api = getApi(access_token);
      if (kind === "transfer") {
        const result = await save(() => api.POST("/api/v1/families/{familyId}/members/{memberId}/transfer-ownership", { params: { path } }), "We couldn’t transfer ownership. Try again.");
        if (result.ok) { replace(result.data); setNote("Ownership transferred."); }
      } else {
        const result = await save(async () => { const { error: problem, response } = await api.DELETE("/api/v1/families/{familyId}/members/{memberId}", { params: { path } }); return response.ok ? { data: true, response } : { error: problem, response }; }, "We couldn’t remove this member. Try again.");
        if (result.ok) setNote("Member removed.");
      }
      query.refresh();
    })());
  }
  return (
    <Page query={query}>
      {note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}<ErrorText>{error}</ErrorText>
      <Card><Text size={20} weight="600" accessibilityRole="header">{family.name}</Text><Text muted>{(owner ? "Owner" : "Member") + " · " + family.timeZone}</Text></Card>
      {owner && <Card style={{ paddingVertical: 6 }}><LinkRow icon="settings-outline" title="Family settings" onPress={() => router.push("/family/settings")} /><LinkRow icon="mail-outline" title="Invitations" onPress={() => router.push("/family/invitations")} /><LinkRow icon="person-add-outline" title="Channel guests" onPress={() => router.push("/family/guests")} /></Card>}
      <Card><Text size={17} weight="600" accessibilityRole="header">{"Members (" + query.data.length + ")"}</Text>
        {query.data.map((person) => <View key={person.userId} style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 52 }}><Avatar name={memberName(person)} id={person.userId} /><View style={{ flex: 1 }}><Text>{memberName(person) + (person.userId === user.id ? " (you)" : "")}</Text>{owner && person.email && person.email !== memberName(person) && <Text muted size={13}>{person.email}</Text>}</View>
          {person.role === "owner" ? <View style={{ alignSelf: "center" }}><Badge tone="lavender">Owner</Badge></View> : owner && <Button variant="outline" title="Manage" busy={busy} onPress={() => setMember(person)} />}</View>)}</Card>
      {member && <Sheet title={memberName(member)} onClose={() => setMember(undefined)}><MenuItem icon="swap-horizontal-outline" title="Transfer ownership" onPress={() => change("transfer", member)} /><MenuItem icon="person-remove-outline" title="Remove from family" danger onPress={() => change("remove", member)} /></Sheet>}
    </Page>
  );
}
