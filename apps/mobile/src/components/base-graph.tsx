import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { graphHit, graphLayout, graphView, graphWidth, type GraphPoint, type GraphView } from '@/lib/base-graph';
import { baseFacts, connections, kindLabels, singularLabels, type BaseGraph, type BaseKind, type BaseNode } from '@/lib/family-base';
import { motion, useMotion } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import { baseIcons, openBaseNode } from './family-base';
import { Field, Row, Sheet } from './form';
import { MotionPressable } from './motion';
import { Button, Card, Icon, Text } from './ui';

const lightTints: Record<BaseKind, string> = { person: '#55765f', task: '#b5753c', goal: '#8061b2', event: '#477fba', conversation: '#b8607d', file: '#6d7e87', memory: '#b49338', place: '#329185', idea: '#a56ab1' };
const darkTints: Record<BaseKind, string> = { person: '#9fc9aa', task: '#e3ad7d', goal: '#b9a0e7', event: '#8fbfea', conversation: '#e39bb2', file: '#abbfc9', memory: '#dec36f', place: '#80c8bc', idea: '#d5a5df' };

export function FamilyGraph({ graph, matches, timeZone, toolbar, empty }: { graph: BaseGraph; matches: BaseNode[]; timeZone: string; toolbar: ReactNode; empty: ReactNode }) {
  const view = useMemo(() => graphView(graph, matches), [graph, matches]);
  const [selectedId, setSelectedId] = useState(''), [size, setSize] = useState({ width: 0, height: 0 });
  const [panel, setPanel] = useState<'picker' | 'legend'>(), [search, setSearch] = useState('');
  const { colors, dark } = useTheme(), insets = useSafeAreaInsets(), tints = dark ? darkTints : lightTints;
  const fit = size.width / graphWidth, worldHeight = fit ? size.height / fit : 600, compact = size.height < 560;
  const points = useMemo(() => size.width ? graphLayout(view, { height: worldHeight, top: (compact ? 88 : 155) / fit, bottom: ((compact ? 90 : 180) + insets.bottom) / fit, left: 28 / fit, right: 76 / fit }) : [], [view.signature, size.width, size.height, insets.bottom]);
  const selected = view.nodes.find((node) => node.id === selectedId);
  const related = selected ? connections({ ...graph, nodes: view.nodes, links: view.links }, selected.id) : [];
  const choices = view.nodes.filter((node) => (node.name + ' ' + singularLabels[node.kind]).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  useEffect(() => { if (selectedId && !view.nodes.some((node) => node.id === selectedId)) setSelectedId(''); }, [view.signature, selectedId]);
  return <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={(event) => { const { width, height } = event.nativeEvent.layout; setSize((old) => old.width === width && old.height === height ? old : { width, height }); }}>
    {size.width > 0 && size.height > 0 && <GraphCanvas key={view.signature + ':' + Math.round(size.width) + ':' + Math.round(size.height)} width={size.width} height={size.height} worldHeight={worldHeight} view={view} points={points} selectedId={selected?.id ?? ''} onSelect={setSelectedId} tints={tints} />}
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: 12 }}>{toolbar}</View>
    {matches.length === 0 && <View style={{ position: 'absolute', left: 20, right: 20, top: '35%', borderRadius: 20, backgroundColor: colors.panel }}>{empty}</View>}
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: compact ? 80 : 12, bottom: insets.bottom + 12, gap: 8 }}>
      {selected ? <Card style={{ padding: 14, gap: 10, flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'stretch' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, ...(compact ? { flex: 1 } : {}) }}>
          <Icon name={baseIcons[selected.kind]} size={34} color={tints[selected.kind]} />
          <View style={{ flex: 1, gap: 2 }}><Text size={17} weight="700" accessibilityRole="header" numberOfLines={2}>{selected.name}</Text><Text muted size={12}>{singularLabels[selected.kind] + ' · ' + related.length + ' connections in view'}</Text></View>
          <GraphControl label="Clear selection" icon="close" onPress={() => setSelectedId('')} />
        </View>
        {!compact && baseFacts(selected, timeZone).length > 0 && <Text muted size={12} numberOfLines={1}>{baseFacts(selected, timeZone).join(' · ')}</Text>}
        {compact ? <GraphControl label="Open record" icon="arrow-forward-outline" onPress={() => openBaseNode(selected)} /> : <Button title="Open record" icon="arrow-forward-outline" onPress={() => openBaseNode(selected)} />}
      </Card> : matches.length > 0 && <MotionPressable accessibilityRole="button" accessibilityLabel="Choose a record" onPress={() => { setSearch(''); setPanel('picker'); }} style={({ pressed }) => ({ minHeight: 72, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.panel, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
        <Icon name="git-network-outline" size={38} color={colors.primary} /><View style={{ flex: 1, gap: 3 }}><Text weight="600">Explore your family</Text><Text muted size={12}>Tap a node or browse records</Text></View><Icon name="chevron-forward" size={19} color={colors.mutedForeground} />
      </MotionPressable>}
    </View>
    <View style={{ position: 'absolute', right: 12, top: compact ? 88 : 166 }}><GraphControl label="Graph legend" icon="information-circle-outline" onPress={() => setPanel('legend')} /></View>
    {selected && <View style={{ position: 'absolute', left: 12, top: compact ? 88 : 166 }}><GraphControl label="Choose a record" icon="list-outline" onPress={() => { setSearch(''); setPanel('picker'); }} /></View>}
    {panel === 'picker' && <Sheet title="Choose a record" onClose={() => setPanel(undefined)}>
      <Field label="Find a record" value={search} onChangeText={setSearch} maxLength={120} placeholder="A name or record type" />
      {choices.map((node) => <Row key={node.id} title={node.name} note={singularLabels[node.kind]} selected={selectedId === node.id} onPress={() => { setSelectedId(node.id); setPanel(undefined); }} />)}
      {!choices.length && <Text muted>No matching records in this view.</Text>}
    </Sheet>}
    {panel === 'legend' && <Sheet title="About this graph" onClose={() => setPanel(undefined)}>
      <Text muted>Drag to move. Pinch or use + / − to zoom. Tap a node to highlight its connections.</Text>
      {Object.entries(tints).filter(([kind]) => view.nodes.some((node) => node.kind === kind)).map(([kind, tint]) => <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tint }} /><Text>{kindLabels[kind as BaseKind]}</Text><Text muted size={13}>{String(view.nodes.filter((node) => node.kind === kind).length)}</Text></View>)}
      <Text muted size={13}>{view.nodes.length + ' records · ' + view.links.length + ' connections in this view'}</Text>
      {view.omittedNodes > 0 && <Text muted size={13}>{'Showing ' + view.nodes.length + ' of ' + matches.length + ' matches. Search, filter or switch to List to find the rest.'}</Text>}
      {view.omittedLinks > 0 && <Text muted size={13}>Some connections are outside the display limit. Open a record to see more.</Text>}
      {!view.links.length && <Text muted size={13}>These matches have no connections to each other.</Text>}
    </Sheet>}
  </View>;
}

