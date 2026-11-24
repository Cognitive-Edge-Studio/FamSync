import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/components/form";
import { AddButton, Chips, LinkRow, Page, queryState, WithScope } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { scopeParams, type Scope } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

export const audienceText = { private: "Only me", family: "Everyone in this family", selected: "Selected members" };
export default function Files() {
  const { channel, family } = useLocalSearchParams<{ channel?: string; family?: string }>();
  return <><Stack.Screen options={{ title: channel ? "Conversation folders" : "Files" }} /><WithScope familyId={family}>{(scope) => <Folders key={scope.id + channel} scope={scope} channel={channel} />}</WithScope></>;
}
function Folders({ scope, channel }: { scope: Scope; channel?: string }) {
  const { access_token } = useSignedIn(), [text, setText] = useState(""), [search, setSearch] = useState(""), [kind, setKind] = useState<"all" | "family" | "channel">("all"), [archived, setArchived] = useState<"false" | "true">("false"), [pages, setPages] = useState(1);
  useEffect(() => { const timer = setTimeout(() => { setSearch(text.trim()); setPages(1); }, 300); return () => clearTimeout(timer); }, [text]);
  const load = useCallback(async (signal: AbortSignal) => {
    const folders = [];
    let cursor: string | undefined;
    for (let page = 0; ; page += 1) {
      const result = required(await getApi(access_token).GET("/api/v1/families/{familyId}/folders", { params: { path: { familyId: scope.id }, query: { channelId: channel, kind: channel ? "all" : kind, q: search || undefined, archived, cursor, limit: 20 } }, signal }));
      folders.push(...result.folders);
      if (!result.nextCursor || page + 1 >= pages) return { ...result, folders };
      cursor = result.nextCursor;
    }
  }, [access_token, scope.id, channel, kind, search, archived, pages]);
  const key = search || archived === "true" || kind !== "all" ? "folders-filtered" : "folders:" + (channel ?? "");
  const query = useQuery(scope.store, key + (key === "folders-filtered" ? ":" + [channel, kind, archived, search].join(":") : ""), load), data = query.data;
  const state = queryState(query, { loading: "Loading folders…", failed: "Folders couldn’t load", lost: "You no longer have access" });
  return (
    <Page query={query} footer={data?.canCreate ? <AddButton label="New folder" onPress={() => router.push({ pathname: "/files/form", params: channel ? { channel } : {} })} /> : undefined}>
      <Field label="Find folders" value={text} maxLength={120} onChangeText={setText} />
      {!channel && <Chips label="Type" value={kind} onChange={(value) => { setKind(value); setPages(1); }} choices={[{ value: "all", label: "All" }, { value: "family", label: "Family" }, { value: "channel", label: "Conversations" }]} />}
      <Chips label="Status" value={archived} onChange={(value) => { setArchived(value); setPages(1); }} choices={[{ value: "false", label: "Active" }, { value: "true", label: "Archived" }]} />
      {state ?? (data && <><Card style={{ paddingVertical: 6 }}>{data.folders.length === 0 && <Text muted style={{ paddingVertical: 8 }}>No folders match this view.</Text>}
        {data.folders.map((folder) => <LinkRow key={folder.id} icon={folder.channelId ? "chatbubbles-outline" : "folder-outline"} title={folder.name} note={(folder.channelId ? "Conversation · " + folder.channelName : audienceText[folder.audience]) + " · " + folder.fileCount + (folder.fileCount === 1 ? " file" : " files") + (folder.archived ? " · Archived" : "")} onPress={() => router.push({ pathname: "/files/[id]", params: { id: folder.id, ...scopeParams(scope) } })} />)}</Card>
        {data.nextCursor && <Button variant="outline" title="More folders" busy={query.loading} onPress={() => setPages(pages + 1)} />}</>)}
    </Page>
  );
}
