import type {
  FamilyBaseGraphDto, FamilyBaseLinkDto, FamilyBaseNodeDto, FamilyBaseNodeKind, FamilyBaseRelation,
} from "./family-base.dto.js";

/** Most records shown per kind; newer or more relevant records win, and the response says which kinds were cut. */
export const familyBaseLimits = { task: 150, goal: 60, event: 80, conversation: 60, file: 80, memory: 150, place: 100, idea: 150 } as const;

export type MemberRow = { id: string; name: string; role: string };
export type TaskRow = {
  id: string; title: string; status: string; due: string | null; assigneeId: string | null; authorId: string;
  eventId: string | null; repeats: boolean;
};
export type GoalRow = {
  id: string; title: string; completed: boolean; percentage: string | number | null; targetDate: string | null;
  type: string; assigneeId: string | null; authorId: string;
};
export type GoalTaskRow = { goalId: string; taskId: string };
export type EventRow = { id: string; title: string; authorId: string; starts: string | null; repeats: boolean };
export type ConversationRow = { id: string; name: string; emoji: string; kind: "channel" | "dm" };
export type ParticipantRow = { channelId: string; userId: string };
export type FileRow = { id: string; folderId: string; name: string; mime: string; authorId: string | null; channelId: string | null; created: string };

export type EntryRow = {
  id: string; kind: "memory" | "place" | "idea"; title: string; note: string; happenedOn: string | null; location: string;
  audience: string; authorId: string;
};
export type EntryLinkRow = { entryId: string; personId: string | null; goalId: string | null; eventId: string | null; linkedEntryId: string | null };

export type GraphRows = {
  familyName: string; actorId: string; members: MemberRow[]; tasks: TaskRow[]; goals: GoalRow[]; goalTasks: GoalTaskRow[];
  events: EventRow[]; conversations: ConversationRow[]; participants: ParticipantRow[]; files: FileRow[];
  entries: EntryRow[]; entryLinks: EntryLinkRow[];
};

const key = (kind: FamilyBaseNodeKind, id: string) => kind + ":" + id;

/**
 * Builds the Family Base graph from rows the database already filtered by the caller's access.
 * Links are only kept when both ends are in the graph, so a hidden record never appears as a dangling id.
 */
