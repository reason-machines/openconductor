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

test("All search uses workspace updates while Recent and Workspaces keep their existing order", () => {
  const active = [
    { ...w("target-active-old", 100), updatedAt: 10 },
    { ...w("target-active-new", 1), updatedAt: 200 },
    w("target-active-fallback", 50),
  ];
  const archived = [
    { ...w("target-archived-old", 100), status: "archived" as const, updatedAt: 10 },
    { ...w("target-archived-new", 1), status: "archived" as const, updatedAt: 200 },
    { ...w("target-archived-fallback", 50), status: "archived" as const },
  ].map((workspace) => ({
    id: workspace.id,
    repoId: "r1",
    name: workspace.name,
    branch: workspace.branch,
    createdAt: workspace.createdAt,
    workspace,
  }));
  const source: AppState = {
    ...state,
    repos: [{ ...state.repos[0], workspaces: active }],
    selection: { kind: "workspace", repoId: "r1", workspaceId: "target-active-old" },
  };
  const entries = paletteDataFromState(source, ["target-active-old", "target-archived-old", "target-active-new"], archived);
  const recent = buildResults("all", "", entries).find((g) => g.id === "recent-workspaces");
  assert.deepEqual(recent?.items.map((item) => item.id), [
    "workspace:target-active-old",
    "workspace:target-archived-old",
    "workspace:target-active-new",
  ]);
  assert.deepEqual(buildResults("workspaces", "", entries)[0].items.map((item) => item.id), [
    "workspace:target-active-old",
    "workspace:target-active-new",
    "workspace:target-active-fallback",
  ]);
  const matches = buildResults("all", "target", entries).find((g) => g.id === "workspaces");
  assert.deepEqual(matches?.items.map((item) => item.id), [
    "workspace:target-active-new",
    "workspace:target-active-fallback",
    "workspace:target-active-old",
    "workspace:target-archived-new",
    "workspace:target-archived-fallback",
    "workspace:target-archived-old",
  ]);
});

test("workspace actions appear only with a workspace selected", () => {
  const headings = (s: AppState) => buildResults("all", "", paletteDataFromState(s, [])).map((g) => g.heading);
  assert.ok(headings(state).includes("Workspace actions"));
  assert.ok(!headings({ ...state, selection: { kind: "home" } }).includes("Workspace actions"));
});

