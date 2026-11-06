import { test } from "node:test";
import assert from "node:assert/strict";
import { initIssue, reportInitIssue, subscribeInitIssues, WORKTREE_PARTIAL_FAILURE, type InitIssue } from "./initIssues.ts";
import { UPSTREAM_WARNING } from "./upstream.ts";

const created = (aux: string | null, log: string | null = "/tmp/conductor-1-abc.log") => ({
  workspace: { id: "app/oslo" },
  auxiliaryFailureMessage: aux,
  initializationLogPath: log,
});

test("no auxiliary message, no issue", () => {
  assert.equal(initIssue(created(null)), null);
  assert.equal(initIssue(created("  ")), null);
  assert.equal(initIssue({ workspace: { id: "x" } }), null);
});

test("an issue carries the joined message and the log path", () => {
  const message = `${WORKTREE_PARTIAL_FAILURE} ${UPSTREAM_WARNING}`;
  assert.deepEqual(initIssue(created(message)), { workspaceId: "app/oslo", message, logPath: "/tmp/conductor-1-abc.log" });
  // Without a log there is nothing to view.
  assert.equal(initIssue(created(message, null))?.logPath, null);
  assert.equal(initIssue(created(message, ""))?.logPath, null);
});

test("issues reported before a listener mounts are delivered to it once", () => {
  reportInitIssue(created("early"));
  const seen: InitIssue[] = [];
  const off = subscribeInitIssues((i) => seen.push(i));
  reportInitIssue(created(null));
  reportInitIssue(created("late"));
  off();
  const again: InitIssue[] = [];
  subscribeInitIssues((i) => again.push(i))();
  assert.deepEqual(seen.map((i) => i.message), ["early", "late"]);
  assert.deepEqual(again, []);
});
