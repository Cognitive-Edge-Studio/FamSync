import type { components } from '@famsync/api-client';

export type BaseGraph = components['schemas']['FamilyBaseGraphDto'];
export type BaseNode = components['schemas']['FamilyBaseNodeDto'];
export type BaseKind = BaseNode['kind'];
export type BaseLink = BaseGraph['links'][number];
export type FamilyEntry = components['schemas']['FamilyEntryDto'];
export type EntryKind = FamilyEntry['kind'];
export type EntryLink = components['schemas']['FamilyEntryLinkInputDto'];
export type EntryFields = Omit<components['schemas']['CreateFamilyEntryDto'], 'id'>;
export const entryKinds = ['memory', 'place', 'idea'] as const;
export const isEntryKind = (kind: BaseKind): kind is EntryKind => (entryKinds as readonly string[]).includes(kind);
export const kindLabels: Record<BaseKind, string> = { person: 'People', task: 'Tasks', goal: 'Goals', event: 'Events', conversation: 'Chats', file: 'Files', memory: 'Memories', place: 'Places', idea: 'Ideas' };
export const singularLabels: Record<BaseKind, string> = { person: 'Person', task: 'Task', goal: 'Goal', event: 'Event', conversation: 'Chat', file: 'File', memory: 'Memory', place: 'Place', idea: 'Idea' };
export const baseKinds = ['memory', 'place', 'idea', 'person', 'task', 'goal', 'event', 'conversation', 'file'] as const;
const audienceLabels: Record<string, string> = { family: 'Family', selected: 'Selected members', private: 'Only me' };

export function visibleLinks(graph: BaseGraph) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  return graph.links.filter((link) => ids.has(link.source) && ids.has(link.target));
}
export function filterBase(graph: BaseGraph, term: string, kind: BaseKind | 'all' = 'all', person = '') {
  const query = term.trim().toLocaleLowerCase(), connected = new Set<string>(person ? [person] : []);
  if (person && graph.nodes.some((node) => node.id === person)) for (const link of visibleLinks(graph)) {
    if (link.source === person) connected.add(link.target);
    if (link.target === person) connected.add(link.source);
  }
  return graph.nodes.filter((node) => (kind === 'all' || node.kind === kind) && (!person || connected.has(node.id))
    && (!query || [node.name, node.note, node.location].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)))
    .sort((a, b) => baseKinds.indexOf(a.kind) - baseKinds.indexOf(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function connections(graph: BaseGraph, id: string) {
  if (!graph.nodes.some((node) => node.id === id)) return [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node])), seen = new Set<string>();
  return visibleLinks(graph).flatMap((link) => {
    const target = link.source === id ? link.target : link.target === id ? link.source : null;
    if (!target || target === id || seen.has(target)) return [];
    seen.add(target);
    const forward = link.source === id;
    const labels: Record<BaseLink['relation'], [string, string]> = {
      assigned: ['Assigned to', 'Assigned'], created: ['Created by', 'Created'], 'goal-step': ['Step of', 'Goal step'],
      event: ['For event', 'Linked task'], participant: ['Member', 'Conversation'], 'shared-in': ['Shared in', 'Shared file'], linked: ['Linked', 'Linked'],
    };
    return [{ node: nodes.get(target)!, relation: labels[link.relation][forward ? 0 : 1] }];
  });
}

export type BaseTarget = { pathname: '/family' | '/task/[id]' | '/goal/[id]' | '/event/[id]' | '/chat/[id]' | '/files/view' | '/family-base/entry'; params?: Record<string, string> };
export function baseTarget(node: BaseNode): BaseTarget {
  switch (node.kind) {
    case 'person': return { pathname: '/family' };
    case 'task': return { pathname: '/task/[id]', params: { id: node.recordId } };
    case 'goal': return { pathname: '/goal/[id]', params: { id: node.recordId } };
    case 'event': return { pathname: '/event/[id]', params: { id: node.recordId } };
    case 'conversation': return { pathname: '/chat/[id]', params: { id: node.recordId } };
    case 'file': return { pathname: '/files/view', params: { id: node.recordId } };
    default: return { pathname: '/family-base/entry', params: { id: node.recordId } };
  }
}
export function entryLinkTarget(link: EntryLink): BaseTarget {
  switch (link.kind) {
    case 'person': return { pathname: '/family' };
    case 'goal': return { pathname: '/goal/[id]', params: { id: link.id } };
    case 'event': return { pathname: '/event/[id]', params: { id: link.id } };
    case 'entry': return { pathname: '/family-base/entry', params: { id: link.id } };
  }
}

