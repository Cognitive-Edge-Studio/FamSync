import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDraft } from '@famsync/core/forms';
import { baseFacts, baseTarget, connections, entryDraft, entryFields, entryLinkTarget, entryProblem, entrySignature, filterBase, linkChoices, visibleLinks, type BaseGraph, type BaseKind, type BaseNode, type FamilyEntry } from '../src/lib/family-base.ts';

const node = (kind: BaseKind, recordId: string, changes: Partial<BaseNode> = {}): BaseNode => ({ id: kind + ':' + recordId, kind, recordId, name: recordId, status: null, when: null, progress: null, repeats: false, folderId: null, note: null, location: null, canEdit: false, you: false, ...changes });
const graph = (nodes: BaseNode[], links: BaseGraph['links'] = []): BaseGraph => ({ familyName: 'Test family', nodes, links, truncated: [] });
const entry = (changes: Partial<FamilyEntry> = {}): FamilyEntry => ({ id: 'entry', kind: 'memory', title: 'A memory', note: 'Some notes', happenedOn: '2026-11-24', location: '', audience: 'family', selectedMemberIds: [], version: 1, canEdit: true, links: [], ...changes });

test('search uses visible names, notes and locations, with kind and direct-person filters', () => {
  const data = graph([node('person', 'p'), node('memory', 'm', { name: 'Our holiday', note: 'A quiet beach' }), node('place', 'l', { location: 'Cedar Road' }), node('idea', 'i')], [{ source: 'memory:m', target: 'person:p', relation: 'created' }]);
  assert.deepEqual(filterBase(data, ' BEACH ').map((value) => value.id), ['memory:m']);
  assert.deepEqual(filterBase(data, 'cedar', 'place').map((value) => value.id), ['place:l']);
  assert.deepEqual(filterBase(data, '', 'all', 'person:p').map((value) => value.id), ['memory:m', 'person:p']);
  assert.equal(filterBase(data, 'beach', 'idea').length, 0);
  assert.equal(filterBase(data, '', 'all', 'person:hidden').length, 0);
});

test('hidden or truncated targets produce neither connections nor search results', () => {
  const data = graph([node('person', 'p'), node('task', 't')], [
    { source: 'task:t', target: 'person:p', relation: 'assigned' },
    { source: 'memory:hidden', target: 'person:p', relation: 'linked' },
    { source: 'task:t', target: 'goal:hidden', relation: 'goal-step' },
  ]);
  assert.equal(visibleLinks(data).length, 1);
  assert.deepEqual(connections(data, 'person:p').map(({ node }) => node.id), ['task:t']);
  assert.equal(connections(data, 'memory:hidden').length, 0);
  assert.equal(filterBase(data, 'hidden').length, 0);
});

test('connections work in both directions and do not repeat a neighbor', () => {
  const data = graph([node('task', 't'), node('person', 'p')], [
    { source: 'task:t', target: 'person:p', relation: 'assigned' },
    { source: 'task:t', target: 'person:p', relation: 'created' },
  ]);
  assert.equal(connections(data, 'task:t')[0].relation, 'Assigned to');
  assert.equal(connections(data, 'person:p')[0].relation, 'Assigned');
  assert.equal(connections(data, 'task:t').length, 1);
});

test('each record opens a native module rather than a server-supplied URL', () => {
  const expected = { person: '/family', task: '/task/[id]', goal: '/goal/[id]', event: '/event/[id]', conversation: '/chat/[id]', file: '/files/view', memory: '/family-base/entry', place: '/family-base/entry', idea: '/family-base/entry' };
  for (const [kind, path] of Object.entries(expected)) assert.equal(baseTarget(node(kind as BaseKind, 'record')).pathname, path);
  assert.deepEqual(baseTarget(node('file', 'file', { folderId: 'folder' })).params, { id: 'file' });
  assert.equal(entryLinkTarget({ kind: 'entry', id: 'older' }).pathname, '/family-base/entry');
});

