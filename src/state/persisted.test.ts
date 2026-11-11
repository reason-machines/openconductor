import { test } from "node:test";
import assert from "node:assert/strict";
import { nextUnreadChat } from "./nextUnread.ts";
import { workspaceFromRow, keepPr, parsePrefs, prefsOf, reposFromDb, restoreChatTabsOf, validSelection, withoutLiveSessions, type DbRepoRow, type DbWorkspaceRow } from "./persisted.ts";
import { chatOpenable, restoredChatTabs } from "./openChat.ts";
import { isWorkspaceUnread } from "./chatUnread.ts";
import type { AppState, Workspace } from "./types";

const repo = (id: string, extra: Partial<DbRepoRow> = {}): DbRepoRow => ({
  id, name: id, rootPath: `/src/${id}`, remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null,
  createdAt: "2026-11-05 12:00:00", ...extra,
});
test("persisted workspace links hydrate separately from prompt attachments", () => {
  const restored = workspaceFromRow(ws("r", "source", "ready", { linkedWorkspaceIds: ["target"], linkedDirectoryPaths: ["/extra"] }));
  assert.deepEqual(restored.linkedWorkspaceIds, ["target"]);
  assert.deepEqual(restored.linkedDirectoryPaths, ["/extra"]);
  const older = workspaceFromRow(ws("r", "older"));
  assert.deepEqual(older.linkedWorkspaceIds, []);
  assert.deepEqual(older.linkedDirectoryPaths, []);
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
  const repos = reposFromDb([repo("a"), repo("b"), repo("c")], [], ["b"]);
  // c was unfolded by hand; a was never toggled and follows the open workspace.
  repos[2].collapsed = false;
  const prefs = prefsOf({ repos, selection: { kind: "home" }, sidebarVisible: false });
  assert.deepEqual(parsePrefs(JSON.stringify(prefs)), { selection: { kind: "home" }, sidebarVisible: false, collapsed: ["b"], expanded: ["c"] });
  // Prefs saved before `expanded` existed.
  assert.deepEqual(parsePrefs(JSON.stringify({ selection: { kind: "root" }, collapsed: ["b"] })), { selection: { kind: "root" }, sidebarVisible: undefined, collapsed: ["b"], expanded: [] });
  assert.deepEqual(parsePrefs("{nope"), { selection: { kind: "root" }, collapsed: [], expanded: [] });
  assert.deepEqual(parsePrefs(null), { selection: { kind: "root" }, collapsed: [], expanded: [] });
});

test("sidebar: pin, unread and status columns reach the workspace", () => {
  const [r] = reposFromDb(
    [repo("a")],
    [ws("a", "oslo", "ready", { pinnedAt: "2026-11-05 12:00:00", unread: true, manualStatus: "done", derivedStatus: "in-review" }), ws("a", "lima", "ready", { manualStatus: "bogus" })],
    [],
  );
  const [oslo, lima] = r.workspaces;
  assert.equal(oslo.pinnedAt, Date.UTC(2026, 10, 5, 12, 0, 0));
  assert.deepEqual([oslo.unreadChats?.map((c) => c.id), oslo.manualStatus, oslo.derivedStatus], [["a/oslo"], "done", "in-review"]);
  assert.deepEqual([lima.pinnedAt, lima.unreadChats, lima.manualStatus, lima.derivedStatus], [undefined, undefined, undefined, undefined]);
});

