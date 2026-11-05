import { test } from "node:test";
import assert from "node:assert/strict";
import { activeWorkspaceCount, isSidebarVisible, removedWorkspaceIds } from "./selectors.ts";
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

test("removedWorkspaceIds lists workspaces archived or gone with their repository", () => {
  const w = (id: string): Workspace => ({ ...ws("idle"), id });
  const r = (id: string, workspaces: Workspace[]): Repo => ({ ...repo(workspaces), id });
  const prev = { repos: [r("r1", [w("a"), w("b")]), r("r2", [w("c")])], selection: { kind: "home" as const } };
  assert.deepEqual(removedWorkspaceIds(prev, prev), []);
  assert.deepEqual(removedWorkspaceIds(prev, { ...prev, repos: [r("r1", [w("a")]), r("r2", [w("c")])] }), ["b"]);
  assert.deepEqual(removedWorkspaceIds(prev, { ...prev, repos: [r("r1", [w("a"), w("b"), w("d")])] }), ["c"]);
});
