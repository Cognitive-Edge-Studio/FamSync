import { listTime, previewText, type Channel } from "@famsync/core/chat";
import { memberName } from "@famsync/core/forms";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ErrorText, Field, Row, Sheet } from "@/components/form";
import { ChannelIcon } from "@/components/channel-icon";
import { MotionPressable } from '@/components/motion';
import { Avatar, HelperAvatar } from "@/components/message";
import { AddButton, Badge, Chips, MenuItem, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Icon, Loading, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useChats } from "@/lib/chat";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Chats() { return <WithFamily>{(family, onLost) => <ChatList key={family.id} family={family} onLost={onLost} />}</WithFamily>; }

function ChatList({ family, onLost }: { family: Family; onLost: () => void }) {
  const chats = useChats(), { user } = useSignedIn(), { busy, error, save } = useSave(), { access_token } = useSignedIn();
  const [filter, setFilter] = useState<"all" | "channel" | "dm" | "archived">("all"), [search, setSearch] = useState(""), [menu, setMenu] = useState<Channel>(), [adding, setAdding] = useState<"menu" | "dm">();
  const { refresh } = chats;
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const state = queryState({ data: chats.channels, error: chats.error, loading: chats.loading, refresh }, { loading: "Loading chats…", failed: "Chats couldn’t load", lost: "You no longer have access" }, onLost);
  async function prefer(channel: Channel, body: { pinned?: boolean; hidden?: boolean; unread?: boolean }) {
    setMenu(undefined);
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/channels/{channelId}/preferences", { params: { path: { familyId: family.id, channelId: channel.id } }, body }), "We couldn’t change this chat. Try again.");
    if (result.ok) refresh();
  }
  const wanted = search.trim().toLowerCase(), shown = (chats.channels ?? []).filter((channel) => (filter === "all" || channel.kind === filter) && (!wanted || (channel.name + " " + channel.topic).toLowerCase().includes(wanted)));
  return (
    <Page query={{ data: chats.channels, savedAt: chats.savedAt, error: chats.error, loading: chats.loading && !!chats.error, refresh }} footer={<AddButton label="New chat" onPress={() => setAdding("menu")} />}>
      <Field label="Find a chat" value={search} maxLength={120} onChangeText={setSearch} />
      <Chips label="Show" value={filter} onChange={setFilter} choices={[{ value: "all", label: "All" }, { value: "channel", label: "Channels" }, { value: "dm", label: "Direct" }, { value: "archived", label: "Archived" }]} />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Button variant="outline" title="Search messages" onPress={() => router.push("/chat/search")} /><Button variant="outline" title="Starred" onPress={() => router.push("/chat/starred")} /></View>
      <ErrorText>{error}</ErrorText>
      {filter === "archived" ? <Archived family={family} search={wanted} me={user.id} onMenu={setMenu} /> : state ?? <Card style={{ padding: 8, gap: 0 }}>
        {filter === "all" && !wanted && <HelperRow helper={chats.channels?.find((channel) => channel.helper)?.helper ?? null} />}
        {shown.length === 0 && <Text muted style={{ padding: 12 }}>{wanted ? "No chats match." : "No chats yet. Start a direct message or create a channel."}</Text>}
        {shown.map((channel) => <ChatRow key={channel.id} familyId={family.id} channel={channel} me={user.id} busy={busy} onMenu={() => setMenu(channel)} />)}
      </Card>}
      {menu && <Sheet title={menu.name} onClose={() => setMenu(undefined)}>
        {!menu.hidden && <MenuItem icon="pin-outline" title={menu.pinned ? "Unpin chat" : "Pin chat"} onPress={() => void prefer(menu, { pinned: !menu.pinned })} />}
        {menu.unread === 0 && <MenuItem icon="mail-unread-outline" title={menu.markedUnread ? "Mark as read" : "Mark as unread"} onPress={() => void prefer(menu, { unread: !menu.markedUnread })} />}
        <MenuItem icon="archive-outline" title={menu.hidden ? "Move back to chats" : "Archive for me"} onPress={() => void prefer(menu, { hidden: !menu.hidden })} />
      </Sheet>}
      {adding === "menu" && <Sheet title="New chat" onClose={() => setAdding(undefined)}><MenuItem icon="person-outline" title="Direct message" onPress={() => setAdding("dm")} /><MenuItem icon="people-outline" title="Channel" onPress={() => { setAdding(undefined); router.push("/chat/form"); }} /></Sheet>}
      {adding === "dm" && <NewDirect family={family} me={user.id} onClose={() => setAdding(undefined)} />}
    </Page>
  );
}

