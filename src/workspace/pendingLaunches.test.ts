import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_LAUNCH_TIMEOUT_MS,
  addLaunch,
  addPendingLaunch,
  expireLaunch,
  getPendingLaunches,
  launchesForRepo,
  removeLaunch,
  removePendingLaunch,
  subscribePendingLaunches,
} from "./pendingLaunches.ts";

test("adding a launch with an existing id replaces it", () => {
  const a = addLaunch([], { id: "x", repoId: "r1", startedAt: 1 });
  const b = addLaunch(a, { id: "x", repoId: "r1", startedAt: 2 });
  assert.deepEqual(b, [{ id: "x", repoId: "r1", startedAt: 2 }]);
});

test("removing an unknown id keeps the same list", () => {
  const list = [{ id: "x", repoId: "r1", startedAt: 1 }];
  assert.equal(removeLaunch(list, "y"), list);
  assert.deepEqual(removeLaunch(list, "x"), []);
});

test("the timeout drops a launch only if it was not re-added", () => {
  const list = [{ id: "x", repoId: "r1", startedAt: 2 }];
  assert.equal(expireLaunch(list, "x", 1), list);
  assert.deepEqual(expireLaunch(list, "x", 2), []);
});

test("launches are grouped by repository, oldest first", () => {
  let list = addLaunch([], { id: "a", repoId: "r1", startedAt: 1 });
  list = addLaunch(list, { id: "b", repoId: "r2", startedAt: 2 });
  list = addLaunch(list, { id: "c", repoId: "r1", startedAt: 3 });
  assert.deepEqual(launchesForRepo(list, "r1"), ["a", "c"]);
  assert.deepEqual(launchesForRepo(list, "r3"), []);
});

test("the store notifies on add and remove, and expires after 120 s", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const off = subscribePendingLaunches(() => calls++);
  addPendingLaunch("p1", "r1", 10);
  addPendingLaunch("p2", "r1", 11);
  assert.deepEqual(launchesForRepo(getPendingLaunches(), "r1"), ["p1", "p2"]);
  removePendingLaunch("p1");
  removePendingLaunch("p1");
  assert.equal(calls, 3);
  t.mock.timers.tick(PENDING_LAUNCH_TIMEOUT_MS - 1);
  assert.deepEqual(launchesForRepo(getPendingLaunches(), "r1"), ["p2"]);
  t.mock.timers.tick(1);
  assert.deepEqual(getPendingLaunches(), []);
  off();
});
