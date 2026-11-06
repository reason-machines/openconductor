import { test } from "node:test";
import assert from "node:assert/strict";
import { byRecentActivity, labelTargetBranch, prettifyBranch, workspaceLabel } from "./sidebarLabel.ts";

test("branch names read as sentences", () => {
  assert.equal(prettifyBranch("ada/dark-mode-tokens"), "Ada/dark mode tokens");
  assert.equal(prettifyBranch("fix_login"), "Fix login");
  assert.equal(prettifyBranch("ada/fix-login", "ada/"), "Fix login");
});

test("a user-set name wins over the PR title and branch", () => {
  assert.equal(workspaceLabel({ name: "my thing", branch: "ada/x", prTitle: "PR", userSetWorkspaceName: true }), "my thing");
});

test("the PR title wins over the branch", () => {
  assert.equal(workspaceLabel({ name: "quito", branch: "ada/settings-search", prTitle: "Add search to settings" }), "Add search to settings");
});

test("the branch is shown, prettified, unless it is the target branch", () => {
  assert.equal(workspaceLabel({ name: "osaka", branch: "ada/dark-mode-tokens", targetBranch: "main" }), "Ada/dark mode tokens");
  assert.equal(workspaceLabel({ name: "osaka", branch: "main", targetBranch: "main" }), "Osaka");
});

test("a stored workspace_name comes before the PR title even when not user-set ($V: if(e)return e)", () => {
  assert.equal(workspaceLabel({ name: "Login fix", workspaceName: "Login fix", branch: "ada/x", prTitle: "PR" }), "Login fix");
  assert.equal(workspaceLabel({ name: "quito", workspaceName: null, branch: "ada/x", prTitle: "PR" }), "PR");
});

test("the configured branch prefix is stripped before prettifying (pGe / zcs)", () => {
  assert.equal(workspaceLabel({ name: "osaka", branch: "sven/dark-mode", branchPrefix: "sven/", targetBranch: "main" }), "Dark mode");
  assert.equal(workspaceLabel({ name: "osaka", branch: "other/dark-mode", branchPrefix: "sven/", targetBranch: "main" }), "Other/dark mode");
  assert.equal(workspaceLabel({ name: "sven/osaka", branch: "main", branchPrefix: "sven/", targetBranch: "main" }), "Osaka");
});

test("the target is the workspace's intended_target_branch, main when unset", () => {
  assert.equal(labelTargetBranch(null), "main");
  assert.equal(labelTargetBranch("develop"), "develop");
  assert.equal(workspaceLabel({ name: "osaka", branch: "develop", targetBranch: labelTargetBranch("develop") }), "Osaka");
  assert.equal(workspaceLabel({ name: "osaka", branch: "master", targetBranch: labelTargetBranch(undefined) }), "Master");
});

test("rows are listed newest first, falling back to creation time", () => {
  const rows = [
    { id: "a", createdAt: 1, updatedAt: 10 },
    { id: "b", createdAt: 5 },
    { id: "c", createdAt: 2, updatedAt: 30 },
  ];
  assert.deepEqual(byRecentActivity(rows).map((r) => r.id), ["c", "a", "b"]);
});
