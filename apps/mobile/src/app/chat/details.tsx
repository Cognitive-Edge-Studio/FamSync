import type { ChannelDetail } from "@famsync/core/chat";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { ErrorText, Sheet } from "@/components/form";
import { ChannelIcon } from "@/components/channel-icon";
import { Avatar } from "@/components/message";
import { PickFiles } from "@/components/pick-files";
import { Badge, confirm, MenuItem, Page, queryState, WithScope } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useChats } from "@/lib/chat";
import { uploadFile, type Picked } from "@/lib/attachments";
import { forgetChat } from "@/lib/forget-chat";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { scopeParams, type Scope } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

export default function Details() {
  const { id, family: familyId } = useLocalSearchParams<{ id: string; family?: string }>();
  return <><Stack.Screen options={{ title: "Chat details" }} /><WithScope familyId={familyId}>{(family) => <Body key={family.id + id} family={family} id={id} />}</WithScope></>;
}

function Body({ family, id }: { family: Scope; id: string }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), { refresh, refreshGuests } = useChats(), path = { familyId: family.id, channelId: id };
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { familyId: family.id, channelId: id } }, signal }).then(required), [access_token, family.id, id]);
  const query = useQuery(family.store, "chat-details:" + id, load), channel = query.data, [role, setRole] = useState<ChannelDetail["members"][number]>(), [note, setNote] = useState(""), [picking, setPicking] = useState(false), [picture, setPicture] = useState<number>(), pictureId = useRef("");
  const state = queryState(query, { loading: "Loading details…", failed: "Details couldn’t load", lost: "Conversation not found" });
  if (state || !channel) return state;
  async function change(call: (api: ReturnType<typeof getApi>) => Promise<{ data?: ChannelDetail; error?: unknown; response: Response }>, done: string) {
    setNote(""); setRole(undefined);
    const result = await save(() => call(getApi(access_token)), "We couldn’t save this change. Try again.");
    if (result.ok) { query.replace(() => result.data); setNote(done); refresh(); } else if (result.conflict || result.gone) query.refresh();
  }
  const leave = () => confirm("Leave " + channel.name + "?", "You will lose access to its messages and files. An admin can add you again.", "Leave", () => void (async () => {
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/leave", { params: { path } }), "We couldn’t leave this channel. Try again.");
    if (!result.ok) return;
    await forgetChat(user.id, family.store, id);
    refresh();
    refreshGuests();
    router.dismissTo(family.guest ? "/guests" : "/chats");
  })());
  async function removePicture() {
    setNote("");
    const result = await save(() => getApi(access_token).DELETE("/api/v1/families/{familyId}/channels/{channelId}/image", { params: { path }, body: { version: channel!.version } }), "We couldn’t remove the picture. Try again.");
    if (result.ok) { setNote("Picture removed."); refresh(); }
    query.refresh();
  }
  async function sendPicture(file: Picked) {
    setNote(""); setError(""); setPicture(0); pictureId.current ||= randomUUID();
    try {
      await uploadFile({ path: "/api/v1/families/" + family.id + "/channels/" + id + "/image", fields: { id: pictureId.current, version: String(channel!.version) }, file, token: access_token, signal: new AbortController().signal, onProgress: setPicture, limit: 2 });
      pictureId.current = "";
      setNote("Picture saved.");
      refresh();
    } catch (problem) { pictureId.current = ""; setError(problem instanceof Error ? problem.message : "We couldn’t save the picture."); } finally { setPicture(undefined); query.refresh(); }
  }
  const admin = channel.canManage && channel.kind === "channel";
  return (
    <Page query={query}>
      {note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}<ErrorText>{error}</ErrorText>
      {picture !== undefined && <Text accessibilityLiveRegion="polite">{"Uploading picture " + picture + "%"}</Text>}
      <Card><View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>{channel.kind === "channel" && <ChannelIcon familyId={family.id} channel={channel} />}<Text size={20} weight="600" accessibilityRole="header" style={{ flex: 1 }}>{channel.name}</Text></View>{channel.topic ? <Text>{channel.topic}</Text> : null}{channel.description ? <Text muted>{channel.description}</Text> : null}{channel.archived && <Badge>Archived for everyone</Badge>}{!channel.canCreateWork && <Text muted>You have guest access to this channel.</Text>}</Card>
      <Card style={{ padding: 8 }}>
        <MenuItem icon="search-outline" title="Search this conversation" onPress={() => router.push({ pathname: "/chat/search", params: { id, ...scopeParams(family) } })} />
        <MenuItem icon="folder-outline" title="Folders and files" onPress={() => router.push({ pathname: "/files", params: { channel: id, ...scopeParams(family) } })} />
        <MenuItem icon={channel.muted ? "notifications-outline" : "notifications-off-outline"} title={channel.muted ? "Unmute" : "Mute"} disabled={busy} onPress={() => void change((api) => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/mute", { params: { path }, body: { muted: !channel.muted } }), channel.muted ? "Conversation unmuted." : "Conversation muted.")} />
        {admin && <MenuItem icon="pencil-outline" title="Edit channel" onPress={() => router.push({ pathname: "/chat/form", params: { id } })} />}
        {admin && !channel.archived && <MenuItem icon="image-outline" title={channel.imageFileId ? "Change picture" : "Add picture"} disabled={busy || picture !== undefined} onPress={() => setPicking(true)} />}
        {admin && !channel.archived && channel.imageFileId && <MenuItem icon="trash-outline" title="Remove picture" disabled={busy} onPress={() => void removePicture()} />}
        {admin && <MenuItem icon="person-add-outline" title="Channel guests" onPress={() => router.push({ pathname: "/chat/guests", params: { id } })} />}
        {admin && <MenuItem icon="archive-outline" title={channel.archived ? "Restore channel" : "Archive for everyone"} disabled={busy} onPress={() => { const run = () => void change((api) => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/archive", { params: { path }, body: { version: channel.version, archived: !channel.archived } }), channel.archived ? "Channel restored." : "Channel archived."); if (channel.archived) run(); else confirm("Archive for everyone?", "Nobody can post until an admin restores it.", "Archive", run); }} />}
        {channel.kind === "channel" && <MenuItem icon="exit-outline" title="Leave channel" danger disabled={busy} onPress={leave} />}
      </Card>
      <Card>
        <Text size={17} weight="600" accessibilityRole="header">{"Members (" + channel.memberCount + ")"}</Text>
        {channel.members.map((member) => <View key={member.userId} style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48 }}>
          <Avatar name={member.name} id={member.userId} /><View style={{ flex: 1 }}><Text>{member.userId === user.id ? member.name + " (me)" : member.name}</Text>{member.online && <Text muted size={13}>Online</Text>}</View>
          <View style={{ alignSelf: "center" }}>{member.guest ? <Badge tone="peach">Guest</Badge> : member.userId === channel.manager?.userId ? <Badge tone="lavender">Manager</Badge> : member.admin ? <Badge>Admin</Badge> : null}</View>
          {admin && !member.guest && member.userId !== channel.manager?.userId && <Button variant="outline" title="Role" disabled={busy} onPress={() => setRole(member)} />}
        </View>)}
        {admin && <Text muted size={13}>To add or remove family members, edit the channel.</Text>}
      </Card>
      {picking && <PickFiles photosOnly title="Channel picture" limit={1} note="Up to 2 MB after resizing." onClose={() => setPicking(false)} onError={setError} onPicked={(files) => { setPicking(false); if (files[0]) void sendPicture(files[0]); }} />}
      {role && <Sheet title={role.name} onClose={() => setRole(undefined)}>
        <MenuItem icon="shield-outline" title={role.admin ? "Remove as admin" : "Make admin"} onPress={() => void change((api) => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/admins/{userId}", { params: { path: { ...path, userId: role.userId } }, body: { version: channel.version, admin: !role.admin } }), "Roles updated.")} />
        {channel.isManager && <MenuItem icon="swap-horizontal-outline" title="Make manager instead of me" onPress={() => { const person = role; setRole(undefined); confirm("Hand over this channel?", person.name + " becomes its manager. You stay an admin.", "Hand over", () => void change((api) => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/manager", { params: { path }, body: { version: channel.version, userId: person.userId } }), "Channel handed over.")); }} />}
      </Sheet>}
    </Page>
  );
}
