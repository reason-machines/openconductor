import { test } from "node:test";
import assert from "node:assert/strict";
import { turnDayClock, formatTurnDuration, formatTurnEnd, turnTime } from "./turnTime.ts";

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

test("an idle completed-turn label changes at midnight and at the week boundary", (t) => {
  const midnight = new Date(2026, 10, 6).getTime();
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: midnight - 1000 });
  const clock = turnDayClock();
  const start = new Date(2026, 10, 5, 10, 29).toISOString();
  const end = new Date(2026, 10, 5, 10, 37).toISOString();
  const labels: string[] = [];
  const refresh = () => {
    const label = turnTime(start, end, clock.getSnapshot(), "en-US")?.label;
    assert.ok(label);
    labels.push(label);
  };
  refresh();
  const unsubscribe = clock.subscribe(refresh);
  t.mock.timers.tick(999);
  assert.deepEqual(labels, ["8m, 0s · 10:37 AM"]);
  t.mock.timers.tick(1);
  assert.deepEqual(labels, ["8m, 0s · 10:37 AM", "8m, 0s · Thu 10:37 AM"]);
  for (let day = 0; day < 6; day++) t.mock.timers.tick(24 * 60 * 60 * 1000);
  assert.equal(labels.at(-1), "8m, 0s · Nov 5, 10:37 AM");
  unsubscribe();
});

test("unsubscribing prevents subsequent day changes from refreshing a closed transcript", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(2026, 10, 5, 23, 59, 59).getTime() });
  const clock = turnDayClock();
  let updates = 0;
  const unsubscribe = clock.subscribe(() => updates++);
  unsubscribe();
  t.mock.timers.tick(2 * 24 * 60 * 60 * 1000);
  assert.equal(updates, 0);
});

test("a transcript can unsubscribe during a day refresh without another refresh", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(2026, 10, 5, 23, 59, 59).getTime() });
  const clock = turnDayClock();
  let updates = 0;
  const unsubscribe = clock.subscribe(() => { updates++; unsubscribe(); });
  t.mock.timers.tick(1000);
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  assert.equal(updates, 1);
});

test("the day snapshot is stable within a date and resubscription schedules a new refresh", (t) => {
  const midnight = new Date(2026, 10, 6).getTime();
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: midnight - 1000 });
  const clock = turnDayClock();
  const snapshot = clock.getSnapshot();
  t.mock.timers.tick(500);
  assert.equal(clock.getSnapshot(), snapshot);
  let updates = 0;
  const unsubscribe = clock.subscribe(() => updates++);
  unsubscribe();
  const dispose = clock.subscribe(() => updates++);
  t.mock.timers.tick(1000);
  assert.equal(updates, 1);
  assert.equal(clock.getSnapshot(), midnight);
  dispose();
});

test("local midnight follows the 23-hour and 25-hour DST days, not a fixed 24-hour delay", (t) => {
  const timezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  t.after(() => { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; });
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(2026, 2, 8).getTime() });
  let updates = 0;
  const clock = turnDayClock();
  const unsubscribe = clock.subscribe(() => updates++);
  t.mock.timers.tick(23 * 60 * 60 * 1000 - 1);
  assert.equal(updates, 0);
  t.mock.timers.tick(1);
  assert.equal(updates, 1);
  assert.equal(clock.getSnapshot(), new Date(2026, 2, 9).getTime());
  unsubscribe();
  t.mock.timers.setTime(new Date(2026, 10, 1).getTime());
  const dispose = clock.subscribe(() => updates++);
  t.mock.timers.tick(25 * 60 * 60 * 1000 - 1);
  assert.equal(updates, 1);
  t.mock.timers.tick(1);
  assert.equal(updates, 2);
  assert.equal(clock.getSnapshot(), new Date(2026, 10, 2).getTime());
  dispose();
});

test("no footer time without both ends", () => {
  assert.equal(turnTime(undefined, "2026-11-05T10:37:00Z"), undefined);
  assert.equal(turnTime("2026-11-05T10:29:00Z", undefined), undefined);
  assert.equal(turnTime("nope", "2026-11-05T10:37:00Z"), undefined);
});
