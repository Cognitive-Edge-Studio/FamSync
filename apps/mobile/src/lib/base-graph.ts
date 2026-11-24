import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { BaseGraph, BaseLink, BaseNode } from './family-base.ts';

export const graphWidth = 720, graphHeight = 600, graphNodeLimit = 80, graphLinkLimit = 300;
export type GraphView = { nodes: BaseNode[]; links: BaseLink[]; omittedNodes: number; omittedLinks: number; signature: string };
export type GraphPoint = { id: string; x: number; y: number; radius: number };

/** A bounded view of already-authorized, filtered records. Never introduce neighbors outside the matches. */
export function graphView(graph: BaseGraph, matches: BaseNode[]): GraphView {
  const authorized = new Map(graph.nodes.map((node) => [node.id, node]));
  const wanted = new Set(matches.map((node) => node.id).filter((id) => authorized.has(id)));
  const seen = new Set<string>();
  const links = graph.links.filter((link) => {
    const key = [link.source, link.target, link.relation].join('|');
    if (link.source === link.target || !wanted.has(link.source) || !wanted.has(link.target) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  const degree = new Map<string, number>();
  for (const link of links) for (const id of [link.source, link.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const nodes = [...wanted].map((id) => authorized.get(id)!).sort((a, b) => Number(b.kind === 'person') - Number(a.kind === 'person') || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, graphNodeLimit);
  const shown = new Set(nodes.map((node) => node.id));
  const available = links.filter((link) => shown.has(link.source) && shown.has(link.target)).sort((a, b) => [a.source, a.target, a.relation].join('|').localeCompare([b.source, b.target, b.relation].join('|')));
  const drawn = available.slice(0, graphLinkLimit);
  return { nodes, links: drawn, omittedNodes: wanted.size - nodes.length, omittedLinks: available.length - drawn.length,
    signature: JSON.stringify([nodes.map((node) => [node.id, node.kind]), drawn.map((link) => [link.source, link.target, link.relation])]) };
}

type ForcePoint = SimulationNodeDatum & { id: string; radius: number };
/** Compute once per topology, then stop: there is no perpetual physics loop on the phone. */
export function graphLayout(view: Pick<GraphView, 'nodes' | 'links'>, bounds: { height?: number; top?: number; bottom?: number; left?: number; right?: number } = {}): GraphPoint[] {
  if (!view.nodes.length) return [];
  const height = bounds.height ?? graphHeight, centerY = ((bounds.top ?? 0) + height - (bounds.bottom ?? 0)) / 2, centerX = ((bounds.left ?? 0) + graphWidth - (bounds.right ?? 0)) / 2;
  const nodes: ForcePoint[] = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id)).map((node) => ({ id: node.id, radius: node.kind === 'person' ? 22 : node.kind === 'conversation' ? 18 : 16 }));
  if (nodes.length === 1) return [{ ...nodes[0], x: centerX, y: centerY }];
  // d3 mutates its simulation inputs, so give it copies rather than API records and links.
  const links = view.links.map(({ source, target }) => ({ source, target }));
  const simulation = forceSimulation(nodes).stop()
    .force('link', forceLink<ForcePoint, typeof links[number]>(links).id((node) => node.id).distance(120).strength(0.2))
    .force('charge', forceManyBody().strength(-500))
    .force('collision', forceCollide<ForcePoint>().radius((node) => node.radius + 12).iterations(3))
    .force('x', forceX(centerX).strength(0.04)).force('y', forceY(centerY).strength(0.05));
  for (let step = 0; step < 180; step++) {
    simulation.tick();
    for (const node of nodes) {
      node.x = Math.max(node.radius + (bounds.left ?? 32), Math.min(graphWidth - node.radius - (bounds.right ?? 32), node.x!));
      node.y = Math.max(node.radius + (bounds.top ?? 32), Math.min(height - node.radius - (bounds.bottom ?? 40), node.y!));
    }
  }
  simulation.stop();
  return nodes.map((node) => ({ id: node.id, radius: node.radius, x: node.x!, y: node.y! }));
}

/** Hit targets remain at least 44 screen points across, even when the overview dots are small. */
export function graphHit(points: GraphPoint[], x: number, y: number, width: number, height: number, scale: number, panX: number, panY: number, worldHeight = graphHeight): string | null {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  let closest: string | null = null, distance = Infinity;
  for (const point of points) {
    const screenX = width / 2 + (point.x - graphWidth / 2) * scale + panX, screenY = height / 2 + (point.y - worldHeight / 2) * scale + panY;
    const next = Math.hypot(x - screenX, y - screenY);
    if (next <= Math.max(22, point.radius * scale) && next < distance) { closest = point.id; distance = next; }
  }
  return closest;
}
