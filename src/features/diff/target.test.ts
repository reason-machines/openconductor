// Run: node --test "src/**/*.test.ts"
// parity:diff.changes-list:test parity:diff.discard:test
import { test } from "node:test";
import assert from "node:assert/strict";
import { discardScope, scopeRequest, showUncommittedChanges, TARGET_REMOTE, targetBranch } from "./target.ts";

const target = (branch: string) => ({ branch, remote: TARGET_REMOTE });

test("All changes uses the workspace's target branch, not the repo default", () => {
  assert.equal(targetBranch({ prBase: null, prMerged: false, intended: "develop", fallback: "main" }), "develop");
  assert.deepEqual(scopeRequest("all", target("develop")), { kind: "all", base: "develop", remote: "origin" });
});

test("an open pull request's base wins over the stored target; a merged one does not", () => {
  assert.equal(targetBranch({ prBase: "release", prMerged: false, intended: "develop", fallback: "main" }), "release");
  assert.equal(targetBranch({ prBase: "release", prMerged: true, intended: "develop", fallback: "main" }), "develop");
});

test("a workspace without a stored target falls back to the repo default", () => {
  assert.equal(targetBranch({ prBase: null, prMerged: false, intended: null, fallback: "trunk" }), "trunk");
  assert.equal(targetBranch({ prBase: null, prMerged: false, intended: "  ", fallback: "trunk" }), "trunk");
});

test("Uncommitted sends no target", () => {
  assert.deepEqual(scopeRequest("uncommitted", target("develop")), { kind: "uncommitted" });
});

test("the context menu discards against the All changes base in every view", () => {
  assert.equal(discardScope("menu", "all", false), "all");
  assert.equal(discardScope("menu", "uncommitted", false), "all");
  // Turn view: offered, and still the All changes base, never the turn's start checkpoint.
  assert.equal(discardScope("menu", "uncommitted", true), "all");
  assert.deepEqual(scopeRequest(discardScope("menu", "uncommitted", true)!, target("develop")), { kind: "all", base: "develop", remote: "origin" });
});

test("revert icons use the view's scope and are off in the turn view", () => {
  assert.equal(discardScope("view", "all", false), "all");
  assert.equal(discardScope("view", "uncommitted", false), "uncommitted");
  assert.equal(discardScope("view", "all", true), null);
  assert.equal(discardScope("view", "uncommitted", true), null);
});

test("Cmd+Alt+U opens Changes in Uncommitted, and toggles back to All changes from there", () => {
  assert.deepEqual(showUncommittedChanges("files", "all", false), { tab: "changes", scope: "uncommitted" });
  assert.deepEqual(showUncommittedChanges("changes", "all", false), { tab: "changes", scope: "uncommitted" });
  assert.deepEqual(showUncommittedChanges("changes", "uncommitted", false), { tab: "changes", scope: "all" });
  // Another tab showing, or a turn selected: go to Uncommitted rather than toggling away.
  assert.deepEqual(showUncommittedChanges("checks", "uncommitted", false), { tab: "changes", scope: "uncommitted" });
  assert.deepEqual(showUncommittedChanges("changes", "uncommitted", true), { tab: "changes", scope: "uncommitted" });
});
