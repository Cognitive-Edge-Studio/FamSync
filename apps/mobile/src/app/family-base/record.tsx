import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { BaseRow } from '@/components/family-base';
import { Page, queryState, WithFamily } from '@/components/screen';
import { Button, Card, Notice, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { useBaseQuery } from '@/lib/base-query';
import type { Family } from '@/lib/family';
import { baseFacts, baseTarget, connections, singularLabels } from '@/lib/family-base';
import { useSignedIn } from '@/lib/session';

export default function BaseRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: 'Connected records' }} /><WithFamily>{(family) => <Detail key={family.id + id} family={family} id={id} />}</WithFamily></>;
}
function Detail({ family, id }: { family: Family; id: string }) {
  const { access_token } = useSignedIn();
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET('/api/v1/families/{familyId}/base/graph', { params: { path: { familyId: family.id } }, signal }).then(required), [access_token, family.id]);
  const query = useBaseQuery(family.id, 'base-record:' + id, load), graph = query.data;
  const state = queryState(query, { loading: 'Opening connections…', failed: 'This record couldn’t load', lost: 'Record unavailable' });
  if (state || !graph) return state;
  const node = graph.nodes.find((node) => node.id === id);
  if (!node) return <Notice icon="lock-closed-outline" title="Record unavailable" action={{ title: 'Open Family Base', onPress: () => router.replace('/family-base' as Parameters<typeof router.replace>[0]) }}>It may have been removed, become private, or be outside the records currently shown. Open its module to check.</Notice>;
  const connected = connections(graph, node.id);
  return <Page query={query}><Card><Text muted size={13}>{singularLabels[node.kind]}</Text><Text size={21} weight="700">{node.name}</Text>{baseFacts(node, family.timeZone).map((fact) => <Text key={fact} muted>{fact}</Text>)}
    <Button title={node.kind === 'person' ? 'Open family' : 'Open ' + singularLabels[node.kind].toLowerCase()} onPress={() => router.push(baseTarget(node) as Parameters<typeof router.push>[0])} /></Card>
    <Text weight="600" accessibilityRole="header">Connected records</Text>{connected.length ? connected.map(({ node, relation }) => <BaseRow key={node.id} node={node} relation={relation} timeZone={family.timeZone} />) : <Text muted>No visible connections.</Text>}
  </Page>;
}
