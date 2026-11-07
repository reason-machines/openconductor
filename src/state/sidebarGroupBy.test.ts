import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseSidebarGroups, isStatusGroupCollapsed, setStatusGroupCollapsed, sidebarEntries, statusGroupEntries } from "./sidebarOrder.ts";
import { parseSidebarGroupBy, parseStatusCollapsed, SIDEBAR_STATUS_ORDER } from "../home/sidebarGroupBy.ts";
import { applyUpdate, DEFAULT_APP_PREFS } from "../settings/appPrefs.ts";
import { parsePrefs, prefsOf } from "./persisted.ts";
import type { AppState, Workspace } from "./types.ts";

const workspace = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt, ...extra,
});

const grouped = {
  sidebarGroupBy: "status" as const,
  selection: { kind: "root" as const },
  repos: [
    { id: "a", name: "A", path: "/a", defaultBranch: "main", collapsed: false, workspaces: [
      workspace("progress-a", 30),
      workspace("review", 20, { derivedStatus: "in-review" }),
      workspace("override-done", 10, { derivedStatus: "in-progress", manualStatus: "done" }),
    ] },
    { id: "b", name: "B", path: "/b", defaultBranch: "main", collapsed: false, workspaces: [
      workspace("progress-b", 40),
      workspace("canceled", 50, { manualStatus: "canceled" }),
      workspace("backlog", 60, { derivedStatus: "backlog" }),
    ] },
  ],
} satisfies AppState & { sidebarGroupBy: "status" };

const ids = (s: AppState) => sidebarEntries(s).map((entry) => entry.workspace.id);

test("Status grouping shares the reference's five-group order with keyboard navigation", () => {
  assert.deepEqual(ids(grouped), ["override-done", "review", "progress-b", "progress-a", "backlog", "canceled"]);
});

test("Status groups exclude pinned, sectioned and archived rows without duplicating them", () => {
  const state = {
    ...grouped,
    repos: grouped.repos.map((repo) => ({ ...repo, workspaces: repo.workspaces.map((w) =>
      w.id === "progress-b" ? { ...w, pinnedAt: 1 } : w.id === "canceled" ? { ...w, status: "archived" as const } : w),
    })),
    sections: [{ id: "focus", name: "Focus", workspaceIds: ["review"] }],
  };
  assert.deepEqual(ids(state), ["progress-b", "review", "override-done", "progress-a", "backlog"]);
});

test("Status grouping applies the selected timestamp within groups, across repositories", () => {
  const state = { ...grouped, repos: grouped.repos.map((repo) => ({ ...repo, workspaces: repo.workspaces.map((w) => ({ ...w, updatedAt: w.id === "progress-a" ? 100 : w.createdAt })) })) };
  assert.deepEqual(ids(state).filter((id) => id.startsWith("progress")), ["progress-a", "progress-b"]);
  assert.deepEqual(ids({ ...state, sidebarSort: "created" }).filter((id) => id.startsWith("progress")), ["progress-b", "progress-a"]);
});

test("Status grouping's project filter does not move Pinned or sections", () => {
  const state = {
    ...grouped, sidebarRepoFilter: "a",
    sections: [{ id: "focus", name: "Focus", workspaceIds: ["backlog"] }],
    repos: grouped.repos.map((repo) => ({ ...repo, workspaces: repo.workspaces.map((w) => w.id === "progress-b" ? { ...w, pinnedAt: 1 } : w) })),
  };
  assert.deepEqual(ids(state), ["progress-b", "backlog", "override-done", "review", "progress-a"]);
});

test("all five status headers exist even when empty; default collapse follows the selected row", () => {
  const state: AppState = { ...grouped, selection: { kind: "workspace", repoId: "a", workspaceId: "review" } };
  const groups = statusGroupEntries(state);
  assert.deepEqual(groups.map((g) => g.status), SIDEBAR_STATUS_ORDER);
  assert.deepEqual(statusGroupEntries({ ...state, repos: [] }).map((g) => g.entries), [[], [], [], [], []]);
  assert.deepEqual(groups.map((g) => isStatusGroupCollapsed(state, g)), [true, false, true, true, true]);
  assert.deepEqual(sidebarEntries(state, { visibleOnly: true }).map((entry) => entry.workspace.id), ["review"]);
});

test("an explicit collapse wins over selection, and Project/Status each reset their destination groups", () => {
  const selected: AppState = { ...grouped, selection: { kind: "workspace", repoId: "a", workspaceId: "review" } };
  const closed = collapseSidebarGroups(selected, "status");
  assert.deepEqual(sidebarEntries(closed, { visibleOnly: true }), []);
  const opened = setStatusGroupCollapsed(closed, "in-progress", false);
  assert.deepEqual(sidebarEntries(opened, { visibleOnly: true }).map((entry) => entry.workspace.id), ["progress-b", "progress-a"]);
  const project = { ...collapseSidebarGroups(opened, "repo"), sidebarGroupBy: "repo" as const };
  assert.deepEqual(project.repos.map((repo) => repo.collapsed), [true, true]);
  assert.deepEqual(sidebarEntries(project, { visibleOnly: true }), []);
  assert.deepEqual(ids({ ...project, sidebarGroupBy: "status" }), ids(grouped));
});

test("a filtered-out selection cannot open a status group or consume a shortcut number", () => {
  const state: AppState = { ...grouped, sidebarRepoFilter: "a", selection: { kind: "workspace", repoId: "b", workspaceId: "progress-b" } };
  assert.deepEqual(sidebarEntries(state, { visibleOnly: true }), []);
  assert.deepEqual(sidebarEntries(setStatusGroupCollapsed(state, "in-progress", false), { visibleOnly: true }).map((entry) => entry.workspace.id), ["progress-a"]);
});

test("grouping parses legacy and corrupt values as Project, and typed writes preserve other prefs", () => {
  for (const value of [undefined, null, "section", "repo", "other", 1]) assert.equal(parseSidebarGroupBy(value), "repo");
  assert.equal(parseSidebarGroupBy("status"), "status");
  assert.equal(DEFAULT_APP_PREFS.sidebar_group_by, "repo");
  assert.deepEqual(applyUpdate(DEFAULT_APP_PREFS, { key: "sidebar_group_by", value: "status" }), { ...DEFAULT_APP_PREFS, sidebar_group_by: "status" });
});

test("manual status collapse persists in desktop UI prefs, accepting only boolean known status keys", () => {
  const state = setStatusGroupCollapsed(grouped, "in-review", false);
  const prefs = parsePrefs(JSON.stringify(prefsOf(state)));
  assert.deepEqual(prefs.sidebarStatusCollapsed, { "in-review": false });
  assert.deepEqual(parseStatusCollapsed({ done: true, backlog: "false", unknown: false }), { done: true });
  assert.equal(parseStatusCollapsed(null), undefined);
  assert.equal(parseStatusCollapsed({ unknown: false }), undefined);
});
