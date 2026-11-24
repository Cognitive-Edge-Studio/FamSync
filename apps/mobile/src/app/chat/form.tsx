import type { components } from "@famsync/api-client";
import type { ChannelDetail } from "@famsync/core/chat";
import { changedFields, memberName, mergeDraft } from "@famsync/core/forms";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorText, Field, Row, Select } from "@/components/form";
import { ConflictNotice, FormPage, queryState, WithFamily } from "@/components/screen";
import { Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useChats } from "@/lib/chat";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Ready = { members: components["schemas"]["FamilyMemberDto"][]; channel?: ChannelDetail };
type Draft = { name: string; emoji: string; topic: string; description: string; people: string[] };

export default function ChannelForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <><Stack.Screen options={{ title: id ? "Edit channel" : "New channel" }} /><WithFamily>{(family) => <Load key={family.id} family={family} id={id} />}</WithFamily></>;
}
function Load({ family, id }: { family: Family; id?: string }) {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), path = { familyId: family.id };
    const [members, channel] = await Promise.all([api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal }).then(required), id ? api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: id } }, signal }).then(required) : undefined]);
    return { members, channel };
  }, [access_token, family.id, id]);
  const query = useQuery(family.id, "channel-form:" + (id ?? "new"), load), opened = useRef<Ready>(undefined);
  if (!query.savedAt && query.data && !query.error) opened.current ??= query.data;
  if (opened.current) return <Form family={family} ready={opened.current} />;
  return queryState({ ...query, data: undefined }, { loading: "Opening form…", failed: "The form couldn’t open", lost: "Conversation not found" });
}
const draftOf = ({ channel }: Ready, me: string): Draft => ({ name: channel?.name ?? "", emoji: channel?.emoji ?? "💬", topic: channel?.topic ?? "", description: channel?.description ?? "", people: (channel ? channel.members.filter((member) => !member.guest).map((member) => member.userId) : [me]).sort() });

function Form({ family, ready }: { family: Family; ready: Ready }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), { refresh } = useChats();
  const [base, setBase] = useState(ready), [draft, setDraft] = useState(() => draftOf(ready, user.id)), [start, setStart] = useState(draft), [conflict, setConflict] = useState<Ready>(), [saved, setSaved] = useState<string>();
  const newId = useRef(""), editing = !!base.channel, lead = base.channel?.manager?.userId ?? user.id, path = { familyId: family.id };
  useEffect(() => { if (saved === undefined) return; if (editing) router.back(); else router.replace({ pathname: "/chat/[id]", params: { id: saved } }); }, [saved, editing]);
  const set = (change: Partial<Draft>) => setDraft((old) => ({ ...old, ...change }));
  async function submit(version = base.channel?.version ?? 0, values = draft) {
    if (!values.name.trim()) return setError("Enter a channel name.");
    newId.current ||= randomUUID();
    const body = { name: values.name.trim(), emoji: values.emoji, topic: values.topic.trim(), description: values.description.trim(), memberIds: values.people }, api = getApi(access_token);
    const result = base.channel ? await save(() => api.PUT("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: base.channel!.id } }, body: { ...body, version } }), "We couldn’t save this channel. Try again.")
      : await save(() => api.POST("/api/v1/families/{familyId}/channels", { params: { path }, body: { ...body, id: newId.current } }), "We couldn’t save this channel. Try again.");
    if (result.ok) { setConflict(undefined); refresh(); setSaved(result.data.id); return; }
    if (!result.conflict || !base.channel) return;
    try { setConflict({ ...base, channel: required(await api.GET("/api/v1/families/{familyId}/channels/{channelId}", { params: { path: { ...path, channelId: base.channel.id } } })) }); } catch { /* The server's message explains the conflict. */ }
  }
  const name = (id: string) => { const member = base.members.find((item) => item.userId === id); return member ? memberName(member) : "Former member"; };
  const changes = conflict ? changedFields(draftOf(base, user.id), draftOf(conflict, user.id), { name: "Name", emoji: "Icon", topic: "Topic", description: "Description", people: "Members" }).map(({ label, value }) => ({ label, value: Array.isArray(value) ? value.map(name).join(", ") : String(value) })) : [];
  return (
    <FormPage dirty={saved === undefined && JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title={editing ? "Save changes" : "Create channel"} onSave={() => void submit()} error={<ErrorText>{conflict ? "" : error}</ErrorText>}
      notice={conflict && <ConflictNotice changes={changes} onKeepMine={() => { const latest = conflict, merged = mergeDraft(draftOf(base, user.id), draft, draftOf(latest, user.id)); setBase(latest); setDraft(merged); setStart(draftOf(latest, user.id)); setConflict(undefined); void submit(latest.channel?.version, merged); }} onUseLatest={() => { const latest = draftOf(conflict, user.id); setBase(conflict); setDraft(latest); setStart(latest); setConflict(undefined); setError(""); }} />}>
      <Field label="Channel name" value={draft.name} maxLength={80} onChangeText={(value) => set({ name: value })} />
      <Select label="Channel icon" value={draft.emoji} onChange={(emoji: string) => set({ emoji })} choices={[...new Set([draft.emoji, "💬", "🏠", "📅", "🎉", "💡", "🌱"])].map((value) => ({ value, label: value }))} />
      <Field label="Topic" value={draft.topic} maxLength={200} onChangeText={(topic) => set({ topic })} />
      <Field label="Description" value={draft.description} maxLength={2000} multiline onChangeText={(description) => set({ description })} />
      <Text weight="600">Members</Text>
      {base.members.map((member) => { const on = draft.people.includes(member.userId), fixed = member.userId === lead; return <Row key={member.userId} multiple title={memberName(member)} note={fixed ? "Channel manager" : undefined} selected={on || fixed} onPress={() => { if (!fixed) set({ people: (on ? draft.people.filter((id) => id !== member.userId) : [...draft.people, member.userId]).sort() }); }} />; })}
    </FormPage>
  );
}
