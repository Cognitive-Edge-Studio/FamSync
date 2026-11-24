import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { MessageHit } from "@/components/message-list";
import { Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSignedIn } from "@/lib/session";

export default function StarredScreen() { return <><Stack.Screen options={{ title: "Starred messages" }} /><WithFamily>{(family, onLost) => <Starred key={family.id} family={family} onLost={onLost} />}</WithFamily></>; }
function Starred({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token } = useSignedIn(), [busy, setBusy] = useState(false);
  const page = useCallback((cursor?: string, signal?: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/channels/starred-messages", { params: { path: { familyId: family.id }, query: { cursor, limit: 20 } }, signal }).then(required), [access_token, family.id]);
  const query = useQuery(family.id, "starred", useCallback((signal: AbortSignal) => page(undefined, signal), [page]));
  const state = queryState(query, { loading: "Loading starred messages…", failed: "Starred messages couldn’t load", lost: "You no longer have access" }, onLost);
  if (state || !query.data) return state;
  const more = async () => { setBusy(true); try { const next = await page(query.data!.nextCursor!); query.replace((old) => ({ ...next, messages: [...old.messages, ...next.messages.filter((row) => !old.messages.some((item) => item.id === row.id))] })); } catch { /* It can be tried again. */ } finally { setBusy(false); } };
  return <Page query={query}><Card style={{ padding: 6 }}>{query.data.messages.length === 0 && <Text muted style={{ padding: 10 }}>Star a message to find it here. Only you see your stars.</Text>}{query.data.messages.map((row) => <MessageHit key={row.id} item={row} />)}</Card>{query.data.nextCursor && <Button variant="outline" title="Load more" busy={busy} onPress={() => void more()} />}</Page>;
}
