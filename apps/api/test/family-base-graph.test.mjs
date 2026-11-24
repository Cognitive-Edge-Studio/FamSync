import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFamilyBaseGraph, familyBaseLimits } from "../dist/family-base-graph.js";

const me = "00000000-0000-4000-8000-000000000001";
const maya = "00000000-0000-4000-8000-000000000002";
const former = "00000000-0000-4000-8000-000000000009";
const base = {
  familyName: "Carter Family", actorId: me,
  members: [{ id: me, name: "Sam Carter", role: "owner" }, { id: maya, name: "Maya Carter", role: "member" }],
  tasks: [], goals: [], goalTasks: [], events: [], conversations: [], participants: [], files: [], entries: [], entryLinks: [],
};
const ids = (graph) => graph.nodes.map((node) => node.id);
const has = (graph, source, target, relation) =>
  graph.links.some((link) => link.source === source && link.target === target && link.relation === relation);

test("members become person nodes and the caller is marked", () => {
  const graph = buildFamilyBaseGraph(base);
  assert.deepEqual(ids(graph), ["person:" + me, "person:" + maya]);
  assert.equal(graph.nodes[0].you, true);
  assert.equal(graph.nodes[1].you, false);
  assert.deepEqual(graph.truncated, []);
});

test("records link to assignees, goals, events and conversations", () => {
  const graph = buildFamilyBaseGraph({
    ...base,
    tasks: [
      { id: "t1", title: "Pack the car", status: "todo", due: "2026-11-25", assigneeId: maya, authorId: me, eventId: "e1", repeats: false },
      { id: "t2", title: "Water plants", status: "todo", due: null, assigneeId: null, authorId: me, eventId: null, repeats: true },
    ],
    goals: [{ id: "g1", title: "Road trip", completed: false, percentage: "33.33", targetDate: null, type: "family", assigneeId: null, authorId: maya }],
    goalTasks: [{ goalId: "g1", taskId: "t1" }],
    events: [{ id: "e1", title: "Leave for the park", authorId: me, starts: "2026-11-26T14:00:00Z", repeats: false }],
    conversations: [{ id: "c1", name: "Trip", emoji: "🚗", kind: "channel" }, { id: "d1", name: "", emoji: "💬", kind: "dm" }],
    participants: [{ channelId: "c1", userId: me }, { channelId: "c1", userId: maya }, { channelId: "d1", userId: me }, { channelId: "d1", userId: maya }],
    files: [{ id: "f1", folderId: "fd1", name: "map.pdf", mime: "application/pdf", authorId: me, channelId: "c1", created: "2026-11-20T10:00:00Z" }],
  });
  assert.ok(has(graph, "task:t1", "person:" + maya, "assigned"));
  assert.ok(has(graph, "task:t2", "person:" + me, "created"), "unassigned task falls back to its author");
  assert.ok(has(graph, "task:t1", "goal:g1", "goal-step"));
  assert.ok(has(graph, "task:t1", "event:e1", "event"));
  assert.ok(has(graph, "goal:g1", "person:" + maya, "created"));
  assert.ok(has(graph, "conversation:c1", "person:" + maya, "participant"));
  assert.ok(has(graph, "file:f1", "conversation:c1", "shared-in"));
  assert.equal(graph.nodes.find((node) => node.id === "goal:g1").progress, 33);
  assert.equal(graph.nodes.find((node) => node.id === "conversation:c1").name, "🚗 Trip");
  assert.equal(graph.nodes.find((node) => node.id === "conversation:d1").name, "Chat with Maya Carter");
  assert.equal(graph.nodes.find((node) => node.id === "task:t2").repeats, true);
  assert.equal(graph.nodes.find((node) => node.id === "file:f1").folderId, "fd1");
});

test("links to hidden records or former members are dropped instead of dangling", () => {
  const graph = buildFamilyBaseGraph({
    ...base,
    tasks: [{ id: "t1", title: "Secret", status: "todo", due: null, assigneeId: former, authorId: former, eventId: "hidden", repeats: false }],
    goalTasks: [{ goalId: "not-visible", taskId: "t1" }],
  });
  const known = new Set(ids(graph));
  assert.equal(graph.links.length, 0);
  for (const link of graph.links) assert.ok(known.has(link.source) && known.has(link.target));
});

test("oversized kinds are capped and reported", () => {
  const tasks = Array.from({ length: familyBaseLimits.task + 1 }, (_, index) => ({
    id: "t" + index, title: "Task " + index, status: "todo", due: null, assigneeId: me, authorId: me, eventId: null, repeats: false,
  }));
  const graph = buildFamilyBaseGraph({ ...base, tasks });
  assert.equal(graph.nodes.filter((node) => node.kind === "task").length, familyBaseLimits.task);
  assert.deepEqual(graph.truncated, ["task"]);
});

test("entries link once to what they mention, and hidden targets are dropped", () => {
  const entry = (id, kind, authorId) => ({ id, kind, title: id, note: "Note", happenedOn: null, location: "", audience: "family", authorId });
  const row = (entryId, target) => ({ entryId, personId: null, goalId: null, eventId: null, linkedEntryId: null, ...target });
  const graph = buildFamilyBaseGraph({
    ...base,
    entries: [entry("m1", "memory", me), entry("p1", "place", maya)],
    entryLinks: [row("m1", { personId: me }), row("m1", { linkedEntryId: "p1" }), row("p1", { linkedEntryId: "m1" }),
      row("m1", { goalId: "hidden" }), row("m1", { linkedEntryId: "hidden" })],
  });
  assert.equal(graph.links.filter((link) => link.relation === "linked").length, 2);
  assert.ok(has(graph, "memory:m1", "person:" + me, "linked"));
  assert.ok(!has(graph, "memory:m1", "person:" + me, "created"), "a linked author is not connected twice");
  assert.ok(has(graph, "place:p1", "person:" + maya, "created"));
  assert.equal(graph.nodes.find((node) => node.id === "memory:m1").canEdit, true);
  assert.equal(graph.nodes.find((node) => node.id === "place:p1").canEdit, false);
});

test("duplicate relationships are collapsed", () => {
  const graph = buildFamilyBaseGraph({
    ...base,
    tasks: [{ id: "t1", title: "A", status: "todo", due: null, assigneeId: me, authorId: me, eventId: null, repeats: false }],
    goals: [{ id: "g1", title: "G", completed: false, percentage: null, targetDate: null, type: "family", assigneeId: null, authorId: me }],
    goalTasks: [{ goalId: "g1", taskId: "t1" }, { goalId: "g1", taskId: "t1" }],
  });
  assert.equal(graph.links.filter((link) => link.relation === "goal-step").length, 1);
});