for (const loaded of [false, true]) {
  test(`Archive workspace is absent for the open archived selection ${loaded ? "after" : "before"} archived results load`, () => {
    const workspace: Workspace = { ...w("archived-open", 4), status: "archived" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    const data = paletteDataFromState(source, [workspace.id, "b"], archived);
    assert.equal(data.activeWorkspaceId, workspace.id);
    assert.deepEqual(data.recentWorkspaceIds, loaded ? [workspace.id, "b"] : ["b"]);
    // These actions require gitPanelWorkspace (non-archived path), so they are correctly absent
    // for an archived selection too; exclude them from the parity check.
    const gitPanelGated = new Set(["archive-workspace", "quick-open", "search-in-files", "create-pull-request", "fix-errors"]);
    assert.deepEqual(
      data.actions.filter((a) => !gitPanelGated.has(a.id)).map((a) => a.id),
      paletteDataFromState(state, []).actions.filter((a) => !gitPanelGated.has(a.id)).map((a) => a.id),
    );
    for (const tab of ["all", "actions"] as const) {
      for (const query of ["", "archive"]) {
        const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(!ids.includes("action:archive-workspace"), `${tab}/${query || "empty"} must not offer Archive workspace for an archived selection`);
      }
    }
  });
}

test("Archive workspace stays available for an active selection and hidden without a workspace despite a retained archived view", () => {
  const workspace: Workspace = { ...w("archived-open", 4), status: "archived" };
  for (const selection of [state.selection, { kind: "home" }, { kind: "root" }] satisfies AppState["selection"][]) {
    const source: AppState = { ...state, selection, archivedOpen: { repoId: "r1", workspace } };
    const data = paletteDataFromState(source, []);
    for (const tab of ["all", "actions"] as const) {
      for (const query of ["", "archive"]) {
        const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
        assert.equal(ids.includes("action:archive-workspace"), selection.kind === "workspace");
      }
    }
  }
});

for (const loaded of [false, true]) {
  test(`File picker is absent for the open archived selection ${loaded ? "after" : "before"} archived results load`, () => {
    const workspace: Workspace = { ...w("archived-open", 4), status: "archived", state: "archived", path: "/invented/workspaces/archived-open" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    const data = paletteDataFromState(source, [workspace.id, "b"], archived);
    assert.equal(data.activeWorkspaceId, workspace.id);
    assert.deepEqual(data.recentWorkspaceIds, loaded ? [workspace.id, "b"] : ["b"]);
    assert.ok(!data.actions.some((a) => a.id === "quick-open"), "an archived selection must not offer File picker");
    for (const tab of ["all", "actions"] as const) {
      for (const query of ["", "picker"]) {
        const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(!ids.includes("action:quick-open"), `${tab}/${query || "empty"} must not offer File picker for an archived selection`);
      }
    }
  });
}

test("File picker is absent for an unstarted local workspace even when its path is known", () => {
  const workspace: Workspace = { ...w("unstarted", 4), state: "unstarted", path: "/invented/workspaces/unstarted" };
  const source: AppState = {
    ...state,
    repos: [{ ...state.repos[0], workspaces: [workspace] }],
    selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
  };
  const data = paletteDataFromState(source, []);
  assert.equal(data.activeWorkspaceId, workspace.id);
  assert.ok(!data.actions.some((a) => a.id === "quick-open"), "an unstarted selection must not offer File picker");
  for (const tab of ["all", "actions"] as const) {
    for (const query of ["", "picker"]) {
      const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
      assert.ok(!ids.includes("action:quick-open"), `${tab}/${query || "empty"} must not offer File picker for an unstarted selection`);
    }
  }
});

test("File picker stays available for active local states despite an unrelated retained archived view", () => {
  const archivedWorkspace: Workspace = { ...w("archived-open", 4), status: "archived", state: "archived" };
  for (const workspaceState of [undefined, "active", "ready", "initializing", "setting_up", "failed"]) {
    const source: AppState = {
      ...state,
      repos: [{ ...state.repos[0], workspaces: [{ ...w("b", 2), state: workspaceState }] }],
      archivedOpen: { repoId: "r1", workspace: archivedWorkspace },
    };
    const data = paletteDataFromState(source, []);
    assert.equal(data.actions.find((a) => a.id === "quick-open")?.bindingId, "nav.quickOpen");
    for (const tab of ["all", "actions"] as const) {
      for (const query of ["", "picker"]) {
        const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(ids.includes("action:quick-open"), `${tab}/${query || "empty"} must retain File picker for local state ${workspaceState ?? "unspecified"}`);
      }
    }
  }
});

test("File picker is absent for a missing workspace or without a workspace selection", () => {
  const selections = [{ kind: "workspace", repoId: "r1", workspaceId: "missing" }, { kind: "home" }, { kind: "root" }] satisfies AppState["selection"][];
  for (const selection of selections) {
    const data = paletteDataFromState({ ...state, selection }, []);
    assert.ok(!data.actions.some((a) => a.id === "quick-open"), "File picker requires an active local workspace");
    for (const tab of ["all", "actions"] as const) {
      for (const query of ["", "picker"]) {
        const ids = buildResults(tab, query, data).flatMap((g) => g.items.map((i) => i.id));
        assert.ok(!ids.includes("action:quick-open"));
      }
    }
  }
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
    updatedAt: 5,
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
  // renderApp @10,913,500-10,918,150 for a local user, less Passport, Check for updates, Team and Routines.
  assert.deepEqual(titles("actions"), [
    "Create workspace",
    "Create section",
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

const viewArchivedId = "view-archived-workspaces";
function assertViewArchivedEligibility(source: AppState, expected: boolean, archived: Parameters<typeof paletteDataFromState>[2] = []) {
  const data = paletteDataFromState(source, ["b"], archived);
  assert.equal(data.actions.some((a) => a.id === viewArchivedId), expected);
  for (const query of ["", "archive"]) {
    const navigation = buildResults("all", query, data).find((g) => g.id === "navigation");
    assert.equal(navigation?.items.some((item) => item.id === `action:${viewArchivedId}`) ?? false, expected);
  }
  return data;
}

const missingViewArchivedSources: [string, AppState][] = [
  ["startup placeholders before workspace hydration", { ...state, repos: [{ ...state.repos[0], workspaces: [] }] }],
  ["a missing selected workspace", { ...state, selection: { kind: "workspace", repoId: "r1", workspaceId: "missing" } }],
  ["a workspace found only in another repository", { ...state, selection: { kind: "workspace", repoId: "r2", workspaceId: "b" } }],
  ["a missing selected repository", { ...state, selection: { kind: "workspace", repoId: "missing", workspaceId: "b" } }],
];
for (const [label, source] of missingViewArchivedSources) {
  test(`View archived workspaces is absent for ${label}`, () => {
    const data = assertViewArchivedEligibility(source, false);
    assert.equal(data.activeWorkspaceId, source.selection.kind === "workspace" ? source.selection.workspaceId : null);
  });
}

for (const loaded of [false, true]) {
  test(`View archived workspaces does not resolve a selection from the archived list ${loaded ? "after" : "before"} results load`, () => {
    const workspace: Workspace = { ...w("archived-selected", 4), status: "archived", state: "archived" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace: { ...workspace, id: "unrelated-archived" } },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    assertViewArchivedEligibility(source, false, archived);
  });

  test(`View archived workspaces stays available for the resolved archived view ${loaded ? "after" : "before"} results load`, () => {
    const workspace: Workspace = { ...w("archived-open", 4), status: "archived", state: "archived" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    const data = assertViewArchivedEligibility(source, true, archived);
    assert.equal(data.activeWorkspaceId, workspace.id);
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
    assert.ok(!data.actions.some((a) => a.id === "archive-workspace" || a.id === "quick-open"));
  });
}

test("View archived workspaces requires presence rather than a ready-only lifecycle", () => {
  for (const workspaceState of [undefined, "active", "ready", "initializing", "setting_up", "unstarted", "failed"]) {
    const source: AppState = {
      ...state,
      repos: [{ ...state.repos[0], workspaces: [{ ...w("b", 2), state: workspaceState }] }],
      archivedOpen: { repoId: "r1", workspace: { ...w("unrelated-archived", 4), status: "archived" } },
    };
    const data = assertViewArchivedEligibility(source, true);
    assert.equal(data.activeWorkspaceId, "b");
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
  }
});

test("View archived workspaces is absent without a workspace selection despite a retained archived view", () => {
  for (const selection of [{ kind: "home" }, { kind: "root" }] satisfies AppState["selection"][]) {
    const source: AppState = {
      ...state,
      selection,
      archivedOpen: { repoId: "r1", workspace: { ...w("b", 2), status: "archived" } },
    };
    const data = assertViewArchivedEligibility(source, false);
    assert.equal(data.activeWorkspaceId, null);
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
  }
});

function assertCopyUrlEligibility(source: AppState, expected: boolean, archived: Parameters<typeof paletteDataFromState>[2] = []) {
  const data = paletteDataFromState(source, ["b"], archived);
  assert.equal(data.actions.some((action) => action.id === "copy-url"), expected);
  for (const tab of ["all", "actions"] as const) {
    for (const query of ["", "copy", "url"]) {
      const items = buildResults(tab, query, data).flatMap((group) => group.items);
      assert.equal(items.some((item) => item.id === "action:copy-url"), expected, `${tab}/${query || "empty"} Copy URL eligibility`);
    }
  }
  if (expected) assert.equal(data.actions.find((action) => action.id === "copy-url")?.bindingId, "workspace.copyLink");
  return data;
}

const missingCopyUrlSources: [string, AppState][] = [
  ["startup placeholders before workspace hydration", { ...state, repos: [{ ...state.repos[0], workspaces: [] }] }],
  ["a missing selected workspace", { ...state, selection: { kind: "workspace", repoId: "r1", workspaceId: "missing" } }],
  ["a workspace found only in another repository", { ...state, selection: { kind: "workspace", repoId: "r2", workspaceId: "b" } }],
  ["a missing selected repository", { ...state, selection: { kind: "workspace", repoId: "missing", workspaceId: "b" } }],
];
for (const [label, source] of missingCopyUrlSources) {
  test(`Copy URL is absent for ${label}`, () => {
    const data = assertCopyUrlEligibility(source, false);
    assert.equal(data.activeWorkspaceId, source.selection.kind === "workspace" ? source.selection.workspaceId : null);
  });
}

for (const loaded of [false, true]) {
  test(`Copy URL does not resolve a selection from the archived list ${loaded ? "after" : "before"} results load`, () => {
    const workspace: Workspace = { ...w("archived-selected", 4), status: "archived", state: "archived" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace: { ...workspace, id: "unrelated-archived" } },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    assertCopyUrlEligibility(source, false, archived);
  });

  test(`Copy URL stays available for the resolved archived view ${loaded ? "after" : "before"} results load`, () => {
    const workspace: Workspace = { ...w("archived-open", 4), status: "archived", state: "archived" };
    const source: AppState = {
      ...state,
      selection: { kind: "workspace", repoId: "r1", workspaceId: workspace.id },
      archivedOpen: { repoId: "r1", workspace },
    };
    const archived = loaded ? [{ id: workspace.id, repoId: "r1", name: workspace.name, branch: workspace.branch, createdAt: workspace.createdAt, workspace }] : [];
    const data = assertCopyUrlEligibility(source, true, archived);
    assert.equal(data.activeWorkspaceId, workspace.id);
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
    assert.ok(!data.actions.some((action) => action.id === "archive-workspace" || action.id === "quick-open"));
  });
}

test("Copy URL requires presence rather than a path or a ready-only lifecycle", () => {
  for (const workspaceState of [undefined, "active", "ready", "initializing", "setting_up", "unstarted", "failed"]) {
    const source: AppState = {
      ...state,
      repos: [{ ...state.repos[0], workspaces: [{ ...w("b", 2), state: workspaceState }] }],
      archivedOpen: { repoId: "r1", workspace: { ...w("unrelated-archived", 4), status: "archived" } },
    };
    const data = assertCopyUrlEligibility(source, true);
    assert.equal(data.activeWorkspaceId, "b");
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
  }
});

test("Copy URL is absent without a workspace selection despite a retained archived view", () => {
  for (const selection of [{ kind: "home" }, { kind: "root" }] satisfies AppState["selection"][]) {
    const source: AppState = {
      ...state,
      selection,
      archivedOpen: { repoId: "r1", workspace: { ...w("b", 2), status: "archived" } },
    };
    const data = assertCopyUrlEligibility(source, false);
    assert.equal(data.activeWorkspaceId, null);
    assert.deepEqual(data.recentWorkspaceIds, ["b"]);
  }
});
