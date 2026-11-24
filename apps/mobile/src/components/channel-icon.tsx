import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { getApi } from "@/lib/api";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Text } from "./ui";

// Links last a short time, so a picture stays only while its row does.
export function ChannelIcon({ familyId, channel, size = 48 }: { familyId: string; channel: { id: string; emoji: string; imageFileId?: string | null }; size?: number }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), [url, setUrl] = useState<string>(), image = channel.imageFileId;
  useEffect(() => {
    setUrl(undefined);
    if (!image) return;
    const controller = new AbortController();
    getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/image/open", { params: { path: { familyId, channelId: channel.id } }, signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setUrl(data?.url ?? undefined); }, () => {});
    return () => controller.abort();
  }, [familyId, channel.id, image]);
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, borderRadius: size * 0.3, overflow: "hidden", backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>{url ? <Image source={{ uri: url }} style={{ width: size, height: size }} onError={() => setUrl(undefined)} /> : <Text size={size / 2}>{channel.emoji}</Text>}</View>;
}
