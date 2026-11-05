import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSessions,
  chatSessionStatus,
  hasActiveTurn,
  homeRowStatus,
  isBusyStatus,
  isSessionStatus,
  rowGitStatus,
  rowStatus,
  rowStatusColor,
  rowStatusLabel,
  SESSION_STATUS_ORDER,
  type RowPr,
} from "./rowStatus.ts";

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

// Session statuses beyond working/idle, read with REA from Conductor 0.87.6's renderApp
// chunk: `tTr`/`nTr` (order), `CXo` (row mapping), `lTo` (active turn), `vJo` + `aWt` (Home).

test("every conductor.db session status parses; anything else does not", () => {
  for (const s of ["idle", "working", "error", "needs_plan_response", "needs_user_input", "needs_user_permission", "cancelling", "waiting"]) assert.ok(isSessionStatus(s), s);
  for (const s of ["needs_input", "planning", "Working", "", null, undefined, 3]) assert.ok(!isSessionStatus(s), String(s));
});

test("each active session status maps to its row status and label", () => {
  const cases = [
    ["needs_plan_response", "needs-plan-response", "Needs plan response"],
    ["needs_user_permission", "needs-user-permission", "Needs permission"],
    ["needs_user_input", "needs-user-input", "Needs input"],
    ["working", "working", "Working"],
    ["cancelling", "cancelling", "Cancelling"],
    ["waiting", "waiting", "Waiting for background tasks"],
  ] as const;
  for (const [session, row, label] of cases) {
    assert.equal(rowStatus({ session, pr: pr({ isMerged: true }) }), row, session);
    assert.equal(rowStatusLabel(rowStatus({ session })), label, session);
  }
});

test("the most urgent session wins: needs-* before working, cancelling and waiting", () => {
  assert.equal(aggregateSessions(["waiting", "cancelling", "working", "needs_user_input"]), "needs_user_input");
  assert.equal(aggregateSessions(["needs_user_input", "needs_user_permission"]), "needs_user_permission");
  assert.equal(aggregateSessions(["waiting", "cancelling"]), "cancelling");
  assert.equal(aggregateSessions(["idle", "waiting"]), "waiting");
  assert.deepEqual([...SESSION_STATUS_ORDER].slice(0, 3), ["needs_plan_response", "needs_user_permission", "needs_user_input"]);
});

test("a turn is in flight while working, needing the user or cancelling, not while waiting", () => {
  const active = SESSION_STATUS_ORDER.filter(hasActiveTurn);
  assert.deepEqual(active, ["needs_plan_response", "needs_user_permission", "needs_user_input", "working", "cancelling"]);
});

test("the chat reports cancelling over working, and error only once the turn ended", () => {
  assert.equal(chatSessionStatus({ running: false, queue: "idle" }), "idle");
  assert.equal(chatSessionStatus({ running: true, queue: "working" }), "working");
  assert.equal(chatSessionStatus({ running: true, queue: "idle" }), "working");
  assert.equal(chatSessionStatus({ running: false, queue: "working" }), "working");
  assert.equal(chatSessionStatus({ running: true, queue: "cancelling" }), "cancelling");
  assert.equal(chatSessionStatus({ running: false, queue: "error" }), "error");
  assert.equal(chatSessionStatus({ running: true, queue: "error" }), "working");
});

test("Home shows session and setup statuses in place of the time, never PR or branch ones", () => {
  assert.equal(homeRowStatus({ session: "needs_user_input" }), "needs-user-input");
  assert.equal(homeRowStatus({ session: "needs_user_permission" }), "needs-user-permission");
  assert.equal(homeRowStatus({ session: "needs_plan_response" }), "needs-plan-response");
  assert.equal(homeRowStatus({ session: "working" }), "working");
  assert.equal(homeRowStatus({ session: "cancelling" }), "cancelling");
  assert.equal(homeRowStatus({ session: "waiting" }), "waiting");
  assert.equal(homeRowStatus({ workspaceState: "setting_up", session: "needs_user_input" }), "setting-up");
  assert.equal(homeRowStatus({ workspaceState: "failed" }), "failed");
  assert.equal(homeRowStatus({ workspaceState: "unstarted", session: "working" }), null);
  assert.equal(homeRowStatus({ workspaceState: "ready", session: "idle" }), null);
  assert.equal(homeRowStatus({ session: "error" }), null);
  assert.equal(homeRowStatus({}), null);
});

test("cancelling and waiting draw the busy loader; needs-* draw an icon", () => {
  assert.ok(isBusyStatus("cancelling"));
  assert.ok(isBusyStatus("waiting"));
  for (const s of ["needs-user-input", "needs-user-permission", "needs-plan-response"] as const) assert.ok(!isBusyStatus(s), s);
});
