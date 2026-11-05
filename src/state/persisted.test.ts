import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrefs, prefsOf, reposFromDb, validSelection, type DbRepoRow, type DbWorkspaceRow } from "./persisted.ts";

const repo = (id: string, extra: Partial<DbRepoRow> = {}): DbRepoRow => ({
  id, name: id, rootPath: `/src/${id}`, remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null,
  createdAt: "2026-11-05 12:00:00", ...extra,
});
const ws = (repositoryId: string, dir: string, state = "ready", extra: Partial<DbWorkspaceRow> = {}): DbWorkspaceRow => ({
  id: `${repositoryId}/${dir}`, repositoryId, directoryName: dir, workspaceName: null, branch: dir, placeholderBranchName: null,
  state, derivedStatus: null, manualStatus: null, workspacePath: `/data/${dir}`, pinnedAt: null, unread: false,
  createdAt: "2026-11-05 12:00:00", ...extra,
});

test("maps rows in database order, marks hidden repos and drops archived workspaces", () => {
  const repos = reposFromDb(
    [repo("b"), repo("a"), repo("gone", { hidden: true })],
    [ws("a", "oslo"), ws("a", "lima", "archived"), ws("b", "rome", "initializing"), ws("gone", "x")],
    ["a"],
  );
  assert.deepEqual(repos.map((r) => r.id), ["b", "a", "gone"]);
  assert.deepEqual(repos.map((r) => r.hidden), [undefined, undefined, true]);
  assert.deepEqual(repos.map((r) => r.workspaces.map((w) => w.id)), [["b/rome"], ["a/oslo"], ["gone/x"]]);
  assert.equal(repos[1].collapsed, true);
  assert.equal(repos[0].collapsed, undefined);
  const w = repos[1].workspaces[0];
  assert.deepEqual([w.name, w.branch, w.path, w.status], ["oslo", "oslo", "/data/oslo", "idle"]);
  assert.equal(w.createdAt, Date.UTC(2026, 10, 5, 12, 0, 0));
  assert.equal(repos[1].path, "/src/a");
});

test("selection falls back to home when its workspace is gone", () => {
  const repos = reposFromDb([repo("a")], [ws("a", "oslo")], []);
  const keep = { kind: "workspace" as const, repoId: "a", workspaceId: "a/oslo" };
  assert.deepEqual(validSelection(keep, repos), keep);
  assert.deepEqual(validSelection({ ...keep, workspaceId: "a/lima" }, repos), { kind: "home" });
});

test("prefs round-trip and survive garbage", () => {
  const repos = reposFromDb([repo("a"), repo("b")], [], ["b"]);
  const prefs = prefsOf({ repos, selection: { kind: "home" }, sidebarVisible: false });
  assert.deepEqual(parsePrefs(JSON.stringify(prefs)), { selection: { kind: "home" }, sidebarVisible: false, collapsed: ["b"] });
  assert.deepEqual(parsePrefs("{nope"), { selection: { kind: "home" }, collapsed: [] });
  assert.deepEqual(parsePrefs(null), { selection: { kind: "home" }, collapsed: [] });
});