test('date-only memories keep their civil date across family time zones', () => {
  const memory = node('memory', 'm', { when: '2026-11-24', status: 'private' });
  assert.deepEqual(baseFacts(memory, 'Pacific/Honolulu'), baseFacts(memory, 'Asia/Dhaka'));
  assert.equal(baseFacts(memory, 'UTC').at(-1), 'Only me');
  assert.doesNotThrow(() => baseFacts(node('event', 'e', { when: 'invalid' }), 'UTC'));
});

test('link choices exclude self and unsupported records while preserving readable links outside the graph', () => {
  const existing = entry({ links: [{ kind: 'goal', id: 'older', name: 'Older goal' }] });
  const data = graph([node('memory', 'entry'), node('idea', 'other'), node('person', 'p'), node('task', 't'), node('file', 'f'), node('conversation', 'c')]);
  assert.deepEqual(linkChoices(data, existing).map((choice) => choice.kind + ':' + choice.id).sort(), ['entry:other', 'goal:older', 'person:p']);
  assert.equal(linkChoices(data, existing)[0].name, 'Older goal');
});

test('private defaults and selected audiences never carry departed members or the author', () => {
  const draft = entryDraft(undefined, 'private');
  assert.equal(draft.audience, 'private');
  draft.title = 'Entry'; draft.audience = 'selected'; draft.selected = ['me', 'gone', 'p', 'p'];
  assert.deepEqual(entryFields(draft, ['me', 'p'], 'me').selectedMemberIds, ['p']);
  assert.equal(entryProblem(draft, ['me', 'p'], 'me'), null);
  assert.ok(entryProblem(draft, ['me'], 'me'));
  draft.audience = 'private'; assert.deepEqual(entryFields(draft, ['me', 'p'], 'me').selectedMemberIds, []);
});

test('changing entry kind clears fields that do not apply to the submitted kind', () => {
  const draft = entryDraft(entry()); draft.location = 'A place';
  draft.kind = 'idea'; assert.equal(entryFields(draft, [], 'me').happenedOn, null); assert.equal(entryFields(draft, [], 'me').location, '');
  draft.kind = 'place'; assert.equal(entryFields(draft, [], 'me').location, 'A place'); assert.equal(entryFields(draft, [], 'me').happenedOn, null);
  draft.kind = 'memory'; assert.equal(entryFields(draft, [], 'me').location, '');
});

test('entry validation catches empty titles, invalid dates, field limits, self-links and duplicate links', () => {
  const draft = entryDraft(entry());
  draft.title = ' '; assert.ok(entryProblem(draft, [], 'me')); draft.title = 'Entry';
  for (const day of ['2026-02-30', '2026-13-01', 'wrong']) { draft.happenedOn = day; assert.ok(entryProblem(draft, [], 'me')); }
  draft.happenedOn = '2028-02-29'; assert.equal(entryProblem(draft, [], 'me'), null);
  draft.note = 'x'.repeat(2001); assert.ok(entryProblem(draft, [], 'me')); draft.note = '';
  draft.links = [{ kind: 'entry', id: 'entry' }]; assert.ok(entryProblem(draft, [], 'me', 'entry'));
  draft.links = [{ kind: 'person', id: 'p' }, { kind: 'person', id: 'p' }]; assert.ok(entryProblem(draft, [], 'me'));
  draft.links = Array.from({ length: 51 }, (_, n) => ({ kind: 'person', id: String(n) })); assert.ok(entryProblem(draft, [], 'me'));
});

test('conflict merging retains typed changes and takes unrelated saved changes', () => {
  const before = entryDraft(entry()), mine = { ...before, title: 'My title' }, latest = { ...before, note: 'Updated elsewhere', audience: 'private' as const };
  assert.deepEqual(mergeDraft(before, mine, latest), { ...latest, title: 'My title' });
});

test('recovered create comparison ignores connection ordering but detects changed content', () => {
  const draft = entryDraft(entry()); draft.links = [{ kind: 'person', id: 'p' }, { kind: 'goal', id: 'g' }];
  const first = entryFields(draft, [], 'me'), reordered = { ...first, links: [...first.links].reverse() };
  assert.equal(entrySignature(first), entrySignature(reordered));
  assert.notEqual(entrySignature(first), entrySignature({ ...first, title: 'Newer draft' }));
});
