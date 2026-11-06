import { test } from "node:test";
import assert from "node:assert/strict";
import { COARSE_CELLS, ERROR_CELLS, FINE_CELLS, FULL_PATH, MERGED_CELLS, RING_PATH, matrixLabel, statusMatrix } from "./statusMatrix.ts";

const dots = (path: string) => path.split("M").length - 1;
const animated = (m: ReturnType<typeof statusMatrix>, a: string) => m.overlay?.filter((c) => c.animation === a).length ?? 0;

test("the grid is 4×4 dots of 1.5 inside a 16×16 icon, with a 7×7 fine grid over the same 10.5 square", () => {
  assert.equal(COARSE_CELLS.length, 16);
  assert.deepEqual([COARSE_CELLS[0].x, COARSE_CELLS[15].x, COARSE_CELLS[15].y], [2.5, 11.5, 11.5]);
  assert.equal(FINE_CELLS.length, 49);
  assert.equal(FINE_CELLS[48].x + 1.5, 2.5 + 10.5);
  assert.equal(dots(FULL_PATH), 16);
  assert.match(FULL_PATH, /^M2\.5 2\.5h1\.5v1\.5h-1\.5Z/);
  assert.equal(dots(RING_PATH), 12);
  assert.equal(MERGED_CELLS.length, 25);
  // Failed is an X: both diagonals of the 4×4 grid.
  assert.deepEqual(
    ERROR_CELLS.map((c) => [c.column, c.row]),
    [[0, 0], [3, 0], [1, 1], [2, 1], [1, 2], [2, 2], [0, 3], [3, 3]],
  );
});

test("unstarted draws only the ring, dim, with no overlay", () => {
  const m = statusMatrix({ status: "unstarted" });
  assert.equal(m.base.path, RING_PATH);
  assert.equal(m.base.opacity, 0.32);
  assert.equal(m.overlay, null);
  assert.equal(m.label, "Unstarted");
  assert.equal(m.activity, "steady");
});

test("working twinkles every fine dot in the foreground colour", () => {
  const m = statusMatrix({ status: "working", gitStatus: "branch" });
  assert.equal(m.activity, "active");
  assert.equal(m.overlay?.length, 49);
  assert.equal(animated(m, "twinkle"), 49);
  assert.ok(m.overlay?.every((c) => c.foreground));
  assert.deepEqual(m.overlay?.flatMap((c, i) => (c.reducedHighlight ? [i] : [])), [2, 8, 13, 17, 24, 31, 35, 40, 46]);
  assert.equal(m.base.color, "muted");
  assert.equal(m.base.opacity, 0.32);
  assert.deepEqual(m.overlay?.[0].style, { "--workspace-matrix-twinkle-delay": `${-(11 / 49) * (1.15 + 5 / 13)}s`, "--workspace-matrix-twinkle-duration": `${1.15 + 5 / 13}s` });
});

test("an automation run scrolls chevrons instead of twinkling", () => {
  const m = statusMatrix({ status: "working", isAutomationRun: true });
  assert.equal(m.automation, true);
  assert.equal(m.overlay, null);
});

test("setting up animates the twelve ring dots; waiting and cancelling animate all sixteen", () => {
  const setup = statusMatrix({ status: "setting-up" });
  assert.equal(setup.overlay?.length, 16);
  assert.equal(animated(setup, "setting-up"), 12);
  assert.deepEqual(setup.overlay?.flatMap((c, i) => (c.setupCorner ? [i] : [])), [0, 3, 12, 15]);
  const waiting = statusMatrix({ status: "waiting" });
  assert.equal(animated(waiting, "waiting"), 16);
  assert.deepEqual(waiting.overlay?.flatMap((c, i) => (c.waitingStatic ? [i] : [])), [4, 5, 6, 7]);
  assert.equal(animated(statusMatrix({ status: "cancelling" }), "pulse"), 16);
  assert.equal(waiting.label, "Waiting for background tasks");
});

