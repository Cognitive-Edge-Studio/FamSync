import type { components } from '@famsync/api-client';
import { dayInZone } from '@famsync/core/calendar-date';
import { changedFields, mergeDraft } from '@famsync/core/forms';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AudienceFields, DateField, ErrorText, Field, Row, Select } from '@/components/form';
import { ConflictNotice, FormPage, queryState, WithFamily } from '@/components/screen';
import { Button, Card, Notice, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { useBaseQuery } from '@/lib/base-query';
import type { Family } from '@/lib/family';
import { entryDraft, entryFields, entryKinds, entryProblem, entrySignature, linkChoices, linkKey, singularLabels, type BaseGraph, type EntryDraft, type EntryKind, type FamilyEntry } from '@/lib/family-base';
import { useSave } from '@/lib/save';
import { useSignedIn } from '@/lib/session';

type Ready = { graph: BaseGraph; members: components['schemas']['FamilyMemberDto'][]; defaults: components['schemas']['FamilyEntryDefaultsDto']; entry?: FamilyEntry };
const fieldLabels = { kind: 'Kind', title: 'Title', note: 'Note', happenedOn: 'Date', location: 'Location', audience: 'Who can see it', selected: 'Selected members', links: 'Connections' };
export default function EntryForm() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const initialKind = entryKinds.find((value) => value === kind) ?? 'memory';
  return <><Stack.Screen options={{ title: id ? 'Edit entry' : 'New entry' }} /><WithFamily>{(family) => <Load key={family.id + (id ?? 'new')} family={family} id={id} kind={initialKind} />}</WithFamily></>;
}
function Load({ family, id, kind }: { family: Family; id?: string; kind: EntryKind }) {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), path = { familyId: family.id };
    const [graph, members, defaults, entry] = await Promise.all([
      api.GET('/api/v1/families/{familyId}/base/graph', { params: { path }, signal }).then(required),
      api.GET('/api/v1/families/{familyId}/members', { params: { path }, signal }).then(required),
      api.GET('/api/v1/families/{familyId}/base/entries/defaults', { params: { path }, signal }).then(required),
      id ? api.GET('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path: { ...path, entryId: id } }, signal }).then(required) : undefined,
    ]);
    return { graph, members, defaults, entry };
  }, [access_token, family.id, id]);
  const query = useBaseQuery(family.id, 'base-form:' + (id ?? 'new'), load), opened = useRef<Ready | null>(null);
  if (query.data && !query.error) opened.current ??= query.data;
  if (query.error === 'lost') return queryState(query, { loading: 'Opening form…', failed: 'The form couldn’t open', lost: 'Entry unavailable' });
  if (query.data?.entry && !query.data.entry.canEdit) return <Notice icon="lock-closed-outline" title="Only the author can edit this entry" action={{ title: 'Go back', onPress: () => router.back() }} />;
  if (opened.current) return <Form family={family} first={opened.current} live={query.error ? undefined : query.data} initialKind={kind} reload={query.refresh} />;
  return queryState(query, { loading: 'Opening form…', failed: 'The form couldn’t open', lost: 'Entry unavailable' });
}
function Form({ family, first, live, initialKind, reload }: { family: Family; first: Ready; live?: Ready; initialKind: EntryKind; reload: () => void }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave();
  const [base, setBase] = useState(first), [draft, setDraft] = useState(() => entryDraft(first.entry, first.defaults.audience, initialKind)), [start, setStart] = useState(draft), [filter, setFilter] = useState(''), [conflict, setConflict] = useState<Ready>(), [saved, setSaved] = useState<string>(), [note, setNote] = useState('');
  const newId = useRef(''), current = live ?? base, members = current.members, memberIds = members.map((member) => member.userId), choices = linkChoices(current.graph, current.entry ?? base.entry), byKey = new Map(choices.map((choice) => [linkKey(choice), choice]));
  const selected = new Set(draft.links.map(linkKey)), shown = choices.filter((choice) => !selected.has(linkKey(choice)) && (!filter.trim() || choice.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))), unavailable = draft.links.some((link) => !byKey.has(linkKey(link)));
  const set = (change: Partial<EntryDraft>) => { setNote(''); setDraft((old) => ({ ...old, ...change })); };
  useEffect(() => {
    if (!saved) return;
    if (first.entry) router.back();
    else router.replace({ pathname: '/family-base/entry', params: { id: saved } } as Parameters<typeof router.replace>[0]);
  }, [saved, first.entry]);

  async function submit(version = base.entry?.version, values = draft, context = current) {
    const people = context.members.map((member) => member.userId), problem = entryProblem(values, people, user.id, base.entry?.id);
    if (problem) return setError(problem);
    const known = new Set(linkChoices(context.graph, context.entry ?? base.entry).map(linkKey)), fields = entryFields(values, people, user.id);
    fields.links = fields.links.filter((link) => known.has(linkKey(link)));
    newId.current ||= randomUUID();
    const api = getApi(access_token), path = { familyId: family.id }, entry = base.entry;
    const result = entry ? await save(() => api.PUT('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path: { ...path, entryId: entry.id } }, body: { ...fields, version: version! } }), 'We couldn’t save the entry. Try again.')
      : await save(() => api.POST('/api/v1/families/{familyId}/base/entries', { params: { path }, body: { ...fields, id: newId.current } }), 'We couldn’t create the entry. Try again.');
    if (result.ok) {
      setConflict(undefined);
      if (!entry && entrySignature(entryFields(entryDraft(result.data), people, user.id)) !== entrySignature(fields)) {
        // A retry may recover the first successful create after its response was lost. Keep newer edits on screen.
        setBase({ ...context, entry: result.data }); setStart(entryDraft(result.data)); setNote('The saved entry was recovered. Your current changes are still here; save them to update it.'); reload(); return;
      }
      setSaved(result.data.id); return;
    }
    if (result.gone) { reload(); return; }
    if (!result.conflict || !entry) return;
    try {
      const latest = required(await api.GET('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path: { ...path, entryId: entry.id } } }));
      setConflict({ ...context, entry: latest });
    } catch { /* The save error remains visible, and the draft is kept. */ }
  }
  const changes = conflict ? changedFields(entryDraft(base.entry), entryDraft(conflict.entry), fieldLabels).map(({ key, label, value }) => ({ label, value: key === 'selected' ? (value as string[]).map((id) => members.find((member) => member.userId === id)?.firstName ?? 'Former member').join(', ') : key === 'links' ? (value as EntryDraft['links']).map((link) => byKey.get(linkKey(link))?.name ?? 'Unavailable link').join(', ') : String(value) })) : [];
  return <FormPage dirty={!saved && JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title={base.entry ? 'Save changes' : 'Create entry'} onSave={() => void submit()} error={<><ErrorText>{conflict ? '' : error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}</>}
    notice={conflict && <ConflictNotice changes={changes} onUseLatest={() => { setBase(conflict); const latest = entryDraft(conflict.entry); setDraft(latest); setStart(latest); setConflict(undefined); setError(''); }} onKeepMine={() => { const latest = conflict, merged = mergeDraft(entryDraft(base.entry), draft, entryDraft(latest.entry)); setBase(latest); setDraft(merged); setStart(entryDraft(latest.entry)); setConflict(undefined); void submit(latest.entry?.version, merged, latest); }} />}>
    <Stack.Screen options={{ title: base.entry ? 'Edit entry' : 'New entry' }} />
    <Select label="Entry kind" value={draft.kind} onChange={(kind) => set({ kind })} choices={entryKinds.map((value) => ({ value, label: singularLabels[value] }))} />
    <Field label="Entry title" value={draft.title} maxLength={120} onChangeText={(title) => set({ title })} />
    <Field label="Note" value={draft.note} maxLength={2000} multiline onChangeText={(note) => set({ note })} />
    {draft.kind === 'memory' && <DateField label="Date (optional)" value={draft.happenedOn} optional today={dayInZone(new Date(), family.timeZone)} onChange={(happenedOn) => set({ happenedOn })} />}
    {draft.kind === 'place' && <Field label="Location" value={draft.location} maxLength={200} onChangeText={(location) => set({ location })} placeholder="Address or a description" />}
    <AudienceFields noun="entry" audience={draft.audience} selected={draft.selected.filter((id) => memberIds.includes(id))} members={members} me={user.id} onAudience={(audience) => set({ audience })} onSelected={(selected) => set({ selected })} />
    <Card><Text weight="600">Connections</Text><Text muted size={13}>Linking does not share anything. People see a connection only when they can already see both records.</Text>
      <Text muted size={13}>{draft.links.length + '/50 selected'}</Text>
      {draft.links.map((link) => <Row key={linkKey(link)} multiple title={byKey.get(linkKey(link))?.name ?? 'Unavailable link'} note={byKey.get(linkKey(link))?.label} selected onPress={() => set({ links: draft.links.filter((value) => linkKey(value) !== linkKey(link)) })} />)}
      {unavailable && <Text muted size={13}>Some connections are no longer available. They will not be added again; existing hidden links are preserved by the server.</Text>}
      <Field label="Find a connection" value={filter} maxLength={120} onChangeText={setFilter} placeholder="A person, goal, event or entry" />
      {shown.slice(0, 30).map((choice) => <Row key={linkKey(choice)} multiple title={choice.name} note={choice.label} selected={false} onPress={() => { if (draft.links.length >= 50) return setError('An entry can have up to 50 links.'); set({ links: [...draft.links, { kind: choice.kind, id: choice.id }] }); }} />)}
      {!shown.length && <Text muted>No matching connections.</Text>}{shown.length > 30 && <Text muted size={13}>Showing 30 matches. Search to narrow the list.</Text>}
    </Card>
  </FormPage>;
}
