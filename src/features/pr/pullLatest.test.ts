import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_SCENARIOS } from "./demo.ts";
import { PULLED_TOAST, pullButton, pullEffect, pullFailedToast, pullLabel, pullShortcutTarget, type PullLatestInputs } from "./pullLatest.ts";
import type { GitState, PrInfo, PrStatus } from "./types.ts";

const pr = (DEMO_SCENARIOS.ready().lookup.lookup as { kind: "found"; info: PrInfo }).info;
const git: GitState = { ...DEMO_SCENARIOS.ready().git, targetBehind: 3 };
const base: PullLatestInputs = { pr: null, git, targetBranch: "main", readOnly: false, pulling: false };
const withStatus = (patch: Partial<PrStatus>): PrInfo => ({ ...pr, status: { ...pr.status!, ...patch } });

test("git.pull pulls the PR's base, else the workspace target", () => {
  assert.equal(pullShortcutTarget(base), "main");
  assert.equal(pullShortcutTarget({ ...base, pr: { ...pr, baseRefName: "release" } }), "release");
  assert.equal(pullShortcutTarget({ ...base, pr: { ...pr, baseRefName: "" } }), "main");
});

test("git.pull passes the key on when the reference's handler returns false", () => {
  assert.equal(pullShortcutTarget({ ...base, readOnly: true }), null, "read-only");
  assert.equal(pullShortcutTarget({ ...base, pulling: true }), null, "already pulling");
  assert.equal(pullShortcutTarget({ ...base, targetBranch: "" }), null, "no target");
  assert.equal(pullShortcutTarget({ ...base, pr: { ...pr, isMerged: true } }), null, "merged PR");
  assert.equal(pullShortcutTarget({ ...base, pr: withStatus({ mergeState: "DIRTY" }) }), null, "conflicting PR");
  assert.equal(pullShortcutTarget({ ...base, git: { ...git, targetBehind: 0 } }), null, "target has nothing new");
  assert.equal(pullShortcutTarget({ ...base, git: null }), null, "git state not loaded");
  // Like the reference, an unknown count and a working agent do not stop the shortcut.
  assert.equal(pullShortcutTarget({ ...base, git: { ...git, targetBehind: null } }), "main");
});

test("the Changes panel button shows only when the target has commits and the branch is not behind its remote", () => {
  assert.deepEqual(pullButton({ ...base, agentWorking: false }), { target: "main", behind: 3, disabled: false });
  assert.equal(pullButton({ ...base, agentWorking: true }), null, "agent working");
  assert.equal(pullButton({ ...base, agentWorking: false, git: { ...git, detached: true } }), null, "detached HEAD");
  assert.equal(pullButton({ ...base, agentWorking: false, git: { ...git, targetBehind: 0 } }), null);
  assert.equal(pullButton({ ...base, agentWorking: false, git: { ...git, targetBehind: null } }), null);
  assert.equal(pullButton({ ...base, agentWorking: false, git: { ...git, upstream: { branchExists: true, diverged: false, ahead: 0, behind: 2 } } }), null, "remote branch ahead");
  assert.equal(pullButton({ ...base, agentWorking: false, pr: withStatus({ mergeState: "DIRTY" }) }), null);
  assert.equal(pullButton({ ...base, agentWorking: false, pr: { ...pr, isMerged: true } }), null);
  assert.equal(pullButton({ ...base, agentWorking: false, readOnly: true })?.disabled, true);
  assert.equal(pullButton({ ...base, agentWorking: false, pulling: true })?.disabled, true);
});

test("labels and outcomes use the reference's strings", () => {
  assert.equal(pullLabel({ target: "main", behind: 3 }, false), "Pull latest from main (3 commits)");
  assert.equal(pullLabel({ target: "main", behind: 3 }, true), "Pulling latest...");
  assert.deepEqual(pullEffect({ kind: "pulled" }, "main"), { kind: "toast", level: "info", message: PULLED_TOAST });
  assert.equal(PULLED_TOAST, "Pulled latest changes. You're up to date!");
  assert.deepEqual(pullEffect({ kind: "upToDate" }, "main"), { kind: "none" });
  assert.deepEqual(pullEffect({ kind: "agent", message: "Merge origin/main into this branch. Then push." }, "main"), { kind: "agent", message: "Merge origin/main into this branch. Then push." });
  assert.deepEqual(pullEffect({ kind: "targetMissing" }, "dev"), { kind: "toast", level: "error", message: "Target branch dev does not exist" });
  assert.equal(pullFailedToast("no network"), "Pulling latest from remote failed: no network");
});
