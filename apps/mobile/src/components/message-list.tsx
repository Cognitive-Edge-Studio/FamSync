import type { components } from "@famsync/api-client";
import { listTime } from "@famsync/core/chat";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Text } from "./ui";

export function MessageHit({ item, link }: { item: components["schemas"]["MessageSearchItemDto"]; link?: { family?: string } }) {
  const { colors } = useTheme(), who = item.conversationName + " · " + (item.author?.name ?? "Former member");
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.conversationId, message: item.id, ...link } })} style={({ pressed }) => ({ minHeight: 56, gap: 4, padding: 10, borderRadius: 12, backgroundColor: pressed ? colors.accent : "transparent" })}>
    <View style={{ flexDirection: "row", gap: 8 }}><Text muted size={13} numberOfLines={1} style={{ flex: 1 }}>{who}</Text><Text muted size={13}>{listTime(item.createdAt)}</Text></View><Text numberOfLines={3}>{item.body || "Attachment"}</Text></Pressable>;
}
