import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Page, queryState } from "@/components/screen";
import { Card, Text } from "@/components/ui";
import { useChats } from "@/lib/chat";
import { useTheme } from "@/lib/theme";

export default function Guests() {
  const { guests, guestsSavedAt, guestsError, refreshGuests } = useChats(), { colors } = useTheme();
  useFocusEffect(useCallback(() => { refreshGuests(); }, [refreshGuests]));
  const query = { data: guests, savedAt: guestsSavedAt, error: guestsError, loading: false, refresh: refreshGuests };
  const state = queryState(query, { loading: "Loading guest channels…", failed: "Guest channels couldn’t load", lost: "Guest channels unavailable" });
  return <><Stack.Screen options={{ title: "Guest channels" }} />{state ?? <Page query={query}><Text muted>Channels other families shared with you.</Text><Card style={{ padding: 8, gap: 0 }}>
    {guests?.length === 0 && <Text muted style={{ padding: 12 }}>No guest channels. Open a current invitation email to join one.</Text>}
    {guests?.map((channel) => <Pressable key={channel.id} accessibilityRole="button" accessibilityLabel={channel.name + ", " + channel.familyName + (channel.archived ? ", archived" : "") + (channel.unread ? ", " + channel.unread + " unread" : "")} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: channel.id, family: channel.familyId } })} style={({ pressed }) => ({ minHeight: 64, padding: 8, borderRadius: 12, flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: pressed ? colors.accent : "transparent" })}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}><Text size={22}>{channel.emoji}</Text></View><View style={{ flex: 1 }}><Text weight={channel.unread ? "700" : "500"}>{channel.name}</Text><Text muted size={13}>{channel.familyName + (channel.archived ? " · Archived" : "")}</Text></View>
      {channel.unread > 0 && <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text size={13} weight="600" style={{ color: colors.onPrimary }}>{String(channel.unread)}</Text></View>}</Pressable>)}</Card></Page>}</>;
}
