import { test } from "node:test";
import assert from "node:assert/strict";
import { pinnedEntries, repoGroupWorkspaces, sidebarEntries } from "./sidebarOrder.ts";
import { effectiveStatus, isWorkspaceStatus, statusLabel, WORKSPACE_STATUSES } from "./workspaceStatus.ts";
import type { AppState, Workspace } from "./types.ts";

const ws = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt, ...extra,
});

const state: AppState = {
  selection: { kind: "home" },
  repos: [
    { id: "a", name: "a", path: "/a", defaultBranch: "main", workspaces: [ws("a1", 1), ws("a2", 2, { pinnedAt: 20 }), ws("a3", 3)] },
    { id: "b", name: "b", path: "/b", defaultBranch: "main", collapsed: true, workspaces: [ws("b1", 4, { pinnedAt: 10 }), ws("b2", 5)] },
  ],
};

test("pinned workspaces leave their repo group and sort by pin time", () => {
  assert.deepEqual(pinnedEntries(state).map((e) => e.workspace.id), ["b1", "a2"]);
  assert.deepEqual(repoGroupWorkspaces(state.repos[0].workspaces).map((w) => w.id), ["a3", "a1"]);
});

test("sidebar order is pinned, then each repo newest first; visibleOnly skips collapsed repos", () => {
  assert.deepEqual(sidebarEntries(state).map((e) => e.workspace.id), ["b1", "a2", "a3", "a1", "b2"]);
  assert.deepEqual(sidebarEntries(state, { visibleOnly: true }).map((e) => e.workspace.id), ["b1", "a2", "a3", "a1"]);
  assert.deepEqual(sidebarEntries(state, { visibleOnly: true, pinnedCollapsed: true }).map((e) => e.workspace.id), ["a3", "a1"]);
});

test("effective status is manual, then derived, then in-progress", () => {
  assert.equal(effectiveStatus({}), "in-progress");
  assert.equal(effectiveStatus({ derivedStatus: "in-review" }), "in-review");
  assert.equal(effectiveStatus({ derivedStatus: "in-review", manualStatus: "done" }), "done");
  assert.deepEqual(WORKSPACE_STATUSES.map(statusLabel), ["Backlog", "In progress", "In review", "Done", "Canceled"]);
  assert.ok(isWorkspaceStatus("canceled"));
  assert.ok(!isWorkspaceStatus("archived"));
});

test("sectioned workspaces sit between Pinned and the repo groups and leave both", () => {
  const withSections: AppState = {
    ...state,
    sections: [{ id: "s", name: "Focus", workspaceIds: ["a1", "a2", "b2"] }],
  };
  // a2 is pinned and sectioned: the section wins, as in Conductor (Pinned filters out sectioned ids).
  assert.deepEqual(pinnedEntries(withSections).map((e) => e.workspace.id), ["b1"]);
  assert.deepEqual(sidebarEntries(withSections).map((e) => e.workspace.id), ["b1", "b2", "a2", "a1", "a3"]);
  // A collapsed section's rows are not numbered.
  assert.deepEqual(sidebarEntries(withSections, { visibleOnly: true, collapsedSections: new Set(["s"]) }).map((e) => e.workspace.id), ["b1", "a3"]);
});