function GraphCanvas({ width, height, worldHeight, view, points, selectedId, onSelect, tints }: { width: number; height: number; worldHeight: number; view: GraphView; points: GraphPoint[]; selectedId: string; onSelect: (id: string) => void; tints: Record<BaseKind, string> }) {
  const fit = width / graphWidth;
  const { colors } = useTheme(), { reduced } = useMotion();
  const zoom = useSharedValue(fit), panX = useSharedValue(0), panY = useSharedValue(0), startX = useSharedValue(0), startY = useSharedValue(0);
  const pinchScale = useSharedValue(fit), pinchX = useSharedValue(0), pinchY = useSharedValue(0), focalX = useSharedValue(0), focalY = useSharedValue(0);
  const [percent, setPercent] = useState(100);
  const byId = new Map(points.map((point) => [point.id, point])), nodesById = new Map(view.nodes.map((node) => [node.id, node]));
  const connected = new Set<string>(selectedId ? [selectedId] : []);
  if (selectedId) for (const link of view.links) { if (link.source === selectedId) connected.add(link.target); if (link.target === selectedId) connected.add(link.source); }
  const chooseAt = useCallback((x: number, y: number, scale: number, dx: number, dy: number) => { onSelect(graphHit(points, x, y, width, height, scale, dx, dy, worldHeight) ?? ''); }, [points, width, height, worldHeight, onSelect]);
  const report = useCallback((scale: number) => setPercent(Math.round(scale / fit * 100)), [fit]);
  const pan = usePanGesture({ minDistance: 8, maxPointers: 1,
    onActivate: (event) => { 'worklet'; cancelAnimation(panX); cancelAnimation(panY); startX.value = panX.value - event.translationX; startY.value = panY.value - event.translationY; },
    onUpdate: (event) => { 'worklet'; panX.value = Math.max(-graphWidth * zoom.value / 2, Math.min(graphWidth * zoom.value / 2, startX.value + event.translationX)); panY.value = Math.max(-worldHeight * zoom.value / 2, Math.min(worldHeight * zoom.value / 2, startY.value + event.translationY)); },
  });
  const pinch = usePinchGesture({
    onActivate: (event) => { 'worklet'; cancelAnimation(zoom); cancelAnimation(panX); cancelAnimation(panY); pinchScale.value = zoom.value; pinchX.value = panX.value; pinchY.value = panY.value; focalX.value = event.focalX - width / 2; focalY.value = event.focalY - height / 2; },
    onUpdate: (event) => { 'worklet'; const next = Math.max(fit, Math.min(fit * 4, pinchScale.value * event.scale)); zoom.value = next; panX.value = event.focalX - width / 2 - (focalX.value - pinchX.value) * next / pinchScale.value; panY.value = event.focalY - height / 2 - (focalY.value - pinchY.value) * next / pinchScale.value; },
    onDeactivate: () => { 'worklet'; scheduleOnRN(report, zoom.value); },
  });
  const tap = useTapGesture({ maxDistance: 8, onDeactivate: (event) => { 'worklet'; if (!event.canceled) scheduleOnRN(chooseAt, event.x, event.y, zoom.value, panX.value, panY.value); } });
  const move = useSimultaneousGestures(pan, pinch), gesture = useExclusiveGestures(move, tap);
  const transform = useAnimatedStyle(() => ({ transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }] }));
  const animate = (value: number) => withTiming(value, { duration: reduced ? 0 : motion.change, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.Never });
  function changeZoom(factor: number) { const next = Math.max(fit, Math.min(fit * 4, zoom.value * factor)); panX.value = animate(panX.value * next / zoom.value); panY.value = animate(panY.value * next / zoom.value); zoom.value = animate(next); report(next); }
  function reset() { zoom.value = animate(fit); panX.value = animate(0); panY.value = animate(0); setPercent(100); }
  return <>
    <GestureDetector gesture={gesture} touchAction="none">
      <View testID="family-base-graph" accessibilityRole="image" accessibilityLabel={'Family Base graph, ' + view.nodes.length + ' records and ' + view.links.length + ' connections. Choose a record or switch to List to browse.'} style={{ width, height, overflow: 'hidden', backgroundColor: colors.background }}>
        <Animated.View testID="base-graph-transform" style={[{ position: 'absolute', left: (width - graphWidth) / 2, top: (height - worldHeight) / 2, width: graphWidth, height: worldHeight }, transform]}>
          <Svg width={graphWidth} height={worldHeight} aria-hidden pointerEvents="none">
            {view.links.map((link, index) => { const from = byId.get(link.source)!, to = byId.get(link.target)!, active = selectedId && (link.source === selectedId || link.target === selectedId); return <Line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={active ? colors.primary : colors.mutedForeground} strokeWidth={active ? 3 : 1.8} opacity={selectedId ? active ? 0.75 : 0.07 : 0.2} />; })}
            {points.map((point) => { const node = nodesById.get(point.id)!, active = point.id === selectedId, near = connected.has(point.id), label = node.kind === 'person' || active;
              return <G key={point.id} testID={'base-node-' + point.id} opacity={selectedId && !near ? 0.2 : 1}>
                {active && <Circle cx={point.x} cy={point.y} r={point.radius + 10} fill={colors.panel} stroke={tints[node.kind]} strokeWidth={2.5} />}
                <Circle cx={point.x} cy={point.y} r={point.radius} fill={tints[node.kind]} stroke={colors.panel} strokeWidth={3} />
                {node.kind === 'person' && <SvgText x={point.x} y={point.y + 7} textAnchor="middle" fontSize={21} fontWeight="600" fill={colors.panel}>{node.name.slice(0, 1)}</SvgText>}
                {label && <SvgText x={point.x} y={point.y + point.radius + 14 / fit} textAnchor={point.x < graphWidth * 0.15 ? 'start' : point.x > graphWidth * 0.85 ? 'end' : 'middle'} fontSize={12 / fit} fontWeight={active ? '700' : '500'} fill={colors.foreground}>{(node.kind === 'person' ? node.name.split(' ')[0] : node.name).slice(0, 22) + (node.kind !== 'person' && node.name.length > 22 ? '…' : '')}</SvgText>}
              </G>;
            })}
          </Svg>
        </Animated.View>
      </View>
    </GestureDetector>
    <View style={{ position: 'absolute', right: 12, top: height < 560 ? 144 : 224, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 3, backgroundColor: colors.panel, gap: 3 }}>
      <GraphControl label="Zoom in" icon="add" disabled={percent >= 400} onPress={() => changeZoom(1.4)} />
      <GraphControl label="Zoom out" icon="remove" disabled={percent <= 100} onPress={() => changeZoom(1 / 1.4)} />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <GraphControl label="Fit graph" icon="scan-outline" onPress={reset} />
      <Text muted size={10} style={{ textAlign: 'center', paddingBottom: 5 }} accessibilityLiveRegion="polite">{percent + '%'}</Text>
    </View>
  </>;
}

function GraphControl({ label, icon, disabled, onPress }: { label: string; icon: 'add' | 'remove' | 'scan-outline' | 'close' | 'information-circle-outline' | 'list-outline' | 'arrow-forward-outline'; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.accent : colors.panel, opacity: disabled ? 0.35 : 1 })}><Icon name={icon} size={21} color={colors.primary} /></MotionPressable>;
}
