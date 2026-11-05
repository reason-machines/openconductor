import { test } from "node:test";
import assert from "node:assert/strict";
import { duePrPolls, nextPrPollIn, PrPollScheduler, prPollable, SIDEBAR_PR_INTERVAL_MS, type PrPollSub } from "./sidebarPrPoll.ts";

const sub = (workspaceId: string, repoPath = "/r/a"): PrPollSub => ({ workspaceId, repoPath });

test("Conductor's sidebar interval is 5 minutes", () => assert.equal(SIDEBAR_PR_INTERVAL_MS, 300_000));

test("due rows are never fetched or fetched 5+ minutes ago, not in flight, grouped by repository", () => {
  const last = new Map([["fresh", 1_000_000 - 1000], ["stale", 1_000_000 - 300_000]]);
  const due = duePrPolls([sub("new"), sub("fresh"), sub("stale"), sub("busy"), sub("other", "/r/b")], last, new Set(["busy"]), 1_000_000);
  assert.deepEqual([...due.entries()].map(([r, s]) => [r, s.map((x) => x.workspaceId)]), [["/r/a", ["new", "stale"]], ["/r/b", ["other"]]]);
});

test("the next poll waits for the earliest row", () => {
  assert.equal(nextPrPollIn([], new Map(), 0), null);
  assert.equal(nextPrPollIn([sub("a"), sub("b")], new Map([["a", 0], ["b", 100_000]]), 200_000), 100_000);
  assert.equal(nextPrPollIn([sub("a"), sub("c")], new Map([["a", 0]]), 10), 0);
});

test("only set-up or ready workspaces are polled", () => {
  assert.equal(prPollable("ready"), true);
  assert.equal(prPollable("setting_up"), true);
  assert.equal(prPollable("initializing"), false);
  assert.equal(prPollable("failed"), false);
});

function fakeTimers() {
  let now = 0;
  let pending: { fn: () => void; at: number } | null = null;
  return {
    timers: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => (pending = { fn, at: now + ms }),
      clearTimeout: () => (pending = null),
    },
    /** Move the clock to the pending timer and run it. */
    fire() {
      const p = pending;
      assert.ok(p, "a timer is pending");
      pending = null;
      now = p.at;
      p.fn();
    },
    get dueAt() {
      return pending?.at ?? null;
    },
  };
}

test("rows on screen are fetched at once in one batch per repo, then again every 5 minutes", async () => {
  const t = fakeTimers();
  const calls: string[][] = [];
  const s = new PrPollScheduler<PrPollSub>(async (repo, subs) => void calls.push([repo, ...subs.map((x) => x.workspaceId)]), t.timers);
  s.subscribe(sub("a"));
  const stopB = s.subscribe(sub("b"));
  s.subscribe(sub("c", "/r/b"));
  t.fire();
  assert.deepEqual(calls, [["/r/a", "a", "b"], ["/r/b", "c"]]);
  await new Promise((r) => setImmediate(r));
  assert.equal(t.dueAt, 300_000);
  stopB();
  t.fire();
  assert.deepEqual(calls.slice(2), [["/r/a", "a"], ["/r/b", "c"]]);
});

test("the open workspace's own read counts: leaving it does not refetch at once", () => {
  const t = fakeTimers();
  const calls: string[] = [];
  const s = new PrPollScheduler<PrPollSub>(async (_r, subs) => void calls.push(...subs.map((x) => x.workspaceId)), t.timers);
  s.markFresh("a");
  s.subscribe(sub("a"));
  t.fire();
  assert.deepEqual(calls, []);
  assert.equal(t.dueAt, 300_000);
});
