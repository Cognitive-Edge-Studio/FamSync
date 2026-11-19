"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';
import { ArrowUpRight, ChevronDown, Maximize2, Orbit, Pause, RotateCcw, Search, X } from 'lucide-react';
import { createDemoUniverse, endpointId, universeGroups, universePreviewImage, type UniverseGroup, type UniverseNode, type UniverseLink } from '@/lib/family-base-demo';
import { cn } from '@/lib/utils';
import { useThemePreference } from './theme-menu';

const darkButton = 'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-panel/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40';
const lightColors: Record<string, string> = { home: '#936f28', people: '#3f875d', plans: '#3973b2', ideas: '#8060b3', memories: '#b77a32', places: '#ba627b', everyday: '#348b8a' };

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="status" className="grid h-full place-content-center gap-3 px-6 text-center text-foreground">
      <Orbit className="mx-auto size-10 text-primary" aria-hidden="true" />
      <p className="font-medium">The 3D view is unavailable in this browser.</p>
      <p className="max-w-sm text-sm text-muted-foreground">You can still search and explore the demo using the connected-node list below.</p>
    </div> : this.props.children;
  }
}

export default function FamilyBaseUniverse() {
  const { resolved } = useThemePreference();
  const isDark = resolved === 'dark';
  const colorFor = (node: UniverseNode) => isDark
    ? node.group === 'home' ? '#fff3cc' : universeGroups.find(group => group.id === node.group)!.color
    : lightColors[node.group] ?? '#58725f';
  const groupColor = (group: typeof universeGroups[number]) => isDark ? group.color : lightColors[group.id] ?? '#58725f';
  const data = useMemo(createDemoUniverse, []);
  const starsMaterial = useRef<PointsMaterial | null>(null);
  const graph = useRef<ForceGraphMethods<UniverseNode, UniverseLink> | undefined>(undefined);
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeGroups, setActiveGroups] = useState<Set<UniverseGroup>>(() => new Set(universeGroups.map(group => group.id)));
  const [rotating, setRotating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [ready, setReady] = useState(false);
  const selected = data.nodes.find(node => node.id === selectedId);
  const previewImage = selected ? universePreviewImage(selected) : null;
  const visible = useCallback((node: UniverseNode) => node.group === 'home' || activeGroups.has(node.group), [activeGroups]);
  const visibleNodes = data.nodes.filter(visible);
  const matches = query.trim() ? data.nodes.filter(node => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const matchIds = new Set(matches.map(node => node.id));
  const connections = selected ? data.links.flatMap(link => {
    const a = endpointId(link.source), b = endpointId(link.target);
    return a === selected.id ? [b] : b === selected.id ? [a] : [];
  }) : [];
  const neighbours = new Set(connections);
  const connectedNodes = data.nodes.filter(node => neighbours.has(node.id));

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
    setSelectedId(node.id); setQuery(''); setRotating(false);
    if (node.group !== 'home') setActiveGroups(current => new Set([...current, node.group as UniverseGroup]));
    const { x = 0, y = 0, z = 0 } = node;
    graph.current?.cameraPosition({ x: x + 85, y: y + 45, z: z + 160 }, { x, y, z }, reducedMotion ? 0 : 850);
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

  return <section aria-label="Family Base demo universe" className="relative isolate min-h-0 flex-1 overflow-hidden bg-[#f4f6f3] dark:bg-[#08101e] text-foreground">
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-3 sm:inset-x-5 sm:top-5">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-panel/85 px-3 py-2 shadow-lg backdrop-blur-md">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-primary"><Orbit aria-hidden="true" className="size-4" /></span>
        <div><h2 className="text-sm font-medium">A universe of connections</h2><p className="mt-0.5 text-xs text-muted-foreground">{visibleNodes.length} nodes <span aria-hidden="true">·</span> Fictional demo data</p></div>
      </div>
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-panel/85 p-2 shadow-lg backdrop-blur-md">
        <div className="relative">
          <label htmlFor="universe-search" className="sr-only">Find a demo node</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <input ref={searchInput} id="universe-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setQuery(''); }}
            placeholder="Find a connection…" autoComplete="off" maxLength={100} aria-controls={query.trim() ? 'universe-results' : undefined}
            className="h-9 w-48 max-w-full rounded-lg border border-border bg-accent/60 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring sm:w-52" />
          {query.trim() && <div id="universe-results" className="absolute top-11 left-0 z-30 max-h-72 w-64 max-w-[calc(100vw-4rem)] overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-xl">
            <p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">{matches.length ? `${matches.length} matching connections` : 'No connections found'}</p>
            {matches.map(node => <button key={node.id} type="button" onClick={() => selectNode(node)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} aria-hidden="true" /><span className="min-w-0 break-words">{node.name}</span>
            </button>)}
          </div>}
        </div>
        <button type="button" onClick={resetView} className={darkButton} title="Reset camera and selection"><RotateCcw aria-hidden="true" className="size-3.5" /><span>Reset view</span></button>
        <button type="button" aria-pressed={rotating} onClick={() => setRotating(current => !current)} disabled={reducedMotion} className={darkButton} title={reducedMotion ? 'Rotation is off for reduced motion' : 'Toggle gentle camera rotation'}>
          {rotating ? <Pause aria-hidden="true" className="size-3.5" /> : <Orbit aria-hidden="true" className="size-3.5" />}<span>{rotating ? 'Pause' : 'Rotate'}</span>
        </button>
      </div>
    </div>

    <div ref={container} className="absolute inset-0" aria-label="Interactive 3D graph">
      <CanvasBoundary>
        {hasSize && <ForceGraph3D<UniverseNode, UniverseLink> ref={graph} width={size.width} height={size.height} graphData={data}
          backgroundColor={isDark ? '#08101e' : '#f4f6f3'} controlType="orbit" showNavInfo={false} nodeRelSize={3.3} nodeResolution={12} nodeOpacity={.96}
          nodeLabel={node => node.name} nodeVal={node => node.val}
          nodeColor={node => (selectedId || query.trim()) && !highlighted(node) ? isDark ? '#344156' : '#bdc9c0' : colorFor(node)}
          nodeVisibility={visible} linkVisibility={link => visible(typeof link.source === 'string' ? data.nodes.find(node => node.id === link.source)! : link.source) && visible(typeof link.target === 'string' ? data.nodes.find(node => node.id === link.target)! : link.target)}
          linkColor={link => selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? isDark ? '#d7e7ff' : '#47604e' : isDark ? '#7183a6' : '#718b7b'}
          linkOpacity={selectedId ? .45 : .28} linkWidth={link => selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? .65 : 0}
          linkDirectionalParticles={link => !reducedMotion && selectedId && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId) ? 1 : 0}
          linkDirectionalParticleWidth={1.4} linkDirectionalParticleSpeed={.003}
          onNodeClick={selectNode} onNodeHover={node => setHoveredId(node?.id ?? null)} onBackgroundClick={() => setSelectedId(null)}
          onNodeDragEnd={node => { node.fx = node.x; node.fy = node.y; node.fz = node.z; }}
          warmupTicks={reducedMotion ? 100 : 50} cooldownTicks={reducedMotion ? 0 : 100} enableNodeDrag />}
      </CanvasBoundary>
      <div className="pointer-events-none absolute bottom-24 left-5 hidden max-w-56 select-none text-xs leading-relaxed text-muted-foreground sm:block">
        <p className="mb-1 text-sm font-medium text-foreground">Follow your curiosity.</p>
        Drag space to orbit. Scroll or pinch to zoom. Select a node to explore.
      </div>
      <button type="button" className={cn(darkButton, 'absolute right-5 bottom-24 bg-panel/85 shadow-lg backdrop-blur-md')} aria-label="Fit visible nodes" title="Fit visible nodes" onClick={() => { setRotating(false); graph.current?.zoomToFit(reducedMotion ? 0 : 700, 45, visible); }}><Maximize2 aria-hidden="true" className="size-4" /></button>
    </div>

    {selected && <aside aria-label="Selected connection" className="absolute top-36 right-3 z-10 max-h-[calc(100%-16rem)] w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-border bg-panel/90 p-4 shadow-xl backdrop-blur-md sm:top-24 sm:right-5 sm:max-h-[calc(100%-13rem)] sm:w-96 sm:p-5">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="mb-2 text-xs tracking-wider text-muted-foreground uppercase">{selected.group === 'home' ? 'The big picture' : universeGroups.find(group => group.id === selected.group)?.label}</p><h3 ref={detailsHeading} tabIndex={-1} className="text-lg font-medium break-words outline-none">{selected.name}</h3></div>
        <button type="button" aria-label="Close node details" onClick={() => { setSelectedId(null); searchInput.current?.focus(); }} className="grid size-8 shrink-0 place-items-center rounded-lg text-foreground/80 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></button></div>
      {previewImage && <figure className="mt-4 overflow-hidden rounded-xl border border-border bg-muted">
        <img key={previewImage.src} src={previewImage.src} alt={previewImage.alt} width={480} height={300}
          className={cn('aspect-[8/5] w-full', previewImage.portrait ? 'object-contain p-3' : 'object-cover')} />
      </figure>}
      <p className="mt-3 text-sm leading-relaxed text-foreground/80">{selected.description}</p>
      <details key={selected.id} className="group mt-5 border-t border-border pt-2">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span>{connectedNodes.length} connected {connectedNodes.length === 1 ? 'node' : 'nodes'}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 grid gap-1">{connectedNodes.map(node => <li key={node.id}><button type="button" onClick={() => selectNode(node)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} /><span className="min-w-0 grow break-words">{node.name}</span><ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /></button></li>)}</ul>
      </details>
    </aside>}

    <div className="absolute inset-x-3 bottom-3 z-20 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-panel/85 p-2 shadow-lg backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:max-w-[calc(100%-2.5rem)]">
      <span className="mr-1 hidden text-xs text-muted-foreground lg:inline">Constellations</span>
      {universeGroups.map(group => <button type="button" key={group.id} aria-pressed={activeGroups.has(group.id)} onClick={() => toggleGroup(group.id)}
        className={cn('inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring', activeGroups.has(group.id) ? 'border-border bg-accent/60 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground/80')}>
        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: groupColor(group) }} />{group.label}
      </button>)}
      <button type="button" onClick={() => setShowBrowser(current => !current)} aria-expanded={showBrowser} aria-controls="universe-browser" className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{showBrowser ? 'Hide node list' : 'Browse node list'}</button>
    </div>
    {showBrowser && <div id="universe-browser" className="absolute inset-x-3 bottom-24 z-30 max-h-[50%] overflow-y-auto rounded-2xl border border-border bg-panel/95 p-4 shadow-xl backdrop-blur-md sm:inset-x-5"><p className="mb-3 text-xs text-muted-foreground">Select any visible node to explore its connections.</p><ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{visibleNodes.map(node => <li key={node.id}><button type="button" onClick={() => { selectNode(node); setShowBrowser(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(node) }} /><span className="min-w-0 break-words">{node.name}</span></button></li>)}</ul></div>}
    <p role="status" aria-live="polite" className="sr-only">{selected ? `Selected ${selected.name}. ${connectedNodes.length} connections. Details available.` : `${visibleNodes.length} demo nodes visible.`}</p>
  </section>;
}
