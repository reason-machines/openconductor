import { test } from "node:test";
import assert from "node:assert/strict";
import { keepLive, parsePrefs, prefsOf, reposFromDb, validSelection, withSessionStatus, withoutLiveSessions, type DbRepoRow, type DbWorkspaceRow } from "./persisted.ts";
import type { Workspace } from "./types";

const repo = (id: string, extra: Partial<DbRepoRow> = {}): DbRepoRow => ({
  id, name: id, rootPath: `/src/${id}`, remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null,
  createdAt: "2026-11-05 12:00:00", ...extra,
});
const ws = (repositoryId: string, dir: string, state = "ready", extra: Partial<DbWorkspaceRow> = {}): DbWorkspaceRow => ({
  id: `${repositoryId}/${dir}`, repositoryId, directoryName: dir, workspaceName: null, branch: dir, placeholderBranchName: null,
  state, derivedStatus: null, manualStatus: null, workspacePath: `/data/${dir}`, pinnedAt: null, unread: false, prTitle: null, prDescription: null, number: null,
  intendedTargetBranch: null, createdAt: "2026-11-05 12:00:00", ...extra,
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

test("carries the workspace's target branch from conductor.db", () => {
  const [r] = reposFromDb([repo("a")], [ws("a", "oslo", "ready", { intendedTargetBranch: "develop" }), ws("a", "lima")], []);
  assert.deepEqual(r.workspaces.map((w) => w.targetBranch), ["develop", null]);
});

test("carries the workspace number from conductor.db", () => {
  const [r] = reposFromDb([repo("a")], [ws("a", "oslo", "ready", { number: 7 }), ws("a", "lima")], []);
  assert.deepEqual(r.workspaces.map((w) => w.number), [7, null]);
});

test("carries the workspace's intended target branch for the diff", () => {
  const [r] = reposFromDb([repo("a")], [ws("a", "oslo", "ready", { intendedTargetBranch: "develop" }), ws("a", "lima")], []);
  assert.deepEqual(r.workspaces.map((w) => w.targetBranch), ["develop", null]);
});

test("selection falls back to home when its workspace is gone", () => {
  const repos = reposFromDb([repo("a")], [ws("a", "oslo")], []);
  const keep = { kind: "workspace" as const, repoId: "a", workspaceId: "a/oslo" };
  assert.deepEqual(validSelection(keep, repos), keep);
  assert.deepEqual(validSelection({ ...keep, workspaceId: "a/lima" }, repos), { kind: "root" });
});

test("prefs round-trip and survive garbage", () => {
  const repos = reposFromDb([repo("a"), repo("b")], [], ["b"]);
  const prefs = prefsOf({ repos, selection: { kind: "home" }, sidebarVisible: false });
  assert.deepEqual(parsePrefs(JSON.stringify(prefs)), { selection: { kind: "home" }, sidebarVisible: false, collapsed: ["b"] });
  assert.deepEqual(parsePrefs("{nope"), { selection: { kind: "root" }, collapsed: [] });
  assert.deepEqual(parsePrefs(null), { selection: { kind: "root" }, collapsed: [] });
});

test("sidebar: pin, unread and status columns reach the workspace", () => {
  const [r] = reposFromDb(
    [repo("a")],
    [ws("a", "oslo", "ready", { pinnedAt: "2026-11-05 12:00:00", unread: true, manualStatus: "done", derivedStatus: "in-review" }), ws("a", "lima", "ready", { manualStatus: "bogus" })],
    [],
  );
  const [oslo, lima] = r.workspaces;
  assert.equal(oslo.pinnedAt, Date.UTC(2026, 10, 5, 12, 0, 0));
  assert.deepEqual([oslo.unread, oslo.manualStatus, oslo.derivedStatus], [true, "done", "in-review"]);
  assert.deepEqual([lima.pinnedAt, lima.unread, lima.manualStatus, lima.derivedStatus], [undefined, undefined, undefined, undefined]);
});

test("sidebar: a user-set workspace name is shown as is", async () => {
  const { workspaceLabel } = await import("../components/sidebarLabel.ts");
  const [r] = reposFromDb(
    [repo("a")],
    [ws("a", "oslo", "ready", { workspaceName: "Fix login", userSetWorkspaceName: true, branch: "sven/oslo" }), ws("a", "lima", "ready", { workspaceName: "lima", branch: "sven/fix-the-thing" })],
    [],
  );
  const [oslo, lima] = r.workspaces;
  assert.equal(oslo.userSetWorkspaceName, true);
  assert.equal(lima.userSetWorkspaceName, undefined);
  const label = (w: typeof oslo) => workspaceLabel({ name: w.name, branch: w.branch, prTitle: w.prTitle, userSetWorkspaceName: w.userSetWorkspaceName, targetBranch: "main" });
  assert.equal(label(oslo), "Fix login");
  assert.notEqual(label(lima), "lima");
});


const live = (extra: Partial<Workspace> = {}): Workspace => ({ id: "w", name: "w", branch: "w", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, ...extra });

test("a session status is stored on the workspace; idle clears it", () => {
  assert.equal(withSessionStatus(live(), "needs_user_permission").sessionStatus, "needs_user_permission");
  assert.equal(withSessionStatus(live({ sessionStatus: "working" }), "cancelling").sessionStatus, "cancelling");
  const idle = withSessionStatus(live({ sessionStatus: "waiting" }), "idle");
  assert.ok(!("sessionStatus" in idle));
  assert.equal(idle.status, "idle");
});

test("re-reading conductor.db keeps the live session status and PR", () => {
  const fresh = live({ name: "renamed" });
  assert.deepEqual(keepLive(fresh, undefined), fresh);
  const kept = keepLive(fresh, live({ sessionStatus: "needs_user_input", pr: null }));
  assert.equal(kept.sessionStatus, "needs_user_input");
  assert.equal(kept.pr, null);
  assert.equal(kept.name, "renamed");
  assert.ok(!("sessionStatus" in keepLive(fresh, live())));
});

test("saved browser state drops live session statuses, including the old status: working", () => {
  const saved = {
    repos: [{ id: "r", name: "r", path: "/r", defaultBranch: "main", workspaces: [live({ id: "a", sessionStatus: "working" }), { ...live({ id: "b" }), status: "working" } as unknown as Workspace, live({ id: "c", status: "archived" })] }],
    selection: { kind: "home" as const },
  };
  const ws = withoutLiveSessions(saved).repos[0].workspaces;
  assert.deepEqual(ws.map((w) => [w.id, w.status, w.sessionStatus]), [["a", "idle", undefined], ["b", "idle", undefined], ["c", "archived", undefined]]);
});
