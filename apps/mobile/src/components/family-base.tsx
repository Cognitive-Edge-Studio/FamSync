import { router } from 'expo-router';
import { View } from 'react-native';
import { baseFacts, isEntryKind, singularLabels, type BaseKind, type BaseNode } from '@/lib/family-base';
import { useTheme } from '@/lib/theme';
import { Icon, Text, type IconName } from './ui';
import { MotionPressable } from './motion';

export const baseIcons: Record<BaseKind, IconName> = { person: 'person-outline', task: 'checkbox-outline', goal: 'flag-outline', event: 'calendar-outline', conversation: 'chatbubbles-outline', file: 'document-outline', memory: 'heart-outline', place: 'location-outline', idea: 'bulb-outline' };
export function openBaseNode(node: BaseNode) {
  router.push((isEntryKind(node.kind) ? { pathname: '/family-base/entry', params: { id: node.recordId } } : { pathname: '/family-base/record', params: { id: node.id } }) as Parameters<typeof router.push>[0]);
}
export function BaseRow({ node, timeZone, relation }: { node: BaseNode; timeZone: string; relation?: string }) {
  const { colors } = useTheme(), facts = [relation, singularLabels[node.kind], ...baseFacts(node, timeZone)].filter(Boolean).join(' · ');
  return <MotionPressable accessibilityRole="button" accessibilityLabel={node.name + ', ' + facts} onPress={() => openBaseNode(node)} style={({ pressed }) => ({ minHeight: 76, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: pressed ? colors.accent : colors.panel })}>
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' }}><Icon name={baseIcons[node.kind]} size={22} color={colors.primary} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text weight="600">{node.name}</Text><Text muted size={13} numberOfLines={2}>{facts}</Text>{node.note && <Text muted size={13} numberOfLines={1}>{node.note}</Text>}</View>
    <Icon name="chevron-forward" size={18} color={colors.mutedForeground} />
  </MotionPressable>;
}
