import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { ErrorText } from "@/components/form";
import { Page, queryState } from "@/components/screen";
import { Button, Card, Icon, Text } from "@/components/ui";
import { noticeDetail, noticeLabels } from "@/lib/notice-rules";
import { useNotices, type Notice } from "@/lib/notices";
import { useTheme } from "@/lib/theme";

export default function Notifications() {
  const { items, savedAt, error, unread, refresh, markRead } = useNotices(), { colors } = useTheme(), [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const query = { data: items, savedAt, error, loading: false, refresh }, state = queryState(query, { loading: "Loading notifications…", failed: "Notifications couldn’t load", lost: "Notifications unavailable" });
  function open(item: Notice) {
    // Opening the item matters more than the read mark.
    if (!item.read) void markRead([item.id]).catch(() => {});
    router.push(item.target as Parameters<typeof router.push>[0]);
  }
  async function all() {
    setBusy(true); setProblem("");
    try { await markRead((items ?? []).filter((item) => !item.read).map((item) => item.id)); } catch { setProblem("We couldn’t mark your notifications as read. Try again."); } finally { setBusy(false); }
  }
  return <><Stack.Screen options={{ title: "Notifications" }} />{state ?? <Page query={query}><ErrorText>{problem}</ErrorText>{unread > 0 && <Button variant="outline" title={"Mark all as read (" + unread + ")"} busy={busy} onPress={() => void all()} />}
    <Card style={{ padding: 8, gap: 0 }}>{items?.length === 0 && <Text muted style={{ padding: 12 }}>Reminders, messages and changes to your tasks and events show up here.</Text>}
      {items?.map((item) => { const title = noticeLabels[item.kind] + ": " + item.title; return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={(item.read ? "" : "Unread, ") + title + ", " + noticeDetail(item)} onPress={() => open(item)} style={({ pressed }) => ({ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 60, padding: 8, borderRadius: 12, backgroundColor: pressed ? colors.accent : "transparent" })}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: item.read ? colors.muted : colors.sky }}><Icon name={item.sourceKind === "conversation" ? "chatbubble-outline" : item.kind === "assigned" || item.kind === "unassigned" ? "person-outline" : item.sourceKind === "event" ? "calendar-outline" : "checkbox-outline"} size={18} color={item.read ? colors.mutedForeground : colors.onSky} /></View>
        <View style={{ flex: 1 }}><Text weight={item.read ? "400" : "600"}>{title}</Text><Text muted size={13}>{noticeDetail(item)}</Text></View>{!item.read && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onSky }} />}</Pressable>; })}</Card></Page>}</>;
}
