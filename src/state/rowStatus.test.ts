import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSessions, isBusyStatus, rowGitStatus, rowStatus, rowStatusColor, rowStatusLabel, type RowPr } from "./rowStatus.ts";

const pr = (over: Partial<RowPr> = {}): RowPr => ({
  number: 7,
  isMerged: false,
  isDraft: false,
  inMergeQueue: false,
  mergeState: "BLOCKED",
  checks: "passing",
  failingChecks: 0,
  viewerCanMerge: true,
  ...over,
});

test("setup state wins over the agent and the PR", () => {
  assert.equal(rowStatus({ workspaceState: "initializing", session: "working", pr: pr({ isMerged: true }) }), "setting-up");
  assert.equal(rowStatus({ workspaceState: "setting_up" }), "setting-up");
  assert.equal(rowStatus({ workspaceState: "failed" }), "failed");
  assert.equal(rowStatus({ workspaceState: "unstarted" }), "unstarted");
});

test("an active agent wins over the PR; idle and error fall through to it", () => {
  assert.equal(rowStatus({ workspaceState: "ready", session: "working", pr: pr({ isMerged: true }) }), "working");
  assert.equal(rowStatus({ session: "needs_user_permission" }), "needs-user-permission");
  assert.equal(rowStatus({ session: "idle", pr: pr({ isMerged: true }) }), "merged");
  assert.equal(rowStatus({ session: "error", pr: pr() }), "open-pr");
});

test("PR states follow Conductor's order", () => {
  assert.equal(rowStatus({ pr: pr({ isMerged: true, inMergeQueue: true }) }), "merged");
  assert.equal(rowStatus({ pr: pr({ inMergeQueue: true, mergeState: "CLEAN" }) }), "merge-queued");
  assert.equal(rowStatus({ pr: pr({ mergeState: "CLEAN" }) }), "ready-to-merge");
  assert.equal(rowStatus({ pr: pr({ mergeState: "CLEAN", viewerCanMerge: false }) }), "open-pr");
  assert.equal(rowStatus({ pr: pr({ mergeState: "CLEAN", isDraft: true }) }), "draft-pr");
  assert.equal(rowStatus({ pr: pr({ mergeState: "DIRTY", checks: "failing" }) }), "merge-conflict");
  assert.equal(rowStatus({ pr: pr({ checks: "failing" }) }), "checks-failing");
});

test("UNSTABLE is mergeable unless optional checks block and some failed", () => {
  const unstable = pr({ mergeState: "UNSTABLE", failingChecks: 1 });
  assert.equal(rowStatus({ pr: unstable }), "ready-to-merge");
  assert.equal(rowStatus({ pr: unstable, optionalChecksBlock: true }), "open-pr");
  assert.equal(rowStatus({ pr: pr({ mergeState: "UNSTABLE" }), optionalChecksBlock: true }), "ready-to-merge");
});

test("running checks show in the git status, not the row icon", () => {
  const pending = pr({ checks: "pending" });
  assert.equal(rowStatus({ pr: pending }), "open-pr");
  assert.equal(rowGitStatus({ pr: pending }), "checks-pending");
  assert.equal(rowGitStatus({ session: "working", pr: pending }), "checks-pending");
});

test("without a PR: branch when it has a remote, local otherwise", () => {
  assert.equal(rowStatus({ hasRemote: true }), "branch");
  assert.equal(rowStatus({ hasRemote: false, gitForge: "github" }), "local");
  assert.equal(rowStatus({ gitForge: "github" }), "branch");
  assert.equal(rowStatus({}), "local");
  assert.equal(rowStatus({ pr: null, hasRemote: true }), "branch");
});

test("sessions fold to the most urgent status", () => {
  assert.equal(aggregateSessions([]), "idle");
  assert.equal(aggregateSessions(["idle", "working", "error"]), "working");
  assert.equal(aggregateSessions(["working", "needs_user_input"]), "needs_user_input");
  assert.equal(aggregateSessions(["something-new"]), "idle");
});

test("labels, colours and loaders", () => {
  assert.equal(rowStatusLabel("branch"), "Ready");
  assert.equal(rowStatusLabel("checks-pending"), "Checks running");
  assert.equal(rowStatusColor("checks-failing"), "destructive");
  assert.equal(rowStatusColor("merged"), "merged");
  assert.equal(rowStatusColor("open-pr"), "muted");
  assert.ok(isBusyStatus("working") && isBusyStatus("setting-up"));
  assert.ok(!isBusyStatus("needs-user-input"));
});

test("Home shows the agent's or setup's status in place of the time, never a git status (vJo, aWt)", async () => {
  const { homeStatus, showsActivityStatus } = await import("./rowStatus.ts");
  const cases: [string | undefined, Parameters<typeof homeStatus>[1], string, boolean][] = [
    ["ready", "needs_plan_response", "needs-plan-response", true],
    ["ready", "needs_user_permission", "needs-user-permission", true],
    ["ready", "needs_user_input", "needs-user-input", true],
    ["ready", "working", "working", true],
    ["ready", "cancelling", "cancelling", true],
    ["ready", "waiting", "waiting", true],
    // Idle and error fall through to the branch status, which Home shows as the time.
    ["ready", "idle", "local", false],
    ["ready", "error", "local", false],
    // The workspace's own state comes first.
    ["initializing", "needs_user_input", "setting-up", true],
    ["failed", "working", "failed", true],
    ["unstarted", "idle", "unstarted", false],
  ];
  for (const [state, session, want, shown] of cases) {
    const s = homeStatus(state, session);
    assert.equal(s, want, `${state}/${session}`);
    assert.equal(showsActivityStatus(s), shown, `${state}/${session} shown`);
  }
  for (const git of ["merged", "open-pr", "checks-pending", "branch"] as const) assert.equal(showsActivityStatus(git), false);
});