export function buildFamilyBaseGraph(rows: GraphRows): FamilyBaseGraphDto {
  const nodes: FamilyBaseNodeDto[] = [];
  const links: FamilyBaseLinkDto[] = [];
  const ids = new Set<string>();
  const seenLinks = new Set<string>();
  const truncated: FamilyBaseNodeKind[] = [];
  const names = new Map(rows.members.map((member) => [member.id, member.name]));

  const add = (kind: FamilyBaseNodeKind, recordId: string, node: Partial<FamilyBaseNodeDto> & { name: string }) => {
    const id = key(kind, recordId);
    ids.add(id);
    nodes.push({ id, kind, recordId, status: null, when: null, progress: null, repeats: false, folderId: null, note: null, location: null, canEdit: false, you: false, ...node });
  };
  const pending: FamilyBaseLinkDto[] = [];
  const link = (source: string, target: string, relation: FamilyBaseRelation) => pending.push({ source, target, relation });
  const person = (userId: string | null) => (userId && names.has(userId) ? key("person", userId) : null);
  const capped = <T>(kind: Exclude<FamilyBaseNodeKind, "person">, items: T[]) => {
    const limit = familyBaseLimits[kind];
    if (items.length > limit) truncated.push(kind);
    return items.slice(0, limit);
  };

  for (const member of rows.members) {
    add("person", member.id, { name: member.name || "Family member", status: member.role, you: member.id === rows.actorId });
  }

  for (const task of capped("task", rows.tasks)) {
    add("task", task.id, { name: task.title, status: task.status, when: task.due, repeats: task.repeats });
    const assignee = person(task.assigneeId);
    if (assignee) link(key("task", task.id), assignee, "assigned");
    else if (person(task.authorId)) link(key("task", task.id), person(task.authorId)!, "created");
    if (task.eventId) link(key("task", task.id), key("event", task.eventId), "event");
  }

  for (const goal of capped("goal", rows.goals)) {
    const progress = goal.percentage === null ? null : Math.round(Number(goal.percentage));
    add("goal", goal.id, {
      name: goal.title, status: goal.completed ? "completed" : "active", when: goal.targetDate,
      progress: Number.isFinite(progress) ? progress : null,
    });
    const owner = goal.type === "individual" ? person(goal.assigneeId) : null;
    if (owner) link(key("goal", goal.id), owner, "assigned");
    else if (person(goal.authorId)) link(key("goal", goal.id), person(goal.authorId)!, "created");
  }
  for (const step of rows.goalTasks) link(key("task", step.taskId), key("goal", step.goalId), "goal-step");

  for (const event of capped("event", rows.events)) {
    add("event", event.id, { name: event.title, when: event.starts, repeats: event.repeats });
    const author = person(event.authorId);
    if (author) link(key("event", event.id), author, "created");
  }

  const participants = new Map<string, string[]>();
  for (const row of rows.participants) participants.set(row.channelId, [...(participants.get(row.channelId) ?? []), row.userId]);
  for (const conversation of capped("conversation", rows.conversations)) {
    const members = (participants.get(conversation.id) ?? []).filter((id) => names.has(id));
    const peers = members.filter((id) => id !== rows.actorId).map((id) => names.get(id) || "Family member");
    const name = conversation.kind === "dm"
      ? "Chat with " + (peers.join(" & ") || "a former member")
      : (conversation.emoji ? conversation.emoji + " " : "") + conversation.name;
    add("conversation", conversation.id, { name, status: conversation.kind });
    for (const member of members) link(key("conversation", conversation.id), key("person", member), "participant");
  }

  for (const file of capped("file", rows.files)) {
    add("file", file.id, { name: file.name, status: file.mime, when: file.created, folderId: file.folderId });
    if (file.channelId) link(key("file", file.id), key("conversation", file.channelId), "shared-in");
    else if (person(file.authorId)) link(key("file", file.id), person(file.authorId)!, "created");
  }

  const entryKinds = new Map(rows.entries.map((entry) => [entry.id, entry.kind]));
  const linkedPeople = new Set(rows.entryLinks.filter((row) => row.personId).map((row) => row.entryId + ">" + row.personId));
  for (const kind of ["memory", "place", "idea"] as const) {
    for (const entry of capped(kind, rows.entries.filter((item) => item.kind === kind))) {
      add(kind, entry.id, {
        name: entry.title, status: entry.audience, when: entry.happenedOn, note: entry.note || null,
        location: entry.location || null, canEdit: entry.authorId === rows.actorId,
      });
      const author = person(entry.authorId);
      if (author && !linkedPeople.has(entry.id + ">" + entry.authorId)) link(key(kind, entry.id), author, "created");
    }
  }
  for (const row of rows.entryLinks) {
    const kind = entryKinds.get(row.entryId);
    const otherKind = row.linkedEntryId ? entryKinds.get(row.linkedEntryId) : undefined;
    const target = row.personId ? key("person", row.personId) : row.goalId ? key("goal", row.goalId)
      : row.eventId ? key("event", row.eventId) : otherKind ? key(otherKind, row.linkedEntryId!) : null;
    if (kind && target) link(key(kind, row.entryId), target, "linked");
  }

  for (const candidate of pending) {
    const signature = candidate.source + ">" + candidate.target + ">" + candidate.relation;
    // Two entries that link to each other are one connection.
    if (seenLinks.has(candidate.target + ">" + candidate.source + ">" + candidate.relation)) continue;
    if (ids.has(candidate.source) && ids.has(candidate.target) && !seenLinks.has(signature)) {
      seenLinks.add(signature);
      links.push(candidate);
    }
  }

  return { familyName: rows.familyName, nodes, links, truncated };
}
