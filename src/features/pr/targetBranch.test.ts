import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVED_TARGET_MESSAGE, effectiveTargetBranch, planTargetChange, savedAfterRetargetFailed } from "./targetBranch.ts";

const open = { number: 7, baseRefName: "develop", isMerged: false };
const merged = { ...open, isMerged: true };

test("an open PR's base is the target; otherwise the saved one, then the repo default", () => {
  assert.equal(effectiveTargetBranch(open, "main", "main"), "develop");
  assert.equal(effectiveTargetBranch(merged, "release", "main"), "release");
  assert.equal(effectiveTargetBranch(null, null, "main"), "main");
  assert.equal(effectiveTargetBranch(null, "  ", "trunk"), "trunk");
});

test("archived workspaces refuse a target change", () => {
  assert.deepEqual(planTargetChange({ archived: true, pr: null, intended: null, repoDefault: "main" }, "dev"), { kind: "refuse", message: ARCHIVED_TARGET_MESSAGE });
});

test("an open PR with another base is retargeted, then the branch is saved", () => {
  assert.deepEqual(planTargetChange({ archived: false, pr: open, intended: "develop", repoDefault: "main" }, " main "), { kind: "change", branch: "main", retarget: 7 });
});

test("a merged PR or no PR only saves the branch", () => {
  assert.deepEqual(planTargetChange({ archived: false, pr: merged, intended: null, repoDefault: "main" }, "develop"), { kind: "change", branch: "develop", retarget: null });
  assert.deepEqual(planTargetChange({ archived: false, pr: null, intended: "main", repoDefault: "main" }, "develop"), { kind: "change", branch: "develop", retarget: null });
});

test("picking the current target changes nothing; a PR already on it still saves an unset target", () => {
  assert.deepEqual(planTargetChange({ archived: false, pr: null, intended: "main", repoDefault: "main" }, "main"), { kind: "noop" });
  assert.deepEqual(planTargetChange({ archived: false, pr: open, intended: null, repoDefault: "main" }, "develop"), { kind: "change", branch: "develop", retarget: null });
  assert.deepEqual(planTargetChange({ archived: false, pr: null, intended: null, repoDefault: "main" }, "  "), { kind: "noop" });
});

test("a failed save after a retarget says the PR moved", () => {
  assert.equal(savedAfterRetargetFailed(7, "main", new Error("disk full")), "PR #7 now targets main, but saving the workspace's target branch failed: disk full");
});
