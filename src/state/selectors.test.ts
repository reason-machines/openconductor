import { test } from "node:test";
import assert from "node:assert/strict";
import { activeWorkspaceCount, isSidebarVisible } from "./selectors.ts";
import type { Repo, Workspace } from "./types";

const ws = (status: Workspace["status"]): Workspace => ({ id: status, name: status, branch: status, status, diff: { added: 0, removed: 0 }, createdAt: 0 });
const repo = (workspaces: Workspace[]): Repo => ({ id: "r", name: "r", path: "/r", defaultBranch: "main", workspaces });

test("sidebar is visible unless explicitly hidden", () => {
  assert.equal(isSidebarVisible({ repos: [], selection: { kind: "home" } }), true);
  assert.equal(isSidebarVisible({ repos: [], selection: { kind: "home" }, sidebarVisible: true }), true);
  assert.equal(isSidebarVisible({ repos: [], selection: { kind: "home" }, sidebarVisible: false }), false);
});

test("active workspace count ignores archived workspaces", () => {
  assert.equal(activeWorkspaceCount([]), 0);
  assert.equal(activeWorkspaceCount([repo([])]), 0);
  assert.equal(activeWorkspaceCount([repo([ws("archived")])]), 0);
  assert.equal(activeWorkspaceCount([repo([ws("idle"), ws("archived")]), repo([ws("working"), ws("needs-review")])]), 3);
});
