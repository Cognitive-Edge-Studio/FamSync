import { Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BaseRow } from '@/components/family-base';
import { FamilyGraph } from '@/components/base-graph';
import { MotionPressable } from '@/components/motion';
import { Field, Select, Sheet } from '@/components/form';
import { Chips, queryState, StaleNotice, WithFamily } from '@/components/screen';
import { Button, Icon, Notice, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { getApi, required } from '@/lib/api';
import { useBaseQuery } from '@/lib/base-query';
import type { Family } from '@/lib/family';
import { baseKinds, filterBase, kindLabels, visibleLinks, type BaseKind } from '@/lib/family-base';
import { useSignedIn } from '@/lib/session';

export default function FamilyBase() {
  const { colors } = useTheme();
  return <><Stack.Screen options={{ title: 'Family Base', headerRight: () => <View style={{ flexDirection: 'row' }}><MotionPressable accessibilityRole="button" accessibilityLabel="Call Family Base" onPress={() => router.push('/family-base/call' as Parameters<typeof router.push>[0])} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="call-outline" size={22} color={colors.foreground} /></MotionPressable><MotionPressable accessibilityRole="button" accessibilityLabel="Ask Family Base" onPress={() => router.push('/family-base/ask' as Parameters<typeof router.push>[0])} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles-outline" size={22} color={colors.foreground} /></MotionPressable><MotionPressable accessibilityRole="button" accessibilityLabel="Add an entry" onPress={() => router.push('/family-base/form' as Parameters<typeof router.push>[0])} style={{ minWidth: 56, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}><Icon name="add-outline" size={25} color={colors.primary} /></MotionPressable></View> }} /><WithFamily>{(family) => <Browse key={family.id} family={family} />}</WithFamily></>;
}
function Browse({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), insets = useSafeAreaInsets(), { colors } = useTheme(), compact = useWindowDimensions().height < 600;
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET('/api/v1/families/{familyId}/base/graph', { params: { path: { familyId: family.id } }, signal }).then(required), [access_token, family.id]);
  const query = useBaseQuery(family.id, 'base-graph', load), graph = query.data;
  const [term, setTerm] = useState(''), [kind, setKind] = useState<BaseKind | 'all'>('all'), [person, setPerson] = useState('');
  const [mode, setMode] = useState<'graph' | 'list'>('graph'), [filters, setFilters] = useState(false);
  const shown = useMemo(() => graph ? filterBase(graph, term, kind, person) : [], [graph, term, kind, person]);
  const state = queryState(query, { loading: 'Opening Family Base…', failed: 'Family Base couldn’t load', lost: 'Family Base unavailable' });
  if (state || !graph) return state;
  const active = !!(term || kind !== 'all' || person);
  const clear = () => { setTerm(''); setKind('all'); setPerson(''); };
  const empty = <Notice icon="search-outline" title="No matches" action={{ title: 'Clear filters', onPress: clear }}>Try another name or show all record types.</Notice>;
  const modeSwitch = <Chips label="Family Base view" value={mode} onChange={setMode} choices={[{ value: 'graph', label: 'Graph' }, { value: 'list', label: 'List' }]} />;
  const filterFields = <>
    <Field label="Search Family Base" value={term} maxLength={120} onChangeText={setTerm} placeholder="Names, notes or places" />
    <Select label="Show" value={kind} onChange={setKind} choices={[{ value: 'all' as const, label: 'All records' }, ...baseKinds.map((value) => ({ value, label: kindLabels[value] }))]} />
    <Select label="Connected to" value={person} onChange={setPerson} choices={[{ value: '', label: 'Anyone' }, ...graph.nodes.filter((node) => node.kind === 'person').map((node) => ({ value: node.id, label: node.name + (node.you ? ' (you)' : '') }))]} />
    <Text muted size={13} accessibilityLiveRegion="polite">{shown.length + (shown.length === 1 ? ' match' : ' matches')}</Text>
    {active && <Button title="Clear filters" variant="ghost" onPress={clear} />}
  </>;
  const searchButton = <MotionPressable accessibilityRole="button" accessibilityLabel={active ? 'Search and filters, active' : 'Search and filters'} onPress={() => setFilters(true)} style={({ pressed }) => ({ minWidth: 48, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || active ? colors.accent : colors.panel, borderWidth: 1, borderColor: active ? colors.primary : colors.border })}><Icon name="search-outline" size={22} color={colors.primary} />{active && <View style={{ position: 'absolute', right: 8, top: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />}</MotionPressable>;
  const toolbar = <View style={{ gap: 10 }}>
    <View style={{ borderRadius: 20, padding: compact ? 8 : 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}><Text size={18} weight="700" numberOfLines={1}>{graph.familyName}</Text><Text muted size={12} accessibilityLiveRegion="polite">{active ? shown.length + ' matches · Filtered' : graph.nodes.length + ' records · ' + visibleLinks(graph).length + ' connections'}</Text></View>{compact && modeSwitch}{searchButton}
    </View>
    {!compact && <View style={{ alignSelf: 'flex-start', borderRadius: 16, padding: 4, backgroundColor: colors.panel }}>{modeSwitch}</View>}
    {query.error && <View style={{ borderRadius: 12, backgroundColor: colors.peach, padding: 10 }}><Text size={12} style={{ color: colors.onPeach }}>This graph may be out of date. Open search to retry.</Text></View>}
  </View>;
  const sheet = filters && <Sheet title="Search and filters" onClose={() => setFilters(false)}><View style={{ gap: 16 }}>
    <StaleNotice query={query} />{filterFields}
    {graph.truncated.length > 0 && <Text muted size={13}>{'The server is showing a limited set of ' + graph.truncated.map((value) => kindLabels[value].toLowerCase()).join(', ') + '. Their modules may contain more.'}</Text>}
    <Button title="Show results" onPress={() => setFilters(false)} />
    <Button title="Refresh Family Base" variant="outline" busy={query.loading} icon="refresh-outline" onPress={query.refresh} />
  </View></Sheet>;
  return <View style={{ flex: 1 }}>
    {mode === 'graph' ? <FamilyGraph graph={graph} matches={shown} timeZone={family.timeZone} toolbar={toolbar} empty={empty} />
      : <FlatList data={shown} keyExtractor={(node) => node.id} renderItem={({ item }) => <BaseRow node={item} timeZone={family.timeZone} />} keyboardShouldPersistTaps="handled" refreshing={query.loading} onRefresh={query.refresh}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }} ListHeaderComponent={<View style={{ gap: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>{modeSwitch}{searchButton}</View>
          <Text size={20} weight="700">{graph.familyName}</Text><StaleNotice query={query} />
          <Field label="Search Family Base" value={term} maxLength={120} onChangeText={setTerm} placeholder="Names, notes or places" />
          <Text muted size={13}>{shown.length + (shown.length === 1 ? ' match' : ' matches')}</Text>
          {active && <Button title="Clear filters" variant="ghost" onPress={clear} />}
        </View>} ListEmptyComponent={empty} />}
    {sheet}
  </View>;
}
