import assert from "node:assert/strict";
import { test } from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { decodeCursor, encodeCursor, isOverdue, localDueTime, taskClock, taskDue } from "../dist/task-rules.js";

const at = (iso, zone) => taskClock(zone, Temporal.Instant.from(iso));

test("a date-only task becomes overdue after its due day ends in the family time zone", () => {
  const task = { status: "todo", dueDate: "2026-11-17", dueAt: null };
  // 23:30 in Toronto on the due day is already the 18th in UTC.
  assert.equal(isOverdue(task, at("2026-11-18T04:30:00Z", "America/Toronto")), false);
  assert.equal(isOverdue(task, at("2026-11-18T05:00:00Z", "America/Toronto")), true);
  assert.equal(isOverdue(task, at("2026-11-18T00:00:00Z", "UTC")), true);
});

test("a timed task becomes overdue once its due instant passes", () => {
  const due = taskDue("2026-11-17", "17:00", "America/Toronto");
  assert.deepEqual(due, { dueDate: "2026-11-17", dueAt: "2026-11-17T22:00:00Z" });
  const task = { status: "in_progress", ...due };
  assert.equal(isOverdue(task, at("2026-11-17T21:59:59Z", "America/Toronto")), false);
  assert.equal(isOverdue(task, at("2026-11-17T22:00:01Z", "America/Toronto")), true);
  assert.equal(localDueTime(due.dueAt, "America/Toronto"), "17:00");
});

test("completion clears overdue and tasks without a due date are never overdue", () => {
  const clock = at("2027-01-01T12:00:00Z", "UTC");
  assert.equal(isOverdue({ status: "completed", dueDate: "2026-11-01", dueAt: null }, clock), false);
  assert.equal(isOverdue({ status: "todo", dueDate: null, dueAt: null }, clock), false);
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-01", dueAt: null }, clock), true);
});

test("due times on a daylight-saving day keep local time and reject skipped or repeated times", () => {
  const spring = taskDue("2027-03-14", "09:00", "America/Toronto");
  assert.equal(spring.dueAt, "2027-03-14T13:00:00Z");
  assert.throws(() => taskDue("2027-03-14", "02:30", "America/Toronto"), /clocks change/);
  assert.throws(() => taskDue("2027-11-07", "01:30", "America/Toronto"), /clocks change/);
  assert.equal(taskClock("America/Toronto", Temporal.Instant.from("2027-03-14T04:30:00Z")).today, "2027-03-13");
});

test("a due time requires a due date", () => {
  assert.throws(() => taskDue(null, "09:00", "UTC"), /due date/);
  assert.deepEqual(taskDue(null, null, "UTC"), { dueDate: null, dueAt: null });
  assert.deepEqual(taskDue("2026-11-01", null, "UTC"), { dueDate: "2026-11-01", dueAt: null });
});

test("page cursors round-trip and reject tampered values", () => {
  const cursor = ["2026-11-17", "infinity", "2026-11-17 10:00:00.123456+00", "6b0c5f7e-8d34-4bd8-9e0e-1a3c4b5d6e7f"];
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  assert.throws(() => decodeCursor("not-a-cursor"), /cursor/);
  assert.throws(() => decodeCursor(Buffer.from("[1,2,3,4]").toString("base64url")), /cursor/);
});
