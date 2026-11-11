import { test } from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "../state/types.ts";
import { preferredProjectWorkspace } from "./projectWorkspace.ts";

const workspace = (id: string, updatedAt: number): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, updatedAt,
});
const old = workspace("old", 10);
const newest = workspace("newest", 30);
const middle = workspace("middle", 20);
const repo = { workspaces: [old, newest, middle] };

test("Projects returns the last-viewed workspace in that project, not its first or newest row", () => {
  assert.equal(preferredProjectWorkspace(repo, ["another-project", "missing", "middle", "old"]), middle);
});

test("Projects without a surviving recent visit opens the most recently updated workspace", () => {
  assert.equal(preferredProjectWorkspace(repo, ["removed", "another-project"]), newest);
  assert.equal(preferredProjectWorkspace(repo, []), newest);
  assert.deepEqual(repo.workspaces, [old, newest, middle]);
});

test("Projects preserves source order on a recency tie and has no target for an empty project", () => {
  const tied = workspace("tied", 30);
  assert.equal(preferredProjectWorkspace({ workspaces: [newest, tied] }, []), newest);
  assert.equal(preferredProjectWorkspace({ workspaces: [] }, ["old"]), undefined);
});
