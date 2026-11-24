import type { components } from "@famsync/api-client";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ErrorText, Field, Select, Sheet } from "@/components/form";
import { PickFiles } from "@/components/pick-files";
import { AddButton, Chips, confirm, LinkRow, MenuItem, Page, queryState, WithScope } from "@/components/screen";
import { Button, Card, Icon, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { fileSize } from "@/lib/file-rules";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { scopeParams, type Scope } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useUploads } from "@/lib/uploads";
import { audienceText } from "./index";

type StoredFile = components["schemas"]["StoredFileDto"];
export default function FolderScreen() {
  const { id, family } = useLocalSearchParams<{ id: string; family?: string }>();
  return <><Stack.Screen options={{ title: "Folder" }} /><WithScope familyId={family}>{(scope) => <Folder key={scope.id + id} scope={scope} id={id} />}</WithScope></>;
}
function Folder({ scope, id }: { scope: Scope; id: string }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), { busy, error, setError, save } = useSave();
  const [text, setText] = useState(""), [search, setSearch] = useState(""), [sort, setSort] = useState<"recent" | "oldest" | "name" | "name-desc">("recent"), [type, setType] = useState<"all" | "image" | "document">("all"), [archived, setArchived] = useState<"false" | "true">("false"), [pages, setPages] = useState(1), [menu, setMenu] = useState(false), [picking, setPicking] = useState(false), [note, setNote] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setSearch(text.trim()); setPages(1); }, 300); return () => clearTimeout(timer); }, [text]);
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), path = { familyId: scope.id };
    const folder = required(await api.GET("/api/v1/families/{familyId}/folders/{folderId}", { params: { path: { ...path, folderId: id } }, signal })), files: StoredFile[] = [];
    let cursor: string | undefined, next: string | null = null;
    for (let page = 0; page < pages; page += 1) { const result = required(await api.GET("/api/v1/families/{familyId}/files", { params: { path, query: { folderId: id, q: search || undefined, sort, type, archived, cursor, limit: 20 } }, signal })); files.push(...result.files); next = result.nextCursor; if (!next) break; cursor = next; }
    return { folder, files, next };
  }, [access_token, scope.id, id, search, sort, type, archived, pages]);
  const plain = !search && sort === "recent" && type === "all" && archived === "false";
  const query = useQuery(scope.store, "folder:" + id + (plain ? "" : ":" + [search, sort, type, archived].join(":")), load), data = query.data, version = useRef(1);
  if (data) version.current = data.folder.version;
  const { uploads, add, retry, cancel } = useUploads<StoredFile>(() => ({ path: "/api/v1/families/" + scope.id + "/folders/" + id + "/files", fields: { version: String(version.current) }, token: access_token }), (file) => { setNote(file.fileName + " uploaded."); query.refresh(); });
  const state = queryState(query, { loading: "Loading folder…", failed: "The folder couldn’t load", lost: "Folder not found" });
  if (state && (plain || query.error === "lost")) return state;
  const folder = data?.folder;
  async function archive() {
    if (!folder) return;
    setMenu(false); setNote("");
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/folders/{folderId}/archive", { params: { path: { familyId: scope.id, folderId: id } }, body: { version: folder.version, archived: !folder.archived } }), "We couldn’t update this folder. Try again.");
    if (result.ok) setNote(result.data.archived ? "Folder archived. Its files can’t be opened until it is restored." : "Folder restored.");
    query.refresh();
  }
  return (
    <Page query={query} footer={folder?.canUpload && !query.error ? <AddButton label="Upload" onPress={() => setPicking(true)} /> : undefined}>
      <Stack.Screen options={{ title: folder?.name ?? "Folder", headerRight: folder?.canManage ? () => <Pressable accessibilityRole="button" accessibilityLabel="Folder options" onPress={() => setMenu(true)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="ellipsis-vertical" size={22} color={colors.foreground} /></Pressable> : undefined }} />
      <ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      {folder && <Text muted>{(folder.channelId ? "Conversation · " + folder.channelName : audienceText[folder.audience]) + " · " + folder.fileCount + (folder.fileCount === 1 ? " file" : " files") + (folder.archived ? " · Archived" : "")}</Text>}
      {folder?.archived && <Card><Text>Restore this folder to upload or open files. Saved files are kept.</Text></Card>}
      {uploads.map((item) => <Card key={item.id} accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}><View style={{ flex: 1 }}><Text numberOfLines={1}>{item.name}</Text><Text size={13} muted={!item.error} style={item.error ? { color: colors.destructive } : undefined}>{item.error ?? "Uploading " + item.percent + "%"}</Text></View>
        {item.error && <Pressable accessibilityRole="button" accessibilityLabel={"Retry " + item.name} onPress={() => retry(item.id)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="refresh" size={22} color={colors.foreground} /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={"Cancel " + item.name} onPress={() => cancel(item.id)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color={colors.foreground} /></Pressable></Card>)}
      <Field label="Find files" value={text} maxLength={120} onChangeText={setText} />
      <Chips label="Type" value={type} onChange={(value) => { setType(value); setPages(1); }} choices={[{ value: "all", label: "All" }, { value: "image", label: "Images" }, { value: "document", label: "Documents" }]} />
      <Chips label="Status" value={archived} onChange={(value) => { setArchived(value); setPages(1); }} choices={[{ value: "false", label: "Active" }, { value: "true", label: "Archived" }]} />
      <Select label="Sort" value={sort} onChange={(value) => { setSort(value); setPages(1); }} choices={[{ value: "recent", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "name", label: "Name A–Z" }, { value: "name-desc", label: "Name Z–A" }]} />
      {state ?? (data && <><Card style={{ paddingVertical: 6 }}>{data.files.length === 0 && <Text muted style={{ paddingVertical: 8 }}>{plain ? "No files yet." : "No files match this view."}</Text>}
        {data.files.map((file) => <LinkRow key={file.id} icon={file.preview === "image" ? "image-outline" : file.preview === "audio" ? "musical-notes-outline" : file.preview === "video" ? "videocam-outline" : "document-outline"} title={file.fileName} note={fileSize(file.byteSize) + " · " + new Date(file.createdAt).toLocaleDateString() + (file.archived ? " · Archived" : "")} onPress={() => router.push({ pathname: "/files/view", params: { id: file.id, ...scopeParams(scope) } })} />)}</Card>
        {data.next && <Button variant="outline" title="More files" busy={query.loading} onPress={() => setPages(pages + 1)} />}</>)}
      <Text muted size={13}>Files share this folder’s audience. Up to 5 MB each.</Text>
      {menu && folder && <Sheet title={folder.name} onClose={() => setMenu(false)}>{!folder.archived && <MenuItem icon="pencil-outline" title="Edit folder" onPress={() => { setMenu(false); router.push({ pathname: "/files/form", params: { id } }); }} />}<MenuItem icon="archive-outline" title={folder.archived ? "Restore folder" : "Archive folder"} disabled={busy} onPress={() => folder.archived ? void archive() : confirm("Archive this folder?", "Its files are kept but can’t be opened or added to until it is restored.", "Archive", () => void archive())} /></Sheet>}
      {picking && <PickFiles title="Upload" limit={10} note="Up to 5 MB each. Photos are resized, and their location details are removed." onClose={() => setPicking(false)} onError={setError} onPicked={(files) => { setPicking(false); setNote(""); setError(add(files)); }} />}
    </Page>
  );
}
