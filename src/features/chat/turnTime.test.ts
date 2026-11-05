import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTurnDuration, formatTurnEnd, turnTime } from "./turnTime.ts";

test("turn duration drops tenths and rolls seconds into minutes, as Conductor's footer does", () => {
  assert.equal(formatTurnDuration(480_000), "8m, 0s");
  assert.equal(formatTurnDuration(42_950), "42s");
  assert.equal(formatTurnDuration(0), "0s");
  assert.equal(formatTurnDuration(3_725_000), "62m, 5s");
  assert.equal(formatTurnDuration(480_300, { showTenths: true }), "8m, 0.3s");
});

test("turn end shows the time today, the weekday within a week, and the date after that", () => {
  const now = new Date(2026, 10, 5, 18, 0).getTime();
  assert.equal(formatTurnEnd(new Date(2026, 10, 5, 10, 37).getTime(), now, "en-US"), "10:37 AM");
  assert.equal(formatTurnEnd(new Date(2026, 10, 3, 10, 37).getTime(), now, "en-US"), "Tue 10:37 AM");
  assert.equal(formatTurnEnd(new Date(2026, 9, 20, 10, 37).getTime(), now, "en-US"), "Oct 20, 10:37 AM");
  assert.equal(formatTurnEnd(new Date(2025, 9, 20, 10, 37).getTime(), now, "en-US"), "Oct 20, 2025, 10:37 AM");
});

test("the footer label joins duration and end time; the hover gives start and end", () => {
  const start = new Date(2026, 10, 5, 10, 29).toISOString();
  const end = new Date(2026, 10, 5, 10, 37).toISOString();
  const t = turnTime(start, end, new Date(2026, 10, 5, 12, 0).getTime(), "en-US");
  assert.deepEqual(t, { label: "8m, 0s \u00b7 10:37 AM", range: "Nov 5, 2026, 10:29 AM \u2192 Nov 5, 2026, 10:37 AM" });
});

test("no footer time without both ends", () => {
  assert.equal(turnTime(undefined, "2026-11-05T10:37:00Z"), undefined);
  assert.equal(turnTime("2026-11-05T10:29:00Z", undefined), undefined);
  assert.equal(turnTime("nope", "2026-11-05T10:37:00Z"), undefined);
});
