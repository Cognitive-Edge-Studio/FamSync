"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';
import { ArrowUpRight, ChevronDown, Maximize2, Orbit, Pause, Pencil, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { getBrowserApi } from '@/lib/browser-auth';
import {
  endpointId, loadFamilyBaseGraph, openLabel, recordFacts, recordHref, relationLabel, toUniverse, universeGroups,
  type FamilyBaseGraph, type UniverseGroup, type FamilyBaseRecord, type UniverseLink, type UniverseNode,
} from '@/lib/family-base';
import { cn } from '@/lib/utils';
import { FamilyAskDialog, type FamilyAnswer } from './family-ask-dialog';
import { FamilyEntryDialog } from './family-entry-dialog';
import { familyError } from './family-session';
import { Avatar } from './ui/avatar';
import { useThemePreference } from './theme-menu';

const darkButton = 'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-panel/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40';
const surface = 'relative isolate min-h-0 flex-1 overflow-hidden bg-[#f4f6f3] dark:bg-[#08101e] text-foreground';

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="status" className="grid h-full place-content-center gap-3 px-6 text-center text-foreground">
      <Orbit className="mx-auto size-10 text-primary" aria-hidden="true" />
      <p className="font-medium">The 3D view is unavailable in this browser.</p>
      <p className="max-w-sm text-sm text-muted-foreground">You can still search and explore your family’s connections using the node list below.</p>
    </div> : this.props.children;
  }
}

type Props = { familyId: string; accessToken: string; timeZone: string };

/** Loads the caller’s visible family records and renders them; the graph itself lives in {@link Universe}. */
export default function FamilyBaseUniverse({ familyId, accessToken, timeZone }: Props) {
  // Each load remounts the universe, so a saved entry can be selected as soon as it arrives.
  const [loaded, setLoaded] = useState<{ graph: FamilyBaseGraph; load: number; focusId: string | null }>();
  const [editing, setEditing] = useState<{ entryId?: string }>();
  const [answer, setAnswer] = useState<FamilyAnswer>();
  const focusAfterLoad = useRef<string | null>(null);
  const token = useRef(accessToken);
  token.current = accessToken;
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    loadFamilyBaseGraph(getBrowserApi(token.current), familyId, controller.signal)
      .then(data => { if (controller.signal.aborted) return;
        setLoaded({ graph: data, load: revision, focusId: focusAfterLoad.current });
        focusAfterLoad.current = null;
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error && cause.message === 'not-found' ? 'Family workspace not found.' : 'We couldn’t load your Family Base.');
      });
    return () => controller.abort();
  }, [familyId, revision]);

  function reload(focusId: string | null) { focusAfterLoad.current = focusId; setRevision(value => value + 1); }

  async function remove(record: FamilyBaseRecord) {
    const fallback = 'We couldn’t delete this. Try again.';
    try {
      const api = getBrowserApi(token.current);
      const path = { familyId, entryId: record.recordId };
      const entry = await api.GET('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path } });
      if (!entry.data) return fallback;
      const result = await api.DELETE('/api/v1/families/{familyId}/base/entries/{entryId}', { params: { path }, body: { version: entry.data.version } });
      if (!result.data) return familyError(result.error, fallback);
      reload(null);
      return '';
    } catch { return fallback; }
  }

  if (error) return <section aria-label="Family Base" className={cn(surface, 'grid place-content-center gap-3 px-6 text-center')}>
    <p role="alert" className="font-medium">{error}</p>
    <button type="button" className={cn(darkButton, 'mx-auto')} onClick={() => setRevision(value => value + 1)}><RefreshCw aria-hidden="true" className="size-3.5" />Try again</button>
  </section>;
  if (!loaded) return <div role="status" className={cn(surface, 'grid place-items-center text-sm text-muted-foreground')}>Gathering your family’s connections…</div>;
  return <>
    <Universe key={loaded.load} graph={loaded.graph} focusId={loaded.focusId} familyId={familyId} accessToken={accessToken} timeZone={timeZone} answer={answer} onAnswer={setAnswer}
      onRefresh={() => reload(null)} onAdd={() => setEditing({})} onEdit={record => setEditing({ entryId: record.recordId })} onDelete={remove} />
    {editing && <FamilyEntryDialog graph={loaded.graph} familyId={familyId} accessToken={accessToken} entryId={editing.entryId}
      onClose={() => setEditing(undefined)} onSaved={entry => { setEditing(undefined); reload(entry.kind + ':' + entry.id); }} />}
  </>;
}

