import { test } from "node:test";
import assert from "node:assert/strict";
import { isRepoCollapsed, pinnedEntries, repoGroupWorkspaces, sidebarEntries, toggleRepoCollapsed } from "./sidebarOrder.ts";
import { effectiveStatus, isWorkspaceStatus, statusLabel, WORKSPACE_STATUSES } from "./workspaceStatus.ts";
import type { AppState, Workspace } from "./types.ts";

const ws = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt, ...extra,
});

const state: AppState = {
  selection: { kind: "home" },
  repos: [
    { id: "a", name: "a", path: "/a", defaultBranch: "main", collapsed: false, workspaces: [ws("a1", 1), ws("a2", 2, { pinnedAt: 20 }), ws("a3", 3)] },
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

test("Created sort controls repository and shortcut order without moving pinned or section rows", () => {
  const sorted: AppState = {
    selection: { kind: "home" },
    repos: [{ id: "a", name: "a", path: "/a", defaultBranch: "main", collapsed: false, workspaces: [
      ws("new", 30, { updatedAt: 40 }), ws("old", 10, { updatedAt: 90 }),
      ws("section-new", 25, { updatedAt: 35 }), ws("section-old", 5, { updatedAt: 80 }),
      ws("pinned", 1, { updatedAt: 1, pinnedAt: 3 }),
    ] }],
    sections: [{ id: "s", name: "Focus", workspaceIds: ["section-old", "section-new"] }],
  };
  assert.deepEqual(sidebarEntries(sorted).map((e) => e.workspace.id), ["pinned", "section-old", "section-new", "old", "new"]);
  const created: AppState = { ...sorted, sidebarSort: "created" };
  assert.deepEqual(sidebarEntries(created).map((e) => e.workspace.id), ["pinned", "section-old", "section-new", "new", "old"]);
  assert.deepEqual(sidebarEntries(created, { visibleOnly: true }).map((e) => e.workspace.id), ["pinned", "section-old", "section-new", "new", "old"]);
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

test("an untoggled repo group is folded unless the open workspace is one of its rows (Conductor's Dra)", () => {
  const [a, untoggled] = state.repos.map((r) => ({ ...r, collapsed: undefined }));
  // Home: every untoggled group is folded.
  assert.equal(isRepoCollapsed(a, { kind: "home" }), true);
  assert.equal(isRepoCollapsed(a, { kind: "root" }), true);
  // A workspace in the group is open: it unfolds; another repo's stays folded.
  assert.equal(isRepoCollapsed(a, { kind: "workspace", repoId: "a", workspaceId: "a1" }), false);
  assert.equal(isRepoCollapsed(untoggled, { kind: "workspace", repoId: "a", workspaceId: "a1" }), true);
  // The open workspace is pinned or in a section, so not a row of the group: the group stays folded.
  assert.equal(isRepoCollapsed(a, { kind: "workspace", repoId: "a", workspaceId: "a2" }), true);
  assert.equal(isRepoCollapsed(a, { kind: "workspace", repoId: "a", workspaceId: "a1" }, new Set(["a1"])), true);
  // A stored flag wins either way.
  assert.equal(isRepoCollapsed({ ...a, collapsed: true }, { kind: "workspace", repoId: "a", workspaceId: "a1" }), true);
  assert.equal(isRepoCollapsed({ ...a, collapsed: false }, { kind: "home" }), false);
});

test("toggling stores the opposite of what the group shows", () => {
  const s: AppState = { ...state, repos: state.repos.map((r) => ({ ...r, collapsed: undefined })) };
  // Home: a shows folded, so a click unfolds it and stores false.
  assert.deepEqual(toggleRepoCollapsed(s, "a").map((r) => r.collapsed), [false, undefined]);
  // a's workspace is open: it shows unfolded, so a click folds it and stores true.
  const open: AppState = { ...s, selection: { kind: "workspace", repoId: "a", workspaceId: "a1" } };
  assert.deepEqual(toggleRepoCollapsed(open, "a").map((r) => r.collapsed), [true, undefined]);
  assert.deepEqual(toggleRepoCollapsed({ ...open, repos: toggleRepoCollapsed(open, "a") }, "a").map((r) => r.collapsed), [false, undefined]);
});

test("visibleOnly numbers only rows of unfolded groups: Home folds untoggled groups", () => {
  const s: AppState = { ...state, repos: state.repos.map((r) => ({ ...r, collapsed: undefined })) };
  assert.deepEqual(sidebarEntries(s, { visibleOnly: true }).map((e) => e.workspace.id), ["b1", "a2"]);
  const open: AppState = { ...s, selection: { kind: "workspace", repoId: "a", workspaceId: "a3" } };
  assert.deepEqual(sidebarEntries(open, { visibleOnly: true }).map((e) => e.workspace.id), ["b1", "a2", "a3", "a1"]);
});
