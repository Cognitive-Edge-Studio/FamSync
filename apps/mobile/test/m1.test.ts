import assert from "node:assert/strict";
import { test } from "node:test";
import { amountProblem, changedFields, eligibleMembers, goalProblem, mergeDraft, readSchedule, repeatProblem, taskProblem, typedTime, type GoalDraft, type TaskDraft } from "@famsync/core/forms";
import { attachmentProblem } from "../src/lib/attachment-rules.ts";
import { textForm } from "../src/lib/multipart.ts";
import { readCache, type TextStore } from "../src/lib/read-cache.ts";
import { agenda } from "../src/lib/today.ts";

function store() {
  const values = new Map<string, string>();
  return { values, api: { get: async (key) => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async (key) => { values.delete(key); }, keys: async () => [...values.keys()] } satisfies TextStore };
}

test("saved data belongs to one account and family, and old data is not shown", async () => {
  const s = store();
  let now = 1_000_000_000_000;
  const cache = readCache(s.api, () => now);
  await cache.save("u1", "f1", "today", { n: 1 });
  await cache.save("u1", "f1", "family", { id: "f1" });
  assert.deepEqual((await cache.read("u1", "f1", "today"))?.data, { n: 1 });
  assert.equal(await cache.read("u2", "f1", "today"), null);
  assert.equal(await cache.read("u1", "f2", "today"), null);
  assert.deepEqual(await cache.newest("u1", "family"), { id: "f1" });
  assert.equal(await cache.newest("u2", "family"), null);
  now += 8 * 24 * 60 * 60_000;
  assert.equal(await cache.read("u1", "f1", "today"), null);
  assert.equal(s.values.has("read:u1:f1:today"), false);
});

test("sign-out, another account and another family remove saved data, and a late save cannot bring it back", async () => {
  const s = store(), cache = readCache(s.api);
  s.values.set("other", "kept");
  await cache.save("u1", "f1", "a", 1);
  await cache.save("u2", "f1", "a", 1);
  await cache.keepOnly("u1", "f1");
  assert.deepEqual([...s.values.keys()].sort(), ["other", "read:u1:f1:a"]);
  await cache.keepOnly("u1", "f2");
  assert.deepEqual([...s.values.keys()], ["other"]);
  let release = () => {};
  const slow = readCache({ ...s.api, set: async (key, value) => { await new Promise<void>((done) => { release = done; }); s.values.set(key, value); } });
  const saving = slow.save("u1", "f1", "late", 1);
  await slow.clear();
  release();
  await saving;
  assert.deepEqual([...s.values.keys()], ["other"]);
});

test("broken or oversized saved data never reaches a screen", async () => {
  const s = store(), cache = readCache(s.api);
  s.values.set("read:u:f:x", "{broken");
  assert.equal(await cache.read("u", "f", "x"), null);
  await cache.save("u", "f", "big", "x".repeat(500_000));
  assert.equal(s.values.has("read:u:f:big"), false);
});

const task: TaskDraft = { title: "Dishes", description: "", dueDate: "2026-12-01", dueTime: "", assigneeId: "", audience: "family", selected: [], remind: "", frequency: "", interval: "1", until: "", eventLink: null };
test("task rules match the website", () => {
  assert.equal(taskProblem(task, "task", false), null);
  assert.match(taskProblem({ ...task, title: " " }, "task", false)!, /title/);
  assert.match(taskProblem({ ...task, audience: "selected" }, "task", false)!, /at least one/);
  assert.match(taskProblem({ ...task, assigneeId: "x" }, "task", false)!, /can’t see/);
  assert.match(taskProblem({ ...task, dueDate: "", dueTime: "10:00" }, "task", false)!, /due date/);
  assert.match(taskProblem({ ...task, dueTime: "25:00" }, "task", false)!, /hours and minutes/);
  for (const interval of ["0", "366", "1.5", "", "x"]) assert.ok(repeatProblem({ ...task, interval }), interval);
  assert.ok(repeatProblem({ ...task, until: "2026-11-30" }));
  assert.match(taskProblem({ ...task, until: "2026-01-01" }, "series", false, "2026-02-01")!, /on or after/);
});

test("assignees are limited to people who can see the item", () => {
  const people = ["a", "b", "me"].map((userId) => ({ userId, firstName: userId, lastName: "" })), ids = (audience: "family" | "selected" | "private", selected: string[]) => eligibleMembers(people, audience, selected, "me").map((person) => person.userId);
  assert.deepEqual([ids("family", []), ids("selected", ["b"]), ids("private", ["b"])], [["a", "b", "me"], ["b", "me"], ["me"]]);
});

