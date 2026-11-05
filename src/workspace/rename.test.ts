// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repo, Workspace } from "../state/types.ts";
import { branchNameFromMessage, planWorkspaceRename, prefixOf } from "./rename.ts";

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    id: "w1",
    name: "petra",
    branch: "petra",
    status: "idle",
    diff: { added: 0, removed: 0 },
    createdAt: 0,
    placeholderBranchName: "petra",
    ...over,
  };
}

function repo(...workspaces: Workspace[]): Repo {
  return { id: "r1", name: "app", path: "/src/app", defaultBranch: "main", workspaces };
}

test("branchNameFromMessage keeps the first content words and drops filler", () => {
  assert.equal(branchNameFromMessage("Can you fix the login redirect bug when the session expires?"), "fix-login-redirect-bug");
  assert.equal(branchNameFromMessage("Please add dark mode"), "add-dark-mode");
  assert.equal(branchNameFromMessage("hey, could you  Rename the Settings → Git tab"), "rename-settings-git-tab");
});

test("branchNameFromMessage skips code, URLs, headings and empty lines", () => {
  assert.equal(branchNameFromMessage("\n\n## Upgrade `vite` to v6\nmore detail"), "upgrade-v6");
  assert.equal(branchNameFromMessage("```ts\nconst x = 1\n```\nmigrate the store"), "migrate-store");
  assert.equal(branchNameFromMessage("see https://example.com/issue/12 crash on launch"), "see-crash-launch");
  assert.equal(branchNameFromMessage("Café menu für Zürich"), "cafe-menu-fur-zurich");
});

test("branchNameFromMessage is empty when nothing usable is left", () => {
  assert.equal(branchNameFromMessage(""), "");
  assert.equal(branchNameFromMessage("please"), "");
  assert.equal(branchNameFromMessage("```\nonly code\n```"), "");
  assert.equal(branchNameFromMessage("the a an"), "");
});

test("prefixOf keeps the branch prefix of the placeholder", () => {
  assert.equal(prefixOf("sven/petra"), "sven/");
  assert.equal(prefixOf("petra"), "");
});

test("planWorkspaceRename renames a placeholder city to the generated name", () => {
  const w = ws();
  assert.deepEqual(planWorkspaceRename(repo(w), w, "Fix the login redirect"), {
    placeholder_branch_name: null,
    branch: "fix-login-redirect",
    workspace_name: "fix-login-redirect",
  });
});

test("planWorkspaceRename keeps the branch prefix and stays unique among other workspaces", () => {
  const w = ws({ name: "petra", branch: "sven/petra", placeholderBranchName: "sven/petra" });
  const other = ws({ id: "w2", name: "fix-login", branch: "sven/fix-login", placeholderBranchName: null });
  assert.deepEqual(planWorkspaceRename(repo(w, other), w, "fix login"), {
    placeholder_branch_name: null,
    branch: "sven/fix-login-v1",
    workspace_name: "fix-login-v1",
  });
});

test("planWorkspaceRename leaves user-set names, resolved placeholders and empty messages alone", () => {
  const typed = ws({ name: "my-name", userSetWorkspaceName: true });
  assert.deepEqual(planWorkspaceRename(repo(typed), typed, "add dark mode"), { placeholder_branch_name: null, branch: "add-dark-mode" });
  const resolved = ws({ placeholderBranchName: null });
  assert.deepEqual(planWorkspaceRename(repo(resolved), resolved, "add dark mode"), {});
  const legacy = ws({ placeholderBranchName: undefined });
  assert.deepEqual(planWorkspaceRename(repo(legacy), legacy, "add dark mode"), {});
  const w = ws();
  assert.deepEqual(planWorkspaceRename(repo(w), w, "please"), {});
});

test("planWorkspaceRename renames only the branch when auto-rename is off", () => {
  const w = ws();
  assert.deepEqual(planWorkspaceRename(repo(w), w, "add dark mode", false), { placeholder_branch_name: null, branch: "add-dark-mode" });
});
