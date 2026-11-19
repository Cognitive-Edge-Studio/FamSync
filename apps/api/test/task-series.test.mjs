import assert from "node:assert/strict";
import { test } from "node:test";
import { repeatDates } from "../dist/calendar-recurrence.js";
import { pendingDates } from "../dist/task-series.store.js";

const rule = (frequency, interval, start, until = null) => ({ frequency, interval, start, until });

test("daily, weekly, and monthly chores follow their interval and anchor", () => {
  assert.deepEqual(repeatDates(rule("daily", 2, "2026-11-15"), "2026-11-15", "2026-11-21"),
    ["2026-11-15", "2026-11-17", "2026-11-19", "2026-11-21"]);
  assert.deepEqual(repeatDates(rule("weekly", 1, "2026-11-16"), "2026-11-17", "2026-12-07"),
    ["2026-11-23", "2026-11-30", "2026-12-07"]);
  assert.deepEqual(repeatDates(rule("monthly", 1, "2027-01-31"), "2027-01-01", "2027-05-31"),
    ["2027-01-31", "2027-03-31", "2027-05-31"]);
});

test("an end date is inclusive and an open-ended chore repeats through the requested day", () => {
  assert.deepEqual(repeatDates(rule("weekly", 1, "2026-11-02", "2026-11-16"), "2026-11-01", "2026-12-31"),
    ["2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.equal(repeatDates(rule("daily", 1, "2026-01-01"), "2026-01-01", "2026-12-31").length, 365);
});

test("generation resumes after the last generated date and stops at today or the end date", () => {
  const daily = { ...rule("daily", 1, "2026-11-10"), generatedThrough: null };
  assert.deepEqual(pendingDates(daily, "2026-11-12"), ["2026-11-10", "2026-11-11", "2026-11-12"]);
  assert.deepEqual(pendingDates({ ...daily, generatedThrough: "2026-11-12" }, "2026-11-14"), ["2026-11-13", "2026-11-14"]);
  assert.deepEqual(pendingDates({ ...daily, generatedThrough: "2026-11-14" }, "2026-11-14"), []);
  assert.deepEqual(pendingDates({ ...daily, until: "2026-11-11" }, "2026-11-14"), ["2026-11-10", "2026-11-11"]);
  assert.deepEqual(pendingDates({ ...rule("daily", 1, "2026-11-20"), generatedThrough: null }, "2026-11-14"), []);
});

test("weekly generation keeps the original weekday after a gap", () => {
  const weekly = { ...rule("weekly", 2, "2026-11-02"), generatedThrough: "2026-11-05" };
  assert.deepEqual(pendingDates(weekly, "2026-12-14"), ["2026-11-16", "2026-11-30", "2026-12-14"]);
});
