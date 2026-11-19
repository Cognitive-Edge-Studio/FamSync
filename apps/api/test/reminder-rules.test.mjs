import assert from "node:assert/strict";
import { test } from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { defaultTaskReminder, dueInstant, isLateForEmail, localInstant, quietHoursEnd, remindAt } from "../dist/reminder-rules.js";

const at = (iso) => Temporal.Instant.from(iso);

test("date-only items remind from 08:00 local and timed items from their due time", () => {
  assert.equal(dueInstant({ dueDate: "2026-11-20", dueAt: null }, "America/Toronto").toString(), "2026-11-20T13:00:00Z");
  assert.equal(remindAt(dueInstant({ dueDate: "2026-11-20", dueAt: null }, "America/Toronto"), 1440).toString(), "2026-11-19T13:00:00Z");
  assert.equal(remindAt(dueInstant({ dueDate: "2026-11-20", dueAt: "2026-11-20T22:00:00Z" }, "UTC"), 60).toString(), "2026-11-20T21:00:00Z");
});

test("offsets count back in real time across a daylight-saving change", () => {
  // 09:00 on the spring-forward day is 13:00 UTC; one day earlier is 13:00 UTC on Saturday, which is 08:00 local.
  const due = localInstant("2027-03-14", "09:00", "America/Toronto");
  assert.equal(due.toString(), "2027-03-14T13:00:00Z");
  assert.equal(remindAt(due, 1440).toZonedDateTimeISO("America/Toronto").toPlainTime().toString(), "08:00:00");
  // A local time in the gap moves forward, and a repeated time uses the later instant, matching PostgreSQL.
  assert.equal(localInstant("2027-03-14", "02:30", "America/Toronto").toString(), "2027-03-14T07:30:00Z");
  assert.equal(localInstant("2027-11-07", "01:30", "America/Toronto").toString(), "2027-11-07T06:30:00Z");
});

test("new tasks default to an hour before a due time or 08:00 on a date-only due day", () => {
  assert.equal(defaultTaskReminder("2026-11-20", "17:00"), 60);
  assert.equal(defaultTaskReminder("2026-11-20", null), 0);
  assert.equal(defaultTaskReminder(null, null), null);
});

test("quiet hours hold email until they end, including overnight windows", () => {
  const quiet = { enabled: true, start: "21:00", end: "07:00" };
  // 22:30 Toronto on Nov 20 waits for 07:00 Nov 21.
  assert.equal(quietHoursEnd(at("2026-11-21T03:30:00Z"), quiet, "America/Toronto")?.toString(), "2026-11-21T12:00:00Z");
  // 05:00 Toronto waits for 07:00 the same morning.
  assert.equal(quietHoursEnd(at("2026-11-21T10:00:00Z"), quiet, "America/Toronto")?.toString(), "2026-11-21T12:00:00Z");
  assert.equal(quietHoursEnd(at("2026-11-21T17:00:00Z"), quiet, "America/Toronto"), null);
  assert.equal(quietHoursEnd(at("2026-11-21T03:30:00Z"), { ...quiet, enabled: false }, "America/Toronto"), null);
  const daytime = { enabled: true, start: "13:00", end: "15:00" };
  assert.equal(quietHoursEnd(at("2026-11-21T14:00:00Z"), daytime, "UTC")?.toString(), "2026-11-21T15:00:00Z");
});

test("a reminder more than two hours late gets no email", () => {
  const due = at("2026-11-20T12:00:00Z");
  assert.equal(isLateForEmail(due, at("2026-11-20T13:59:00Z")), false);
  assert.equal(isLateForEmail(due, at("2026-11-20T14:01:00Z")), true);
});