function Universe({ graph: source, focusId, familyId, accessToken, timeZone, answer, onAnswer, onRefresh, onAdd, onEdit, onDelete }: {
  graph: FamilyBaseGraph; focusId: string | null; familyId: string; accessToken: string; timeZone: string; onRefresh: () => void;
  answer?: FamilyAnswer; onAnswer: (answer: FamilyAnswer) => void;
  onAdd: () => void; onEdit: (record: FamilyBaseRecord) => void; onDelete: (record: FamilyBaseRecord) => Promise<string>;
}) {
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { resolved } = useThemePreference();
  const isDark = resolved === 'dark';
  const colorFor = (node: UniverseNode) => {
    if (node.group === 'home') return isDark ? '#fff3cc' : '#936f28';
    const group = universeGroups.find(item => item.id === node.group)!;
    return isDark ? group.color : group.light;
  };
  const data = useMemo(() => toUniverse(source), [source]);
  const presentGroups = universeGroups.filter(group => data.nodes.some(node => node.id === group.id));
  const recordCount = source.nodes.length;
  const onlyPeople = source.nodes.every(node => node.kind === 'person');
  const starsMaterial = useRef<PointsMaterial | null>(null);
  const graph = useRef<ForceGraphMethods<UniverseNode, UniverseLink> | undefined>(undefined);
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeGroups, setActiveGroups] = useState<Set<UniverseGroup>>(() => new Set(universeGroups.map(group => group.id)));
  const [rotating, setRotating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [ready, setReady] = useState(false);
  const byId = useMemo(() => new Map(data.nodes.map(node => [node.id, node])), [data]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const visible = useCallback((node: UniverseNode) => node.group === 'home' || activeGroups.has(node.group), [activeGroups]);
  const visibleNodes = data.nodes.filter(visible);
  const listedNodes = visibleNodes.filter(node => !node.hub || node.group === 'home');
  const matches = query.trim() ? data.nodes.filter(node => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const matchIds = new Set(matches.map(node => node.id));
  const connections = selected ? data.links.flatMap(link => {
    const a = endpointId(link.source), b = endpointId(link.target);
    if (link.kind === 'cluster' && !selected.hub) return [];
    return a === selected.id ? [{ id: b, link }] : b === selected.id ? [{ id: a, link }] : [];
  }) : [];
  const neighbours = new Set(connections.map(connection => connection.id));
  const connected = connections.flatMap(({ id, link }) => { const node = byId.get(id); return node ? [{ node, link }] : []; });
  const href = selected?.record ? recordHref(familyId, selected.record) : null;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setReducedMotion(media.matches); if (media.matches) setRotating(false); };
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hasSize = size.width > 0;
  useEffect(() => {
    const instance = graph.current;
    if (!instance || !hasSize) return;
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    let seed = 8241;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let index = 0; index < 1600; index++) {
      const angle = random() * Math.PI * 2, elevation = Math.acos(2 * random() - 1), radius = 1300 + random() * 500;
      positions.push(radius * Math.sin(elevation) * Math.cos(angle), radius * Math.cos(elevation), radius * Math.sin(elevation) * Math.sin(angle));
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color: '#a9c4e8', size: 1.25, sizeAttenuation: false, transparent: true, opacity: .42, depthWrite: false });
    starsMaterial.current = material;
    const stars = new Points(geometry, material);
    instance.scene().add(stars);
    instance.cameraPosition({ x: 315, y: 190, z: 600 }, { x: 0, y: 0, z: 0 });
    const controls = instance.controls() as unknown as { enableDamping: boolean; dampingFactor: number; minDistance: number; maxDistance: number };
    controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 25; controls.maxDistance = 1100;
    instance.d3Force('charge')?.strength(-35);
    setReady(true);
    return () => { starsMaterial.current = null; instance.scene().remove(stars); geometry.dispose(); material.dispose(); };
  }, [hasSize]);

  useEffect(() => {
    if (!starsMaterial.current) return;
    starsMaterial.current.color.set(isDark ? '#a9c4e8' : '#627d68');
    starsMaterial.current.opacity = isDark ? .42 : .2;
  }, [isDark, ready]);

  useEffect(() => { if (selectedId) detailsHeading.current?.focus({ preventScroll: false }); }, [selectedId]);

  useEffect(() => {
    if (!graph.current || !ready) return;
    const controls = graph.current.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number };
    controls.autoRotate = rotating && !reducedMotion;
    controls.autoRotateSpeed = .32;
  }, [rotating, reducedMotion, ready]);

  function selectNode(node: UniverseNode) {
    setSelectedId(node.id); setConfirming(false); setDeleteError(''); setQuery(''); setRotating(false);
    if (node.group !== 'home') setActiveGroups(current => new Set([...current, node.group as UniverseGroup]));
    const { x = 0, y = 0, z = 0 } = node;
    graph.current?.cameraPosition({ x: x + 85, y: y + 45, z: z + 160 }, { x, y, z }, reducedMotion ? 0 : 850);
  }

  async function confirmDelete(record: FamilyBaseRecord) {
    setDeleting(true); setDeleteError('');
    const problem = await onDelete(record);
    // On success the reload remounts this view.
    if (problem) { setDeleteError(problem); setDeleting(false); }
  }

  function resetView() {
    setSelectedId(null); setQuery(''); setRotating(false);
    graph.current?.cameraPosition({ x: 315, y: 190, z: 600 }, { x: 0, y: 0, z: 0 }, reducedMotion ? 0 : 700);
  }

  function toggleGroup(id: UniverseGroup) {
    setActiveGroups(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    if (selected?.group === id) setSelectedId(null);
  }

  const highlighted = (node: UniverseNode) => node.id === selectedId || neighbours.has(node.id) || node.id === hoveredId || (query.trim() && matchIds.has(node.id));
  const groupLabel = (node: UniverseNode) => node.group === 'home' ? 'Your family' : node.hub ? 'Constellation' : universeGroups.find(group => group.id === node.group)!.singular;
  const description = (node: UniverseNode) => {
    if (node.group === 'home') return `Everything in ${source.familyName} that you can see, and how it connects. Select a node to explore, then open it to make changes.`;
    if (node.hub) { const count = data.nodes.filter(item => item.group === node.group && !item.hub).length; return `${count} ${count === 1 ? 'record' : 'records'} in ${node.name.toLowerCase()}.`; }
    return null;
  };

  return <section aria-label="Family Base universe" className={surface}>
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-3 sm:inset-x-5 sm:top-5">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-panel/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-primary"><Orbit aria-hidden="true" className="size-4" /></span>
        <div><h2 className="text-sm font-medium">{source.familyName}</h2><p className="mt-0.5 text-xs text-muted-foreground">{recordCount} {recordCount === 1 ? 'record' : 'records'} <span aria-hidden="true">·</span> {source.links.length} connections</p></div>
        <button type="button" onClick={() => setAsking(true)} className={cn(darkButton, 'ml-2')}><Sparkles aria-hidden="true" className="size-3.5" />Ask</button>
      </div>
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-panel/85 p-2 shadow-lg backdrop-blur-md">
        <div className="relative">
          <label htmlFor="universe-search" className="sr-only">Find anything in Family Base</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <input ref={searchInput} id="universe-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setQuery(''); }}
            placeholder="Find anything…" autoComplete="off" maxLength={100} aria-controls={query.trim() ? 'universe-results' : undefined}
            className="h-9 w-30 max-w-full rounded-lg border border-border bg-accent/60 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring sm:w-52" />
          {query.trim() && <div id="universe-results" className="absolute top-11 left-0 z-30 max-h-72 w-64 max-w-[calc(100vw-4rem)] overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-xl">
            <p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">{matches.length ? `${matches.length} matching ${matches.length === 1 ? 'record' : 'records'}` : 'Nothing found'}</p>
            {matches.map(node => <button key={node.id} type="button" onClick={() => selectNode(node)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} aria-hidden="true" /><span className="min-w-0 grow break-words">{node.name}</span><span className="shrink-0 text-xs text-muted-foreground">{groupLabel(node)}</span>
            </button>)}
          </div>}
        </div>
        <button type="button" onClick={onAdd} className={cn(darkButton, 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover')} title="Add a memory, place or idea"><Plus aria-hidden="true" className="size-3.5" /><span className="sr-only sm:not-sr-only">Add</span></button>
        <button type="button" onClick={resetView} className={darkButton} title="Reset camera and selection"><RotateCcw aria-hidden="true" className="size-3.5" /><span className="sr-only sm:not-sr-only">Reset view</span></button>
        <button type="button" onClick={onRefresh} className={darkButton} title="Load the latest records"><RefreshCw aria-hidden="true" className="size-3.5" /><span className="sr-only sm:not-sr-only">Refresh</span></button>
        <button type="button" aria-pressed={rotating} onClick={() => setRotating(current => !current)} disabled={reducedMotion} className={darkButton} title={reducedMotion ? 'Rotation is off for reduced motion' : 'Toggle gentle camera rotation'}>
          {rotating ? <Pause aria-hidden="true" className="size-3.5" /> : <Orbit aria-hidden="true" className="size-3.5" />}<span className="sr-only sm:not-sr-only">{rotating ? "Pause" : "Rotate"}</span>
        </button>
      </div>
    </div>

    <div ref={container} className="absolute inset-0" aria-label="Interactive 3D graph">
      <CanvasBoundary>
        {hasSize && <ForceGraph3D<UniverseNode, UniverseLink> ref={graph} width={size.width} height={size.height} graphData={data}
          backgroundColor={isDark ? '#08101e' : '#f4f6f3'} controlType="orbit" showNavInfo={false} nodeRelSize={3.3} nodeResolution={12} nodeOpacity={.96}
          nodeLabel={node => node.hub ? node.name : `${node.name} · ${groupLabel(node)}`} nodeVal={node => node.val}
          nodeColor={node => (selectedId || query.trim()) && !highlighted(node) ? isDark ? '#344156' : '#bdc9c0' : colorFor(node)}
          nodeVisibility={visible} linkVisibility={link => { const a = byId.get(endpointId(link.source)), b = byId.get(endpointId(link.target)); return !!a && !!b && visible(a) && visible(b); }}
          linkColor={link => selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? isDark ? '#d7e7ff' : '#47604e' : isDark ? '#7183a6' : '#718b7b'}
          linkOpacity={selectedId ? .45 : .28} linkWidth={link => selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? .65 : link.kind === 'connection' ? .25 : 0}
          linkDirectionalParticles={link => !reducedMotion && selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? 1 : 0}
          linkDirectionalParticleWidth={1.4} linkDirectionalParticleSpeed={.003}
          onNodeClick={selectNode} onNodeHover={node => setHoveredId(node?.id ?? null)} onBackgroundClick={() => setSelectedId(null)}
          onNodeDragEnd={node => { node.fx = node.x; node.fy = node.y; node.fz = node.z; }}
          warmupTicks={reducedMotion ? 100 : 50} cooldownTicks={reducedMotion ? 0 : 100} enableNodeDrag />}
      </CanvasBoundary>
      {onlyPeople ? <div className="pointer-events-none absolute inset-x-0 bottom-44 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl sm:bottom-28 border border-border bg-panel/85 px-5 py-4 text-center shadow-lg backdrop-blur-md">
        <p className="font-medium">Your universe is just getting started.</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Memories, places and ideas, plus your tasks, goals, events, chats and files, will appear here, linked to the people they involve.</p>
        <p className="pointer-events-auto mt-3 flex flex-wrap justify-center gap-3 text-sm">
          <button type="button" className="text-primary underline underline-offset-4" onClick={onAdd}>Add a memory</button>
          <a className="text-primary underline underline-offset-4" href={'/tasks/?' + new URLSearchParams({ family: familyId })}>Add a task</a>
          <a className="text-primary underline underline-offset-4" href={'/goals/?' + new URLSearchParams({ family: familyId })}>Set a goal</a>
          <a className="text-primary underline underline-offset-4" href={'/calendar/?' + new URLSearchParams({ family: familyId })}>Plan an event</a>
        </p>
      </div> : <div className="pointer-events-none absolute bottom-32 left-5 hidden max-w-56 select-none text-xs leading-relaxed text-muted-foreground sm:block">
        <p className="mb-1 text-sm font-medium text-foreground">See how it all connects.</p>
        Drag space to orbit. Scroll or pinch to zoom. Select a node to explore.
        {source.truncated.length > 0 && <span className="mt-2 block">Showing the most relevant {source.truncated.map(kind => universeGroups.find(group => group.id === kind)!.label.toLowerCase()).join(', ')}.</span>}
      </div>}
      <button type="button" className={cn(darkButton, 'absolute right-5 bottom-20 bg-panel/85 shadow-lg backdrop-blur-md sm:bottom-32')} aria-label="Fit visible nodes" title="Fit visible nodes" onClick={() => { setRotating(false); graph.current?.zoomToFit(reducedMotion ? 0 : 700, 45, visible); }}><Maximize2 aria-hidden="true" className="size-4" /></button>
    </div>

    {selected && <aside aria-label="Selected record" className="absolute top-36 right-3 z-10 max-h-[calc(100%-16rem)] w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-border bg-panel/90 p-4 shadow-xl backdrop-blur-md sm:top-24 sm:right-5 sm:max-h-[calc(100%-14.5rem)] sm:w-96 sm:p-5">
      <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-3">
        {selected.record?.kind === 'person' && <Avatar name={selected.name} colorKey={selected.record.recordId} size="lg" />}
        <div className="min-w-0"><p className="mb-2 text-xs tracking-wider text-muted-foreground uppercase">{groupLabel(selected)}</p><h3 ref={detailsHeading} tabIndex={-1} className="text-lg font-medium break-words outline-none">{selected.name}</h3></div></div>
        <button type="button" aria-label="Close details" onClick={() => { setSelectedId(null); searchInput.current?.focus(); }} className="grid size-8 shrink-0 place-items-center rounded-lg text-foreground/80 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></button></div>
      {selected.record ? <ul className="mt-3 flex flex-wrap gap-1.5">{recordFacts(selected.record, timeZone).map(fact => <li key={fact} className="rounded-full bg-accent/70 px-2.5 py-1 text-xs text-foreground/80">{fact}</li>)}</ul>
        : <p className="mt-3 text-sm leading-relaxed text-foreground/80">{description(selected)}</p>}
      {selected.record?.note && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 wrap-anywhere">{selected.record.note}</p>}
      {selected.record?.canEdit && <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirming ? <>
          <p className="w-full text-sm">Delete “{selected.name}”? This can’t be undone.</p>
          <button type="button" className={cn(darkButton, 'text-destructive')} disabled={deleting} onClick={() => void confirmDelete(selected.record!)}>{deleting ? 'Deleting…' : 'Delete'}</button>
          <button type="button" className={darkButton} disabled={deleting} onClick={() => setConfirming(false)}>Keep</button>
        </> : <>
          <button type="button" className={darkButton} onClick={() => onEdit(selected.record!)}><Pencil aria-hidden="true" className="size-3.5" />Edit</button>
          <button type="button" className={darkButton} onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" className="size-3.5" />Delete</button>
        </>}
        {deleteError && <p role="alert" className="w-full text-sm text-destructive">{deleteError}</p>}
      </div>}
      {selected.record && href && <a href={href} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{openLabel(selected.record.kind)}<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>}
      <details key={selected.id} open={!selected.hub && connected.length <= 8} className="group mt-5 border-t border-border pt-2">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span>{connected.length} {connected.length === 1 ? 'connection' : 'connections'}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        {connected.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Not linked to anything yet.</p> :
          <ul className="mt-1 grid gap-1">{connected.map(({ node, link }) => <li key={node.id}><button type="button" onClick={() => selectNode(node)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} /><span className="min-w-0 grow break-words">{node.name}</span>{link.kind === 'connection' && <span className="shrink-0 text-xs text-muted-foreground">{relationLabel(link.relation)}</span>}<ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /></button></li>)}</ul>}
      </details>
    </aside>}

    <div className="absolute inset-x-3 bottom-3 z-20 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center justify-start gap-2 overflow-x-auto rounded-2xl sm:flex-wrap sm:justify-center border border-border bg-panel/85 p-2 shadow-lg backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:max-w-[calc(100%-2.5rem)]">
      <span className="mr-1 hidden text-xs text-muted-foreground lg:inline">Constellations</span>
      {presentGroups.map(group => <button type="button" key={group.id} aria-pressed={activeGroups.has(group.id)} onClick={() => toggleGroup(group.id)}
        className={cn('inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring', activeGroups.has(group.id) ? 'border-border bg-accent/60 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground/80')}>
        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: isDark ? group.color : group.light }} />{group.label}
      </button>)}
      <button type="button" onClick={() => setShowBrowser(current => !current)} aria-expanded={showBrowser} aria-controls="universe-browser" className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{showBrowser ? 'Hide list' : 'Browse list'}</button>
    </div>
    {showBrowser && <div id="universe-browser" className="absolute inset-x-3 bottom-20 z-30 max-h-[50%] sm:bottom-32 overflow-y-auto rounded-2xl border border-border bg-panel/95 p-4 shadow-xl backdrop-blur-md sm:inset-x-5"><p className="mb-3 text-xs text-muted-foreground">Select any visible record to explore its connections.</p><ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{listedNodes.map(node => <li key={node.id}><button type="button" onClick={() => { selectNode(node); setShowBrowser(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} /><span className="min-w-0 grow break-words">{node.name}</span><span className="shrink-0 text-xs text-muted-foreground">{groupLabel(node)}</span></button></li>)}</ul></div>}
    {asking && <FamilyAskDialog graph={source} familyId={familyId} accessToken={accessToken} last={answer} onAnswer={onAnswer} onClose={() => setAsking(false)}
      onSelect={id => { setAsking(false); const node = byId.get(id); if (node) selectNode(node); }} />}
    <p role="status" aria-live="polite" className="sr-only">{selected ? `Selected ${selected.name}. ${connected.length} connections. Details available.` : `${listedNodes.length} records visible.`}</p>
  </section>;
}
