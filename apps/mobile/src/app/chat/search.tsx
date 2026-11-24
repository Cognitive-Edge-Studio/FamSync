import type { components } from "@famsync/api-client";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/form";
import { MessageHit } from "@/components/message-list";
import { Page, WithScope } from "@/components/screen";
import { Button, Card, Loading, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { scopeParams, type Scope } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

export default function SearchScreen() {
  const { id, family: familyId } = useLocalSearchParams<{ id?: string; family?: string }>();
  return <><Stack.Screen options={{ title: id ? "Search conversation" : "Search messages" }} /><WithScope familyId={familyId}>{(family) => <Search key={family.id} family={family} id={id} />}</WithScope></>;
}
// Results are not saved on the phone.
function Search({ family, id }: { family: Scope; id?: string }) {
  const { access_token } = useSignedIn(), [text, setText] = useState(""), [rows, setRows] = useState<components["schemas"]["MessageSearchItemDto"][]>(), [next, setNext] = useState<string | null>(null), [cursor, setCursor] = useState<string>(), [loading, setLoading] = useState(false), [error, setError] = useState(""), wanted = text.trim();
  useEffect(() => {
    if (!wanted) { setRows(undefined); setNext(null); setError(""); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      getApi(access_token).GET("/api/v1/families/{familyId}/channels/message-search", { params: { path: { familyId: family.id }, query: { q: wanted, conversationId: id, cursor, limit: 20 } }, signal: controller.signal }).then(required)
        .then((page) => { if (controller.signal.aborted) return; setRows((old) => cursor ? [...(old ?? []), ...page.messages.filter((row) => !old?.some((item) => item.id === row.id))] : page.messages); setNext(page.nextCursor); setError(""); })
        .catch(() => { if (!controller.signal.aborted) setError("We couldn’t search messages. Check your connection and try again."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, cursor ? 0 : 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [wanted, cursor, id, access_token, family.id]);
  return <Page><Field label={id ? "Search this conversation" : "Search messages"} value={text} maxLength={120} autoFocus onChangeText={(value) => { setText(value); setCursor(undefined); }} /><ErrorText>{error}</ErrorText>
    {loading && !rows?.length && <Loading label="Searching…" />}{rows && <Card style={{ padding: 6 }}>{rows.length === 0 && !loading && <Text muted style={{ padding: 10 }}>No matching messages.</Text>}{rows.map((row) => <MessageHit key={row.id} item={row} link={scopeParams(family)} />)}</Card>}{next && <Button variant="outline" title="More results" busy={loading} onPress={() => setCursor(next)} />}</Page>;
}
