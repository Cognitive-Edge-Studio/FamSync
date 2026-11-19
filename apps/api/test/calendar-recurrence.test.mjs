import assert from "node:assert/strict";
import { test } from "node:test";
import {
  occurrencesInRange, previewSeries, scheduleOverlaps, seriesOccurrence, validateSeries,
} from "../dist/calendar-recurrence.js";
import { calendarRange } from "../dist/calendar-time.js";

test("weekly intervals align with the first weekday and include the cutoff", () => {
  const series = validateSeries({ allDay: true, start: "2026-11-16", end: "2026-11-17" }, {
    frequency: "weekly", interval: 2, until: "2026-12-14",
  }, "UTC");
  assert.deepEqual(previewSeries(series).occurrences.map(({ originalDate }) => originalDate), [
    "2026-11-16", "2026-11-30", "2026-12-14",
  ]);
  assert.equal(seriesOccurrence(series, "2026-11-23"), undefined);
});

test("monthly occurrences skip missing days without shifting the anchor", () => {
  const series = validateSeries({ allDay: true, start: "2027-01-31", end: "2027-02-01" }, {
    frequency: "monthly", interval: 1, until: "2027-05-31",
  }, "UTC");
  assert.deepEqual(previewSeries(series).occurrences.map(({ originalDate }) => originalDate), [
    "2027-01-31", "2027-03-31", "2027-05-31",
  ]);
});

test("timed occurrences keep local time across DST and skip missing local starts", () => {
  const rule = { frequency: "weekly", interval: 1, until: "2027-03-21" };
  const daytime = validateSeries({ allDay: false, start: "2027-03-07T09:00", end: "2027-03-07T10:00" }, rule, "America/Toronto");
  assert.deepEqual(previewSeries(daytime).occurrences.map(({ start }) => start), [
    "2027-03-07T14:00:00.000Z", "2027-03-14T13:00:00.000Z", "2027-03-21T13:00:00.000Z",
  ]);
  const overnight = validateSeries({ allDay: false, start: "2027-03-07T02:30", end: "2027-03-07T03:30" }, rule, "America/Toronto");
  assert.equal(seriesOccurrence(overnight, "2027-03-14"), undefined);
  assert.equal(previewSeries(overnight).occurrences.length, 2);
});

test("a multi-day occurrence can overlap a range after the final start date", () => {
  const series = validateSeries({ allDay: true, start: "2026-11-16", end: "2026-11-19" }, {
    frequency: "weekly", interval: 1, until: "2026-11-23",
  }, "UTC");
  const range = calendarRange("UTC", "2026-11-25", "2026-11-26");
  const overlaps = [...occurrencesInRange(series, range)].filter((occurrence) => scheduleOverlaps(occurrence, range));
  assert.deepEqual(overlaps, [{ originalDate: "2026-11-23", allDay: true, start: "2026-11-23", end: "2026-11-26" }]);
});
