import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppState, Workspace } from "../state/types.ts";
import { PALETTE_ACTIONS, paletteDataFromState, paletteSettings, shortcutOrder, sidebarOrder, stepWorkspace } from "./fromAppState.ts";
import { buildSearchIndex } from "../settings/searchIndex.ts";
import { SETTINGS_GROUPS } from "../settings/pages.ts";
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
      { ...state.repos[0], collapsed: false, workspaces: [w("a", 1), { ...w("b", 2), pinnedAt: 5 }] },
      { ...state.repos[1], collapsed: true },
    ],
  };
  assert.deepEqual(shortcutOrder(s, new Set()).map((x) => x.workspace.id), ["b", "a"]);
  assert.deepEqual(sidebarOrder(s).map((x) => x.workspace.id), ["b", "a", "c"]);
  // Never toggled, r1 folds: the open workspace b is pinned, so it is not one of r1's rows (Conductor's Dra).
  const untoggled: AppState = { ...s, repos: [{ ...s.repos[0], collapsed: undefined }, s.repos[1]] };
  assert.deepEqual(shortcutOrder(untoggled, new Set()).map((x) => x.workspace.id), ["b"]);
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

test("palette workspace entries carry workspaces.number for the W-<n> column", () => {
  const numbered: AppState = {
    ...state,
    repos: [{ ...state.repos[0]!, workspaces: [{ ...w("a", 1), number: 12 }, w("b", 2)] }],
  };
  const byId = new Map(paletteDataFromState(numbered, []).workspaces.map((e) => [e.id, e.number]));
  assert.equal(byId.get("a"), 12);
  assert.equal(byId.get("b"), null);
});

test("archived workspaces from conductor.db join the palette data after the active ones; View archived workspaces is a Navigation action", () => {
  const ws = (id: string, name: string, branch: string, createdAt: number) => ({ id, name, branch, createdAt, status: "archived" as const, diff: { added: 0, removed: 0 } });
  const data = paletteDataFromState(state, [], [
    { id: "r2/z", repoId: "r2", name: "zurich", branch: "b-z", createdAt: 5, workspace: ws("r2/z", "zurich", "b-z", 5) },
    { id: "gone/x", repoId: "gone", name: "x", branch: "x", createdAt: 6, workspace: ws("gone/x", "x", "x", 6) },
  ]);
  const all = buildResults("workspaces", "", data, "all")[0].items.map((i) => i.id.split(":")[1]);
  assert.deepEqual(all, ["c", "b", "a", "r2/z"]);
  assert.deepEqual(data.workspaces.find((x) => x.id === "r2/z"), {
    id: "r2/z",
    name: "zurich",
    branch: "b-z",
    repoName: "api",
    lastActiveAt: 5 - Number.MAX_SAFE_INTEGER / 2,
    archived: true,
    number: null,
    label: "B z",
    activeAt: 5,
  });
  // Navigation is in the All tab only; Conductor's Actions tab lists Workspace actions, Actions and Open in (`R_a`).
  assert.equal(buildResults("actions", "archived", data).find((g) => g.id === "navigation"), undefined);
  const nav = buildResults("all", "archived", data).find((g) => g.id === "navigation");
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

test("Go to next unread is listed under Navigation only while a chat of a non-archived workspace is unread", () => {
  const ids = (s: AppState) => paletteDataFromState(s, []).actions.map((a) => a.id);
  assert.ok(!ids(state).includes("go-to-next-unread"));
  const unread: AppState = { ...state, repos: [{ ...state.repos[0], workspaces: [{ ...w("a", 1), unreadChats: [{ id: "a", at: 1 }] }, w("b", 2)] }, state.repos[1]] };
  const actions = paletteDataFromState(unread, []).actions;
  const entry = actions.find((a) => a.id === "go-to-next-unread");
  assert.equal(entry?.group, "navigation");
  assert.equal(entry?.bindingId, "chat.nextAttention");
  assert.equal(actions.filter((a) => a.group === "navigation")[0].id, "go-to-next-unread");
  const archived: AppState = { ...state, repos: [{ ...state.repos[0], workspaces: [{ ...w("a", 1), unreadChats: [{ id: "a", at: 1 }], status: "archived" }] }] };
  assert.ok(!ids(archived).includes("go-to-next-unread"));
});

test("the All tab lists Conductor's Actions and Navigation commands in its order, with their shortcuts", () => {
  const titles = (g: string) => PALETTE_ACTIONS.filter((a) => a.group === g).map((a) => a.title);
  // renderApp @10,913,500-10,918,150 for a local user, less Create section, Passport, Check for updates, Team and Routines.
  assert.deepEqual(titles("actions"), [
    "Create workspace",
    "Add project",
    "Toggle theme",
    "Toggle left sidebar",
    "Toggle right sidebar",
    "Toggle zen mode",
    "Send feedback",
    "Submit a prompt",
    "Show keyboard shortcuts",
    "Open changelog",
  ]);
  assert.deepEqual(titles("navigation"), ["Go to next unread", "Settings", "Home", "View archived workspaces", "Open documentation"]);
  const binding = new Map(PALETTE_ACTIONS.map((a) => [a.id, a.bindingId ?? a.hint]));
  assert.equal(binding.get("toggle-zen-mode"), "view.toggleZenMode");
  assert.equal(binding.get("add-project"), "nav.addRepository");
  assert.equal(binding.get("settings"), "⌘,");
  assert.equal(binding.get("submit-prompt"), undefined);
});

test("View archived workspaces is listed only while a workspace is open, as Conductor's `Xt &&`", () => {
  const ids = (s: AppState) => paletteDataFromState(s, []).actions.map((a) => a.id);
  assert.ok(ids(state).includes("view-archived-workspaces"));
  assert.ok(!ids({ ...state, selection: { kind: "root" } }).includes("view-archived-workspaces"));
});

test("workspace rows carry the sidebar's display name, last activity and unread", () => {
  const named: AppState = {
    ...state,
    repos: [{ ...state.repos[0]!, workspaces: [{ ...w("a", 1), branch: "ada/fix-login", updatedAt: 9, unreadChats: [{ id: "a", at: 9 }] }] }],
  };
  const entry = paletteDataFromState(named, []).workspaces[0]!;
  assert.equal(entry.label, "Ada/fix login");
  assert.equal(entry.activeAt, 9);
  assert.equal(entry.unread, true);
});

test("settings pages are listed with no query and their rows join once there is one (Conductor's `[...We, ...query ? He : []]`)", () => {
  const index = buildSearchIndex({ pages: SETTINGS_GROUPS.flatMap((g) => g.pages), agentTabs: [{ id: "claude", label: "Claude Code" }], hasRepos: true });
  const data = paletteDataFromState(state, [], [], paletteSettings(index));
  const settings = (q: string) => buildResults("settings", q, data).find((g) => g.id === "settings")?.items.map((i) => (i.kind === "setting" ? i.setting.title : "")) ?? [];
  const pages = settings("");
  assert.deepEqual(pages.slice(0, 4), ["General", "Account", "Appearance", "Keyboard shortcuts"]);
  assert.ok(pages.includes("Claude Code"));
  // Conductor's nav order (`jWt`): Environment, then the repository sections, then More.
  assert.deepEqual(pages.slice(pages.indexOf("Environment")), ["Environment", "Scripts", "Actions", "Misc", "Experimental", "Advanced"]);
  assert.ok(!pages.includes("Theme"), "rows stay out of the empty list");
  assert.ok(settings("theme").includes("Theme"), "a query reaches the rows");
  // "login" matches Account by its keywords, as Conductor's palette shows it.
  assert.ok(settings("login").includes("Account"));
});
