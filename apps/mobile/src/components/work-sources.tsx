import { router } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { getApi, required } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { ErrorText } from "./form";
import { confirm, LinkRow } from "./screen";
import { Button, Card, Text } from "./ui";

/** The chat messages a task or event came from, for people who can read them. */
export function WorkSources({ familyId, kind, id, onUnlinked }: { familyId: string; kind: "task" | "event"; id: string; onUnlinked: () => void }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), [hidden, setHidden] = useState(false);
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/channels/work-sources", { params: { path: { familyId }, query: { kind, id } }, signal }).then(required), [access_token, familyId, kind, id]);
  const sources = useQuery(familyId, "sources:" + kind + ":" + id, load).data?.sources ?? [];
  if (hidden || !sources.length) return null;
  const unlink = (version: number) => confirm("Unlink the source message?", "The task stays; it no longer points to the message.", "Unlink", () => void (async () => {
    const result = await save(() => getApi(access_token).DELETE("/api/v1/families/{familyId}/channels/task-sources/{taskId}", { params: { path: { familyId, taskId: id } }, body: { version } }), "We couldn’t unlink this source. Try again.");
    if (result.ok) { setHidden(true); onUnlinked(); }
  })());
  return <Card><Text size={17} weight="600" accessibilityRole="header">From chat</Text>{sources.map((source, index) => {
    const link = source.path ? new URLSearchParams(source.path.split("?")[1]) : null, chat = link?.get("conversation"), message = link?.get("id");
    return <View key={source.path ?? index}>{chat && message ? <LinkRow icon="chatbubble-outline" title={source.label} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: chat, message } })} /> : <Text muted>Source unavailable</Text>}{source.canUnlink && <Button variant="outline" title="Unlink" busy={busy} onPress={() => unlink(source.version)} />}</View>;
  })}<ErrorText>{error}</ErrorText></Card>;
}