export function baseFacts(node: BaseNode, timeZone: string) {
  let when = '';
  if (node.when) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(node.when), date = new Date(dateOnly ? node.when + 'T00:00:00Z' : node.when);
    if (Number.isFinite(date.getTime())) when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(dateOnly ? { timeZone: 'UTC' } : { timeZone, timeStyle: 'short' as const }) }).format(date);
  }
  switch (node.kind) {
    case 'person': return [node.you ? 'You' : '', node.status === 'owner' ? 'Family owner' : 'Family member'].filter(Boolean);
    case 'task': return [({ todo: 'To do', in_progress: 'In progress', completed: 'Done' } as Record<string, string>)[node.status ?? ''] ?? 'Task', when ? 'Due ' + when : 'No due date', node.repeats ? 'Repeating chore' : ''].filter(Boolean);
    case 'goal': return [node.status === 'completed' ? 'Completed' : 'Active', node.progress === null ? '' : node.progress + '% complete', when ? 'Target ' + when : ''].filter(Boolean);
    case 'event': return [when, node.repeats ? 'Repeats' : ''].filter(Boolean);
    case 'conversation': return [node.status === 'dm' ? 'Direct message' : 'Channel'];
    case 'file': return [node.status ?? 'File', when ? 'Added ' + when : ''].filter(Boolean);
    case 'memory': return [when, audienceLabels[node.status ?? ''] ?? ''].filter(Boolean);
    case 'place': return [node.location ?? '', audienceLabels[node.status ?? ''] ?? ''].filter(Boolean);
    case 'idea': return [audienceLabels[node.status ?? ''] ?? ''].filter(Boolean);
  }
}

export const linkKey = (link: EntryLink) => link.kind + ':' + link.id;
export type LinkChoice = EntryLink & { name: string; label: string };
export function linkChoices(graph: BaseGraph, entry?: FamilyEntry): LinkChoice[] {
  const choices = new Map<string, LinkChoice>();
  for (const link of entry?.links ?? []) choices.set(linkKey(link), { ...link, label: link.kind === 'entry' ? 'Entry' : singularLabels[link.kind] });
  for (const node of graph.nodes) {
    const kind = isEntryKind(node.kind) ? 'entry' : ['person', 'goal', 'event'].includes(node.kind) ? node.kind as EntryLink['kind'] : null;
    if (!kind || kind === 'entry' && node.recordId === entry?.id) continue;
    const choice = { kind, id: node.recordId, name: node.name, label: singularLabels[node.kind] };
    choices.set(linkKey(choice), choice);
  }
  return [...choices.values()];
}
export type EntryDraft = { kind: EntryKind; title: string; note: string; happenedOn: string; location: string; audience: FamilyEntry['audience']; selected: string[]; links: EntryLink[] };
export function entryDraft(entry: FamilyEntry | undefined, audience: FamilyEntry['audience'] = 'family', kind: EntryKind = 'memory'): EntryDraft {
  return entry ? { kind: entry.kind, title: entry.title, note: entry.note, happenedOn: entry.happenedOn ?? '', location: entry.location, audience: entry.audience, selected: entry.selectedMemberIds, links: entry.links.map(({ kind, id }) => ({ kind, id })) }
    : { kind, title: '', note: '', happenedOn: '', location: '', audience, selected: [], links: [] };
}
export function entryFields(draft: EntryDraft, members: string[], me: string): EntryFields {
  return { kind: draft.kind, title: draft.title.trim(), note: draft.note.trim(), happenedOn: draft.kind === 'memory' && draft.happenedOn ? draft.happenedOn : null, location: draft.kind === 'place' ? draft.location.trim() : '',
    audience: draft.audience, selectedMemberIds: draft.audience === 'selected' ? [...new Set(draft.selected.filter((id) => id !== me && members.includes(id)))] : [], links: draft.links.map(({ kind, id }) => ({ kind, id })) };
}
export const entrySignature = (fields: EntryFields) => JSON.stringify({ ...fields, selectedMemberIds: [...fields.selectedMemberIds].sort(), links: [...fields.links].sort((a, b) => linkKey(a).localeCompare(linkKey(b))) });
export function entryProblem(draft: EntryDraft, members: string[], me: string, id?: string) {
  const fields = entryFields(draft, members, me);
  if (!fields.title) return 'Enter a title.';
  if (fields.title.length > 120 || fields.note.length > 2000 || fields.location.length > 200) return 'Shorten the entry to fit the field limits.';
  if ([fields.title, fields.note, fields.location].some((text) => text.includes('\0'))) return 'Remove unsupported characters from the entry.';
  if (fields.happenedOn) {
    const date = new Date(fields.happenedOn + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.happenedOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fields.happenedOn) return 'Choose a valid date for the memory.';
  }
  if (fields.audience === 'selected' && !fields.selectedMemberIds.length) return 'Choose at least one family member.';
  if (fields.links.length > 50) return 'An entry can have up to 50 links.';
  if (new Set(fields.links.map(linkKey)).size !== fields.links.length) return 'Remove duplicate links.';
  if (id && fields.links.some((link) => link.kind === 'entry' && link.id === id)) return 'An entry cannot link to itself.';
  return null;
}