test("paused holds each animation on its still frame", () => {
  const m = statusMatrix({ status: "waiting", paused: true });
  assert.equal(animated(m, "waiting"), 0);
  assert.deepEqual(m.overlay?.flatMap((c, i) => (c.lit ? [i] : [])), [4, 5, 6, 7]);
  const setup = statusMatrix({ status: "setting-up", paused: true });
  assert.deepEqual(setup.overlay?.flatMap((c, i) => (c.lit ? [i] : [])), [0, 3, 12, 15]);
});

test("needs-you statuses blink the whole grid; permission and plan are highlighted, input is not", () => {
  for (const status of ["needs-user-permission", "needs-plan-response"] as const) {
    const m = statusMatrix({ status });
    assert.equal(m.attention, true);
    assert.equal(m.overlay, null);
    assert.equal(m.color, "highlight");
    assert.equal(m.dimmed, false);
  }
  const input = statusMatrix({ status: "needs-user-input" });
  assert.equal(input.attention, true);
  assert.equal(input.color, undefined);
  assert.equal(statusMatrix({ status: "needs-user-permission" }).label, "Needs permission");
});

test("failed shows the red X over a faded grid, without the blink", () => {
  const m = statusMatrix({ status: "failed" });
  assert.equal(m.error, true);
  assert.equal(m.attention, false);
  assert.deepEqual(m.base, { path: FULL_PATH, color: "destructive", opacity: 0.32 });
});

test("failing checks show the X on an idle workspace but not over a running agent", () => {
  assert.equal(statusMatrix({ status: "checks-failing" }).error, true);
  const busy = statusMatrix({ status: "working", gitStatus: "checks-failing" });
  assert.equal(busy.error, false);
  assert.equal(busy.color, "destructive");
  assert.equal(busy.base.opacity, 0.5);
  assert.equal(busy.label, "Working; Checks failing");
});

test("merged draws the purple checkerboard; running checks sweep diagonally", () => {
  const merged = statusMatrix({ status: "merged", gitStatus: "merged" });
  assert.equal(merged.merged, true);
  assert.equal(merged.color, "merged");
  assert.equal(merged.base.opacity, 1);
  const checks = statusMatrix({ status: "open-pr", gitStatus: "checks-pending" });
  assert.equal(checks.activity, "steady");
  assert.equal(animated(checks, "sweep"), 49);
  assert.ok(checks.overlay?.every((c) => !c.foreground));
  assert.deepEqual(checks.overlay?.[0].style, { "--workspace-matrix-sweep-delay": "-1.5s", "--workspace-matrix-sweep-duration": "1.5s" });
  assert.equal(checks.color, "checks-pending");
});

test("a plain workspace is a dim grid, lit in the foreground colour when unread", () => {
  const read = statusMatrix({ status: "branch", gitStatus: "branch" });
  assert.deepEqual([read.base.color, read.base.opacity, read.label], ["muted", 0.32, "Ready"]);
  const unread = statusMatrix({ status: "branch", gitStatus: "branch", hasUnread: true });
  assert.deepEqual([unread.base.color, unread.base.opacity, unread.label], ["foreground", 1, "Unread"]);
  const ready = statusMatrix({ status: "ready-to-merge", gitStatus: "ready-to-merge" });
  assert.deepEqual([ready.color, ready.dimmed], ["ready", false]);
});

test("the label lists the agent's status, the PR's, then Unread", () => {
  assert.equal(matrixLabel({ status: "working", gitStatus: "open-pr", hasUnread: true }), "Working; Pull request open; Unread");
  assert.equal(matrixLabel({ status: "working", gitStatus: "branch" }), "Working");
  assert.equal(matrixLabel({ status: "local" }), "Local workspace");
  assert.equal(matrixLabel({ status: "unstarted", hasUnread: true }), "Unstarted");
});