test("schedules use exclusive all-day ends and family wall-clock minutes", () => {
  assert.deepEqual(readSchedule({ allDay: true, startDate: "2026-02-28", startTime: "", endDate: "2026-02-28", endTime: "" }), { schedule: { allDay: true, start: "2026-02-28", end: "2026-03-01" } });
  assert.deepEqual(readSchedule({ allDay: false, startDate: "2026-03-08", startTime: "23:30", endDate: "2026-03-09", endTime: "00:30" }), { schedule: { allDay: false, start: "2026-03-08T23:30", end: "2026-03-09T00:30" } });
  for (const bad of [{ endDate: "2026-02-27" }, { endTime: "9" }, { startTime: "10:00", endTime: "10:00" }]) assert.ok("problem" in readSchedule({ allDay: false, startDate: "2026-02-28", startTime: "09:00", endDate: "2026-02-28", endTime: "10:00", ...bad }));
  assert.deepEqual(["9", "093", "0930", "09:30", "1730x9"].map(typedTime), ["9", "09:3", "09:30", "09:30", "17:30"]);
});

test("goal rules match the website", () => {
  const goal: GoalDraft = { title: "Read", description: "", type: "family", category: "Personal Development", priority: "low", targetDate: "", assigneeId: "", audience: "family", selected: [], mode: "manual", target: "", unit: "" };
  assert.equal(goalProblem(goal, false), null);
  assert.ok(goalProblem({ ...goal, type: "individual" }, true));
  assert.ok(goalProblem({ ...goal, mode: "numeric", target: "0", unit: "x" }, false));
  assert.ok(goalProblem({ ...goal, mode: "numeric", target: "5" }, false));
  assert.equal(goalProblem({ ...goal, mode: "numeric", target: "5.25", unit: "miles" }, false), null);
  assert.deepEqual([amountProblem("0", false), !!amountProblem("1.234", false), !!amountProblem("-1", false), !!amountProblem("9999999999999", false)], [null, true, true, true]);
});

test("a conflict lists only what changed", () => {
  assert.deepEqual(changedFields({ title: "a", dueDate: "x", selected: ["1"] }, { title: "b", dueDate: "x", selected: ["1"] }, { title: "Title", dueDate: "Due", selected: "People" }), [{ key: "title", label: "Title", value: "b" }]);
});

test("keeping my changes does not undo other people’s", () => {
  assert.deepEqual(mergeDraft({ title: "a", due: "x", who: ["1"] }, { title: "mine", due: "x", who: ["1"] }, { title: "theirs", due: "y", who: ["2"] }), { title: "mine", due: "y", who: ["2"] });
});

test("an event form is valid multipart text", () => {
  const form = textForm({ event: "{\"a\":\"é\"}" }, "b1");
  assert.equal(form.body, "--b1\r\nContent-Disposition: form-data; name=\"event\"\r\n\r\n{\"a\":\"é\"}\r\n--b1--\r\n");
});

test("the agenda follows the family's day across midnight and multi-day events", () => {
  const event = (id: string, start: string, end: string, allDay = false) => ({ id, title: id, start, end, allDay, audience: "family" as const });
  const days = agenda([event("late", "2026-11-24T04:30:00Z", "2026-11-24T05:30:00Z"), event("trip", "2026-11-23", "2026-11-26", true)], "America/Chicago", "2026-11-23");
  assert.deepEqual(days.today.map(({ id }) => id), ["late", "trip"]);
  assert.deepEqual(days.upcoming.map(({ date, events }) => [date, events.map(({ id }) => id)]), [["2026-11-24", ["trip"]], ["2026-11-25", ["trip"]]]);
  assert.equal(days.upcomingCount, 1);
});

test("only supported files within the limit are sent", () => {
  assert.equal(attachmentProblem({ name: "a.JPG", size: 10 }), null);
  for (const file of [{ name: "a.exe", size: 10 }, { name: "a.heic" }, { name: "a.pdf", size: 5 * 1048576 + 1 }, { name: "a.pdf", size: 0 }]) assert.ok(attachmentProblem(file));
});

test("unsent work outlives the reading limit", async () => {
  const s = store();
  let now = 1_000_000_000_000;
  const cache = readCache(s.api, () => now);
  await cache.save("u", "f", "draft:c", { body: "x" });
  now += 30 * 24 * 60 * 60_000;
  assert.deepEqual((await cache.read("u", "f", "draft:c", true))?.data, { body: "x" });
});

test("saved conversations are listed so lost ones can be removed", async () => {
  const s = store(), cache = readCache(s.api);
  for (const [user, name] of [["u", "chat:a"], ["u", "draft:a"], ["u", "unsent:b"], ["u", "task:z"], ["v", "chat:c"]] as const) await cache.save(user, "f", name, 1);
  assert.deepEqual((await cache.ids("u", "f", ["chat:", "draft:", "unsent:"])).sort(), ["a", "b"]);
});
