import type { components } from "@famsync/api-client";
import { audienceLabels } from "@famsync/core/calendar-date";
import { audienceProblem, changedFields, memberName, mergeDraft } from "@famsync/core/forms";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudienceFields, ErrorText, Field } from "@/components/form";
import { ConflictNotice, FormPage, queryState, WithFamily } from "@/components/screen";
import { Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Folder = components["schemas"]["FolderDto"];
type Ready = { members: components["schemas"]["FamilyMemberDto"][]; folder?: Folder; channelVersion?: number };
export default function FolderForm() {
  const { id, channel } = useLocalSearchParams<{ id?: string; channel?: string }>();
  return <><Stack.Screen options={{ title: id ? "Edit folder" : "New folder" }} /><WithFamily>{(family) => <Load key={family.id} family={family} id={id} channel={channel} />}</WithFamily></>;
}
function Load({ family, id, channel }: { family: Family; id?: string; channel?: string }) {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), path = { familyId: family.id };
    const [members, folder, chat] = await Promise.all([api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal }).then(required), id ? api.GET("/api/v1/families/{familyId}/folders/{folderId}", { params: { path: { ...path, folderId: id } }, signal }).then(required) : undefined, channel ? api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: channel } }, signal }).then(required) : undefined]);
    return { members, folder, channelVersion: chat?.version };
  }, [access_token, family.id, id, channel]);
  const query = useQuery(family.id, "folder-form:" + (id ?? channel ?? "new"), load), opened = useRef<Ready>(undefined);
  if (!query.savedAt && query.data && !query.error) opened.current ??= query.data;
  if (opened.current) return <Form family={family} ready={opened.current} channel={channel} />;
  return queryState({ ...query, data: undefined }, { loading: "Opening form…", failed: "The form couldn’t open", lost: "Folder not found" });
}
const draftOf = ({ folder }: Ready) => ({ name: folder?.name ?? "", audience: folder?.audience ?? ("private" as Folder["audience"]), selected: [...(folder?.selectedMemberIds ?? [])].sort() });
function Form({ family, ready, channel }: { family: Family; ready: Ready; channel?: string }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), [base, setBase] = useState(ready), [draft, setDraft] = useState(() => draftOf(ready)), [start, setStart] = useState(draft), [conflict, setConflict] = useState<Ready>(), [saved, setSaved] = useState<string>(), newId = useRef("");
  const conversation = channel ?? base.folder?.channelId ?? null, path = { familyId: family.id }, editing = !!base.folder;
  useEffect(() => { if (saved === undefined) return; if (editing) router.back(); else router.replace({ pathname: "/files/[id]", params: { id: saved } }); }, [saved, editing]);
  async function submit(from = base, values = draft) {
    if (!values.name.trim()) return setError("Enter a folder name.");
    const problem = conversation ? null : audienceProblem(values.audience, values.selected);
    if (problem) return setError(problem);
    newId.current ||= randomUUID();
    const api = getApi(access_token), fields = { name: values.name.trim(), audience: conversation ? "family" as const : values.audience, selectedMemberIds: !conversation && values.audience === "selected" ? values.selected : [] };
    const result = from.folder ? await save(() => api.PUT("/api/v1/families/{familyId}/folders/{folderId}", { params: { path: { ...path, folderId: from.folder!.id } }, body: { ...fields, version: from.folder!.version } }), "We couldn’t save this folder. Try again.")
      : await save(() => api.POST("/api/v1/families/{familyId}/folders", { params: { path }, body: { ...fields, id: newId.current, channelId: conversation, channelVersion: conversation ? from.channelVersion ?? null : null } }), "We couldn’t save this folder. Try again.");
    if (result.ok) { setConflict(undefined); return setSaved(result.data.id); }
    if (!result.conflict) return;
    try {
      if (from.folder) setConflict({ ...from, folder: required(await api.GET("/api/v1/families/{familyId}/folders/{folderId}", { params: { path: { ...path, folderId: from.folder.id } } })) });
      // Who can see the conversation changed. The next save uses its current state.
      else if (conversation) { const chat = required(await api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: conversation } } })); setBase({ ...from, channelVersion: chat.version }); }
    } catch { /* The server's message explains the conflict. */ }
  }
  const name = (id: string) => { const member = base.members.find((item) => item.userId === id); return member ? memberName(member) : "Former member"; };
  const changes = conflict ? changedFields(draftOf(base), draftOf(conflict), { name: "Name", audience: "Who can see it", selected: "Shared with" }).map(({ label, value }) => ({ label, value: Array.isArray(value) ? value.map(name).join(", ") : label === "Who can see it" ? audienceLabels[value as Folder["audience"]] : String(value) })) : [];
  return (
    <FormPage dirty={saved === undefined && JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title={editing ? "Save folder" : "Create folder"} onSave={() => void submit()} error={<ErrorText>{conflict ? "" : error}</ErrorText>}
      notice={conflict && <ConflictNotice changes={changes} onKeepMine={() => { const latest = conflict, merged = mergeDraft(draftOf(base), draft, draftOf(latest)); setBase(latest); setDraft(merged); setStart(draftOf(latest)); setConflict(undefined); void submit(latest, merged); }} onUseLatest={() => { const latest = draftOf(conflict); setBase(conflict); setDraft(latest); setStart(latest); setConflict(undefined); setError(""); }} />}>
      <Field label="Folder name" value={draft.name} maxLength={100} onChangeText={(value) => setDraft({ ...draft, name: value })} />
      {conversation ? <Text muted>Everyone in this conversation can see its files, including guests.</Text>
        : <AudienceFields noun="folder" audience={draft.audience} selected={draft.selected} members={base.members} me={user.id} onAudience={(audience) => setDraft({ ...draft, audience })} onSelected={(ids) => setDraft({ ...draft, selected: [...ids].sort() })} />}
    </FormPage>
  );
}
