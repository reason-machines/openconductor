import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppState, Workspace } from "../state/types.ts";
import { paletteDataFromState, shortcutOrder, sidebarOrder, stepWorkspace } from "./fromAppState.ts";
import { buildResults } from "./search/model.ts";

const w = (id: string, createdAt: number): Workspace => ({
  id,
  name: id,
  branch: `b-${id}`,
  status: "idle",
  diff: { added: 0, removed: 0 },
  createdAt,
});
const state: AppState = {
  repos: [
    { id: "r1", name: "openconductor", path: "", defaultBranch: "main", workspaces: [w("a", 1), w("b", 2)] },
    { id: "r2", name: "api", path: "", defaultBranch: "main", workspaces: [w("c", 3)] },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "b" },
};

test("sidebar order spans repos in order, newest first inside a repo, as the sidebar shows them", () => {
  assert.deepEqual(
    sidebarOrder(state).map((x) => x.workspace.id),
    ["b", "a", "c"],
  );
});

test("Cmd+1..9 order puts Pinned first and skips collapsed repos", () => {
  const s: AppState = {
    ...state,
    repos: [
      { ...state.repos[0], workspaces: [w("a", 1), { ...w("b", 2), pinnedAt: 5 }] },
      { ...state.repos[1], collapsed: true },
    ],
  };
  assert.deepEqual(shortcutOrder(s).map((x) => x.workspace.id), ["b", "a"]);
  assert.deepEqual(sidebarOrder(s).map((x) => x.workspace.id), ["b", "a", "c"]);
});

test("stepping wraps and starts at the ends when nothing is selected", () => {
  assert.equal(stepWorkspace(state, 1)?.workspace.id, "a");
  assert.equal(stepWorkspace({ ...state, selection: { kind: "workspace", repoId: "r2", workspaceId: "c" } }, 1)?.workspace.id, "b");
  assert.equal(stepWorkspace({ ...state, selection: { kind: "home" } }, -1)?.workspace.id, "c");
  assert.equal(stepWorkspace({ repos: [], selection: { kind: "home" } }, 1), undefined);
});

test("recents drop unknown ids and outrank creation time in the Workspaces tab", () => {
  const data = paletteDataFromState(state, ["a", "gone"]);
  assert.deepEqual(data.recentWorkspaceIds, ["a"]);
  assert.equal(data.activeWorkspaceId, "b");
  const order = buildResults("workspaces", "", data)[0].items.map((i) => i.id);
  assert.deepEqual(order, ["workspace:a", "workspace:c", "workspace:b"]);
});

test("workspace actions appear only with a workspace selected", () => {
  const headings = (s: AppState) => buildResults("all", "", paletteDataFromState(s, [])).map((g) => g.heading);
  assert.ok(headings(state).includes("Workspace actions"));
  assert.ok(!headings({ ...state, selection: { kind: "home" } }).includes("Workspace actions"));
});

test("archived workspaces from conductor.db join the palette data after the active ones; View archived workspaces is a Navigation action", () => {
  const ws = (id: string, name: string, branch: string, createdAt: number) => ({ id, name, branch, createdAt, status: "archived" as const, diff: { added: 0, removed: 0 } });
  const data = paletteDataFromState(state, [], [
    { id: "r2/z", repoId: "r2", name: "zurich", branch: "b-z", createdAt: 5, workspace: ws("r2/z", "zurich", "b-z", 5) },
    { id: "gone/x", repoId: "gone", name: "x", branch: "x", createdAt: 6, workspace: ws("gone/x", "x", "x", 6) },
  ]);
  const all = buildResults("workspaces", "", data, "all")[0].items.map((i) => i.id.split(":")[1]);
  assert.deepEqual(all, ["c", "b", "a", "r2/z"]);
  assert.deepEqual(data.workspaces.find((x) => x.id === "r2/z"), { id: "r2/z", name: "zurich", branch: "b-z", repoName: "api", lastActiveAt: 5 - Number.MAX_SAFE_INTEGER / 2, archived: true });
  const nav = buildResults("actions", "archived", data).find((g) => g.id === "navigation");
  assert.deepEqual(nav?.items.map((i) => i.id), ["action:view-archived-workspaces"]);
});

test("Recent workspaces keeps archived workspaces and drops deleted ones, as Conductor's palette does", () => {
  const ws = (id: string) => ({ id, name: id, branch: id, createdAt: 5, status: "archived" as const, diff: { added: 0, removed: 0 } });
  const archived = [{ id: "r2/z", repoId: "r2", name: "zurich", branch: "b-z", createdAt: 5, workspace: ws("r2/z") }];
  const data = paletteDataFromState(state, ["r2/z", "deleted", "a"], archived);
  assert.deepEqual(data.recentWorkspaceIds, ["r2/z", "a"]);
  const recent = buildResults("all", "", data).find((g) => g.heading === "Recent workspaces");
  assert.deepEqual(recent?.items.map((i) => i.id), ["workspace:r2/z", "workspace:a"]);
});

test("Go to next unread is listed under Navigation only while a non-archived workspace is unread", () => {
  const ids = (s: AppState) => paletteDataFromState(s, []).actions.map((a) => a.id);
  assert.ok(!ids(state).includes("go-to-next-unread"));
  const unread: AppState = { ...state, repos: [{ ...state.repos[0], workspaces: [{ ...w("a", 1), unread: true }, w("b", 2)] }, state.repos[1]] };
  const actions = paletteDataFromState(unread, []).actions;
  const entry = actions.find((a) => a.id === "go-to-next-unread");
  assert.equal(entry?.group, "navigation");
  assert.equal(entry?.bindingId, "chat.nextAttention");
  assert.equal(actions.filter((a) => a.group === "navigation")[0].id, "go-to-next-unread");
  const archived: AppState = { ...state, repos: [{ ...state.repos[0], workspaces: [{ ...w("a", 1), unread: true, status: "archived" }] }] };
  assert.ok(!ids(archived).includes("go-to-next-unread"));
});