test("sidebar: unread chats come from sessions; a legacy workspaces.unread marks the main chat; closed reviews count as hidden", () => {
  const [r] = reposFromDb(
    [repo("a")],
    [
      ws("a", "oslo", "ready", { unreadChats: [{ id: "a/oslo", updatedAt: "2026-11-05 13:00:00" }] }),
      ws("a", "lima", "ready", { unread: true, unreadChats: [{ id: "a/lima", updatedAt: "2026-11-05T14:00:00.000Z" }] }),
      ws("a", "rome", "ready", { unread: true, updatedAt: "2026-11-05 15:00:00" }),
      ws("a", "kyiv", "ready", { unreadChats: [{ id: "a/kyiv:review:1", updatedAt: "2026-11-05 16:00:00" }] }),
    ],
    [],
  );
  const [oslo, lima, rome, kyiv] = r.workspaces;
  assert.deepEqual(oslo.unreadChats, [{ id: "a/oslo", at: Date.UTC(2026, 10, 5, 13) }]);
  assert.deepEqual(lima.unreadChats, [{ id: "a/lima", at: Date.UTC(2026, 10, 5, 14) }], "the legacy flag does not add a second entry");
  assert.deepEqual(rome.unreadChats, [{ id: "a/rome", at: Date.UTC(2026, 10, 5, 15) }], "a legacy flag alone marks the main chat");
  assert.equal(kyiv.unreadChats, undefined, "a review whose tab was closed counts as hidden");
});

test("sidebar: a review tab open at quit comes back after a restart, still unread", () => {
  const rows = [
    ws("a", "kyiv", "ready", {
      chatTabs: [{ id: "a/kyiv:review:1", title: "Review" }],
      unreadChats: [{ id: "a/kyiv:review:1", updatedAt: "2026-11-05 16:00:00" }],
    }),
  ];
  restoreChatTabsOf(rows);
  const [r] = reposFromDb([repo("a")], rows, []);
  const [kyiv] = r.workspaces;
  assert.deepEqual(kyiv.unreadChats, [{ id: "a/kyiv:review:1", at: Date.UTC(2026, 10, 5, 16) }]);
  assert.equal(isWorkspaceUnread(kyiv), true, "the row is unread");
  assert.equal(chatOpenable("a/kyiv:review:1"), true, "it has a tab again");
  assert.deepEqual(restoredChatTabs("a/kyiv"), [{ id: "a/kyiv:review:1", title: "Review" }]);
  assert.deepEqual(
    nextUnreadChat({ repos: [r], selection: { kind: "workspace", repoId: "a", workspaceId: "a/lima" } } as AppState, { skipSelected: true })?.chatId,
    "a/kyiv:review:1",
    "Go to next unread reaches it",
  );
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

test("re-reading conductor.db keeps the PR the app last read", () => {
  const fresh = live({ name: "renamed" });
  assert.deepEqual(keepPr(fresh, undefined), fresh);
  assert.deepEqual(keepPr(fresh, live()), fresh);
  const kept = keepPr(fresh, live({ pr: null, sessionStatus: "working" }));
  assert.equal(kept.pr, null);
  assert.equal(kept.name, "renamed");
  assert.ok(!("sessionStatus" in kept));
});

test("saved browser state drops live session statuses, including the old status: working", () => {
  const saved = {
    repos: [{ id: "r", name: "r", path: "/r", defaultBranch: "main", workspaces: [live({ id: "a", sessionStatus: "working" }), { ...live({ id: "b" }), status: "working" } as unknown as Workspace, live({ id: "c", status: "archived" })] }],
    selection: { kind: "home" as const },
  };
  const ws = withoutLiveSessions(saved).repos[0].workspaces;
  assert.deepEqual(ws.map((w) => [w.id, w.status, w.sessionStatus]), [["a", "idle", undefined], ["b", "idle", undefined], ["c", "archived", undefined]]);
});

test("loads updated_at, so Go to next unread picks the most recently active row", () => {
  const repos = reposFromDb(
    [repo("a")],
    [
      ws("a", "newer-created", "ready", { unread: true, createdAt: "2026-11-05 12:00:00", updatedAt: "2026-11-05 12:00:00" }),
      ws("a", "older-active", "ready", { unread: true, createdAt: "2026-11-01 09:00:00", updatedAt: "2026-11-05 18:00:00" }),
      ws("a", "old-backend", "ready", { createdAt: "2026-11-02 09:00:00" }),
    ],
    [],
  );
  assert.deepEqual(repos[0].workspaces.map((w) => w.updatedAt), [Date.UTC(2026, 10, 5, 12), Date.UTC(2026, 10, 5, 18), undefined]);
  assert.equal(nextUnreadChat({ selection: { kind: "home" }, repos }, { skipSelected: true })?.chatId, "a/older-active");
});
