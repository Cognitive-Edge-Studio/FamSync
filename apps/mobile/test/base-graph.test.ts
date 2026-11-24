import assert from 'node:assert/strict';
import test from 'node:test';
import { graphHeight, graphHit, graphLayout, graphLinkLimit, graphNodeLimit, graphView, graphWidth } from '../src/lib/base-graph.ts';
import type { BaseGraph, BaseKind, BaseNode } from '../src/lib/family-base.ts';

const node = (id: string, kind: BaseKind = 'task'): BaseNode => ({ id, kind, recordId: id, name: id, status: null, when: null, progress: null, repeats: false, folderId: null, note: null, location: null, canEdit: false, you: false });
const graph = (nodes: BaseNode[], links: BaseGraph['links'] = []): BaseGraph => ({ familyName: 'Family', nodes, links, truncated: [] });

test('the graph includes only authorized matches and edges whose endpoints both remain visible', () => {
  const data = graph([node('p', 'person'), node('a'), node('b')], [{ source: 'a', target: 'p', relation: 'assigned' }, { source: 'hidden', target: 'p', relation: 'linked' }, { source: 'a', target: 'b', relation: 'linked' }]);
  const view = graphView(data, [data.nodes[0], data.nodes[1], node('hidden')]);
  assert.deepEqual(view.nodes.map((n) => n.id), ['p', 'a']);
  assert.deepEqual(view.links, [{ source: 'a', target: 'p', relation: 'assigned' }]);
});

test('graph bounds prioritize people and connected records and explicitly report omitted nodes', () => {
  const nodes = Array.from({ length: graphNodeLimit + 20 }, (_, n) => node(String(n))), person = node('person', 'person');
  const data = graph([...nodes, person], [{ source: '99', target: 'person', relation: 'assigned' }]), view = graphView(data, data.nodes);
  assert.equal(view.nodes.length, graphNodeLimit); assert.equal(view.nodes[0].id, 'person'); assert.ok(view.nodes.some((n) => n.id === '99')); assert.equal(view.omittedNodes, 21);
});

test('dense links are bounded and duplicates/self edges are removed', () => {
  const nodes = Array.from({ length: 30 }, (_, n) => node(String(n))), links: BaseGraph['links'] = [];
  for (const source of nodes) for (const target of nodes) links.push({ source: source.id, target: target.id, relation: 'linked' });
  const data = graph(nodes, [...links, links[1]]), view = graphView(data, nodes);
  assert.equal(view.links.length, graphLinkLimit); assert.equal(view.omittedLinks, 30 * 29 - graphLinkLimit); assert.ok(view.links.every((l) => l.source !== l.target));
});

test('static force layout is finite, deterministic, bounded and does not mutate API data', () => {
  const data = graph([node('a'), node('p', 'person'), node('b')], [{ source: 'a', target: 'p', relation: 'assigned' }, { source: 'b', target: 'p', relation: 'created' }]);
  const original = structuredClone(data), first = graphView(data, data.nodes), second = graphView({ ...data, nodes: [...data.nodes].reverse(), links: [...data.links].reverse() }, [...data.nodes].reverse());
  assert.equal(first.signature, second.signature); assert.deepEqual(graphLayout(first), graphLayout(second)); assert.deepEqual(data, original);
  for (const point of graphLayout(first)) { assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)); assert.ok(point.x >= point.radius && point.x <= graphWidth - point.radius); assert.ok(point.y >= point.radius && point.y <= graphHeight - point.radius); }
});

test('empty and single-record graphs have a valid layout', () => {
  assert.deepEqual(graphLayout({ nodes: [], links: [] }), []);
  assert.deepEqual(graphLayout({ nodes: [node('one')], links: [] }), [{ id: 'one', radius: 16, x: graphWidth / 2, y: graphHeight / 2 }]);
});

test('isolated records do not compress a family hub into an overlapping cluster', () => {
  const nodes = [node('person', 'person'), ...Array.from({ length: 45 }, (_, n) => node('task' + n)), node('isolated1', 'file'), node('isolated2', 'file')];
  const data = graph(nodes, nodes.slice(1, 46).map((n) => ({ source: n.id, target: 'person', relation: 'assigned' })));
  const points = graphLayout(graphView(data, nodes));
  for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) assert.ok(Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) > (points[a].radius + points[b].radius) * 0.9);
});

test('hit testing accounts for pan/zoom and enforces a 44-point touch target', () => {
  const points = [{ id: 'a', x: 360, y: 300, radius: 16 }, { id: 'b', x: 500, y: 400, radius: 16 }];
  assert.equal(graphHit(points, 170 + 30 + 21, 200 - 10, 340, 400, 0.5, 30, -10), 'a');
  assert.equal(graphHit(points, 170 + 140 * 2 + 30, 200 + 100 * 2 - 10, 340, 400, 2, 30, -10), 'b');
  assert.equal(graphHit(points, 0, 0, 340, 400, 1, 0, 0), null);
  assert.equal(graphHit(points, 0, 0, 340, 400, 0, 0, 0), null);
});

test('portrait layout reserves room for floating controls and hit testing uses the taller world', () => {
  const data = graph([node('a'), node('b')]), view = graphView(data, data.nodes);
  for (const point of graphLayout(view, { height: 1400, top: 280, bottom: 300, left: 50, right: 140 })) {
    assert.ok(point.y >= 280 + point.radius && point.y <= 1100 - point.radius);
    assert.ok(point.x >= 50 + point.radius && point.x <= 580 - point.radius);
  }
  assert.equal(graphHit([{ id: 'a', x: 360, y: 700, radius: 16 }], 180, 350, 360, 700, 0.5, 0, 0, 1400), 'a');
});