function ChatRow({ familyId, channel, me, onMenu, busy }: { familyId: string; channel: Channel; me: string; onMenu: () => void; busy?: boolean }) {
  const { colors } = useTheme(), unread = channel.unread > 0 || channel.markedUnread, preview = (channel.archived ? "Archived for everyone · " : "") + previewText(channel, me);
  const spoken = [channel.name, channel.unread > 0 ? channel.unread + " unread" : channel.markedUnread ? "marked unread" : "", channel.pinned ? "pinned" : "", channel.muted ? "muted" : "", preview, channel.lastMessage ? listTime(channel.lastMessage.createdAt) : ""].filter(Boolean).join(", ");
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityActions={[{ name: "longpress", label: "Chat options" }]} onAccessibilityAction={onMenu} onLongPress={onMenu} disabled={busy} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: channel.id } })}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, alignItems: "center", padding: 8, borderRadius: 12, minHeight: 68, backgroundColor: pressed ? colors.accent : "transparent" })}>
      {channel.kind === "dm" ? <Avatar name={channel.name} id={channel.peer?.userId ?? channel.id} size={48} /> : <ChannelIcon familyId={familyId} channel={channel} />}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 8 }}><Text weight={unread ? "700" : "500"} numberOfLines={1} style={{ flex: 1 }}>{channel.name}</Text>{channel.lastMessage && <Text muted size={13}>{listTime(channel.lastMessage.createdAt)}</Text>}</View>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Text size={13} muted={!unread} numberOfLines={1} style={{ flex: 1 }}>{preview}</Text>
          {channel.pinned && <Icon name="pin" size={14} color={colors.mutedForeground} />}{channel.muted && <Icon name="notifications-off" size={14} color={colors.mutedForeground} />}
          {channel.unread > 0 ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text size={13} weight="600" style={{ color: colors.onPrimary }}>{channel.unread}</Text></View> : channel.markedUnread && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} />}
        </View>
      </View>
    </MotionPressable>
  );
}

/** The family's AI helper sits pinned above the chats, like a contact you can always message. */
function HelperRow({ helper }: { helper: Channel["helper"] }) {
  const { colors } = useTheme(), title = helper ? helper.name : "Adopt a family member";
  const note = helper ? "Your Family Helper · catch up, shopping list, reminders" : "An AI member of your family that lives in FamSync";
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={title + ", " + note} onPress={() => router.push("/helper")}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, alignItems: "center", padding: 8, borderRadius: 12, minHeight: 68, backgroundColor: pressed ? colors.accent : "transparent" })}>
      {helper ? <HelperAvatar emoji={helper.emoji} size={48} /> : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" }}><Icon name="sparkles-outline" size={36} /></View>}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Text><Badge tone="sage">AI</Badge></View>
        <Text size={13} muted numberOfLines={1}>{note}</Text>
      </View>
      <Icon name="pin" size={14} color={colors.mutedForeground} />
    </MotionPressable>
  );
}

function Archived({ family, search, me, onMenu }: { family: Family; search: string; me: string; onMenu: (channel: Channel) => void }) {
  const { access_token } = useSignedIn(), { channels } = useChats();
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/channels", { params: { path: { familyId: family.id }, query: { kind: "all", archived: "true", limit: 100 } }, signal }).then(required), [access_token, family.id, channels?.length]);
  const query = useQuery(family.id, "chats-archived", load), state = queryState(query, { loading: "Loading chats…", failed: "Archived chats couldn’t load", lost: "You no longer have access" });
  if (state || !query.data) return state;
  const shown = query.data.channels.filter((channel) => channel.name.toLowerCase().includes(search));
  return <Card style={{ padding: 8, gap: 0 }}>{shown.length === 0 && <Text muted style={{ padding: 12 }}>No archived chats.</Text>}{shown.map((channel) => <ChatRow key={channel.id} familyId={family.id} channel={channel} me={me} onMenu={() => onMenu(channel)} />)}</Card>;
}

function NewDirect({ family, me, onClose }: { family: Family; me: string; onClose: () => void }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), { refresh } = useChats();
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/members", { params: { path: { familyId: family.id } }, signal }).then(required), [access_token, family.id]);
  const query = useQuery(family.id, "members", load), people = query.data?.filter((member) => member.userId !== me);
  async function open(peerId: string) {
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/channels/direct", { params: { path: { familyId: family.id } }, body: { peerId } }), "We couldn’t open the conversation. Try again.");
    if (result.ok) { refresh(); onClose(); router.push({ pathname: "/chat/[id]", params: { id: result.data.id } }); }
  }
  return <Sheet title="New direct message" onClose={onClose}><ErrorText>{error}</ErrorText>{!people && (query.error ? <Text muted>We couldn’t load your family. Try again when you’re connected.</Text> : <Loading label="Loading family…" />)}{people?.length === 0 && <Text muted>Invite another family member before starting a direct message.</Text>}
    {people?.map((member) => <Row key={member.userId} title={memberName(member)} selected={false} onPress={() => { if (!busy) void open(member.userId); }} />)}</Sheet>;
}
