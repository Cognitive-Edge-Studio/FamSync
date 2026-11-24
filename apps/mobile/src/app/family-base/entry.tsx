import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { BaseRow } from '@/components/family-base';
import { ErrorText } from '@/components/form';
import { confirm, Page, queryState, WithFamily } from '@/components/screen';
import { Button, Card, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { useBaseQuery } from '@/lib/base-query';
import type { Family } from '@/lib/family';
import { connections, entryLinkTarget, isEntryKind, linkKey, singularLabels } from '@/lib/family-base';
import { useSave } from '@/lib/save';
import { useSignedIn } from '@/lib/session';

const audiences = { family: 'Family', selected: 'Selected members', private: 'Only me' };
export default function BaseEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: 'Family entry' }} /><WithFamily>{(family) => <Detail key={family.id + id} family={family} id={id} />}</WithFamily></>;
}
function Detail({ family, id }: { family: Family; id: string }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave();
  const path = { familyId: family.id, entryId: id };
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token);
    const [entry, graph] = await Promise.all([
      api.GET('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path: { familyId: family.id, entryId: id } }, signal }).then(required),
      api.GET('/api/v1/families/{familyId}/base/graph', { params: { path: { familyId: family.id } }, signal }).then(required),
    ]);
    return { entry, graph };
  }, [access_token, family.id, id]);
  const query = useBaseQuery(family.id, 'base-entry:' + id, load), data = query.data;
  const state = queryState(query, { loading: 'Opening entry…', failed: 'The entry couldn’t load', lost: 'Entry unavailable' });
  if (state || !data) return state;
  const { entry, graph } = data, listed = new Set(entry.links.map(linkKey));
  const extra = connections(graph, entry.kind + ':' + id).filter(({ node }) => !listed.has(linkKey({ kind: isEntryKind(node.kind) ? 'entry' : node.kind as 'person' | 'goal' | 'event', id: node.recordId })));
  async function remove() {
    const result = await save(() => getApi(access_token).DELETE('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path }, body: { version: entry.version } }), 'We couldn’t delete this entry. Try again.');
    if (result.ok) router.replace('/family-base' as Parameters<typeof router.replace>[0]);
    else if (result.conflict || result.gone) query.refresh();
  }
  return <Page query={query}><ErrorText>{error}</ErrorText>
    <Card><Text muted size={13}>{singularLabels[entry.kind] + ' · ' + audiences[entry.audience]}</Text><Text size={22} weight="700">{entry.title}</Text>
      {entry.happenedOn && <Text muted>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(entry.happenedOn + 'T00:00:00Z'))}</Text>}
      {entry.location ? <Text selectable>{entry.location}</Text> : null}{entry.note ? <Text selectable>{entry.note}</Text> : <Text muted>No note added.</Text>}
      {entry.canEdit ? <Button title="Edit entry" onPress={() => router.push({ pathname: '/family-base/form', params: { id } } as Parameters<typeof router.push>[0])} /> : <Text muted size={13}>Only the author can edit or delete this entry.</Text>}
    </Card>
    <Text weight="600" accessibilityRole="header">Connected records</Text><Text muted size={13}>Links do not share their targets. Only connections you can already access appear here.</Text>
    {!entry.links.length && !extra.length && <Text muted>No visible connections.</Text>}
    {entry.links.map((link) => <Button key={linkKey(link)} variant="outline" title={link.name} onPress={() => router.push(entryLinkTarget(link) as Parameters<typeof router.push>[0])} />)}
    {extra.map(({ node, relation }) => <BaseRow key={node.id} node={node} relation={relation} timeZone={family.timeZone} />)}
    {entry.canEdit && <Button variant="outline" title="Delete entry" busy={busy} onPress={() => confirm('Delete this ' + entry.kind + '?', 'This permanently removes the entry and its connections. Connected people, goals, events and other entries stay.', 'Delete', () => void remove())} />}
  </Page>;
}
