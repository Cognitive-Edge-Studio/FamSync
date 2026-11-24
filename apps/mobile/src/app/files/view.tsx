import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, ScrollView, View } from "react-native";
import { ErrorText } from "@/components/form";
import { confirm, Page, queryState, WithScope } from "@/components/screen";
import { Button, Card, Loading, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { csvRows, fileSize } from "@/lib/file-rules";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import type { Scope } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";
import { shareFile } from "@/lib/share-file";
import { useTheme } from "@/lib/theme";
import { MediaAttachment } from '@/components/media-player';

export default function FileScreen() {
  const { id, family } = useLocalSearchParams<{ id: string; family?: string }>();
  return <><Stack.Screen options={{ title: "File" }} /><WithScope familyId={family}>{(scope) => <View_ key={scope.id + id} scope={scope} id={id} />}</WithScope></>;
}
function View_({ scope, id }: { scope: Scope; id: string }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), [note, setNote] = useState(""), [sharing, setSharing] = useState(false), path = { familyId: scope.id, fileId: id };
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/files/{fileId}", { params: { path: { familyId: scope.id, fileId: id } }, signal }).then(required), [access_token, scope.id, id]);
  const query = useQuery(scope.store, "file:" + id, load), file = query.data, state = queryState(query, { loading: "Loading file…", failed: "The file couldn’t load", lost: "File not found" });
  if (state || !file) return state;
  // A link is asked for each time, so access is checked each time.
  async function use(share: boolean) {
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/files/{fileId}/download", { params: { path } }), "We couldn’t open this file. Try again.");
    if (!result.ok) { if (result.gone || result.conflict) query.refresh(); return; }
    setSharing(true);
    try { if (share) await shareFile(result.data.url, file!.fileName, file!.mime); else await Linking.openURL(result.data.url); } catch { setError(share ? "We couldn’t share this file." : "No app on this phone can open this file."); } finally { setSharing(false); }
  }
  async function archive() {
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/files/{fileId}/archive", { params: { path }, body: { version: file!.version, archived: !file!.archived } }), "We couldn’t update this file. Try again.");
    if (result.ok) { query.replace(() => result.data); setNote(result.data.archived ? "File archived." : "File restored."); } else query.refresh();
  }
  return (
    <Page query={query}>
      <ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      <Card><Text size={17} weight="600" accessibilityRole="header">{file.fileName}</Text><Text muted size={13}>{fileSize(file.byteSize) + " · Added " + new Date(file.createdAt).toLocaleDateString() + (file.archived ? " · Archived" : "")}</Text></Card>
      {!file.canDownload ? <Text muted>This file can’t be opened while it or its folder is archived.</Text> : <>
        {(file.preview === "image" || file.preview === "text") && !query.error && <Preview key={file.version} scope={scope} id={id} csv={file.mime === "text/csv"} name={file.fileName} />}
        {(file.preview === 'audio' || file.preview === 'video') && !query.error && <Card><MediaAttachment key={file.version} familyId={scope.id} fileId={id} name={file.fileName} kind={file.preview} seconds={file.voiceSeconds} /></Card>}
        <Button title="Open" busy={busy || sharing} onPress={() => void use(false)} /><Button variant="outline" title="Share or save" busy={busy || sharing} onPress={() => void use(true)} /></>}
      {file.canManage && <Button variant="outline" title={file.archived ? "Restore file" : "Archive file"} busy={busy} onPress={() => file.archived ? void archive() : confirm("Archive this file?", "It is kept but can’t be opened until it is restored.", "Archive", () => void archive())} />}
    </Page>
  );
}
function Preview({ scope, id, csv, name }: { scope: Scope; id: string; csv: boolean; name: string }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), [data, setData] = useState<{ url: string | null; text: string | null }>(), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [ratio, setRatio] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    getApi(access_token).POST("/api/v1/families/{familyId}/files/{fileId}/preview", { params: { path: { familyId: scope.id, fileId: id } }, signal: controller.signal }).then(required).then((value) => { if (!controller.signal.aborted) setData({ url: value.url, text: value.text }); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
    // A new token does not need a new preview.
  }, [scope.id, id, attempt]);
  // Links last a minute; a picture that fails once asks for a new one.
  const bad = () => { setData(undefined); if (attempt < 1) setAttempt(attempt + 1); else setFailed(true); };
  if (failed) return <Card><Text>Preview unavailable.</Text><Button variant="outline" title="Try again" onPress={() => setAttempt(attempt + 1)} /></Card>;
  if (!data) return <Loading label="Loading preview…" />;
  if (data.url) return <Image accessibilityLabel={name} source={{ uri: data.url }} resizeMode="contain" onError={bad} onLoad={({ nativeEvent }) => { const source = nativeEvent.source; if (source?.width && source.height) setRatio(source.width / source.height); }} style={{ width: "100%", aspectRatio: Math.max(0.5, ratio), borderRadius: 12, backgroundColor: colors.muted }} />;
  if (csv) return <Card><ScrollView horizontal><View>{csvRows(data.text ?? "").map((row, index) => <View key={index} style={{ flexDirection: "row" }}>{row.map((cell, n) => <View key={n} style={{ width: 130, padding: 6, borderWidth: 0.5, borderColor: colors.border, backgroundColor: index === 0 ? colors.accent : undefined }}><Text size={13} weight={index === 0 ? "600" : "400"}>{cell}</Text></View>)}</View>)}</View></ScrollView><Text muted size={13}>Up to 20 rows and 12 columns. Open the file for the rest.</Text></Card>;
  return <Card><Text selectable>{data.text || "This file is empty."}</Text><Text muted size={13}>Up to 50,000 characters. Open the file for the rest.</Text></Card>;
}
