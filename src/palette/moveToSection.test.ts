import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { ComponentProps } from "react";
import type { Action, StoreStartup } from "../state/store";
import type { AppState, Workspace } from "../state/types";
import * as navigationSections from "../state/navigationSections.ts";
import * as adapter from "./fromAppState.ts";
import * as search from "./search/model.ts";
import * as searchScore from "./search/score.ts";
import * as paletteState from "./state.ts";
import { sidebarWrite } from "../state/sidebarPersist.ts";
import { GIT_PANEL_ACTIONS } from "./gitPanelActions.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in Move to section fixture"); };
const prefs = { default_open_in: null, sidebar_repo_filter: null, experimental_new_workspace_page: false };
const empty = { repos: [], selection: { kind: "root" }, sections: [], sidebarVisible: false } satisfies AppState;
const workspaceState = {
  ...empty,
  selection: { kind: "workspace", repoId: "repo-fixture", workspaceId: "workspace-fixture" },
  repos: [{ id: "repo-fixture", name: "Synthetic local project", path: "/synthetic/not-an-open-target", defaultBranch: "main", workspaces: [{ id: "workspace-fixture", name: "Synthetic local workspace", branch: "fixture", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, pinnedAt: 10 }] }],
  sections: [
    { id: "section-current", name: "Current", workspaceIds: ["workspace-fixture"] },
    { id: "section-focus", name: "Focus", workspaceIds: [] },
  ],
} satisfies AppState;

function evaluate(file: string, imports: Readonly<Record<string, unknown>>, exports: object, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    ...globals, exports, URLSearchParams, Date, console,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected ${file} dependency: ${name}`);
      return imports[name];
    },
  });
}

function actualReducer() {
  const exports: Partial<typeof import("../state/store")> = {};
  const imports: Record<string, unknown> = {};
  for (const name of ["@tauri-apps/api/core", "./names", "./selectors", "../backend", "./repoOrder", "./persisted", "./sidebarPersist", "./sidebarOrder", "./nextUnread", "./chatUnread", "./addRepo", "../workspace/archive", "../scripts/api", "../scripts/model", "../workspace/setupWatch", "../settings/appPrefs", "../lib/persistence/producer.ts"]) imports[name] = {};
  imports["./navigationSections"] = navigationSections;
  evaluate("../state/store.ts", imports, exports);
  assert.ok(exports.reducer);
  return exports.reducer;
}

type PaletteProps = ComponentProps<typeof import("./CommandPalette").CommandPalette>;

function actualPalette() {
  const exports: Partial<typeof import("./CommandPalette")> = {};
  const screen: Record<string, unknown> = {};
  const screenImports = {
    "./search/model.ts": search,
    "./search/score.ts": searchScore,
    "./state.ts": paletteState,
    "../components/ConductorIcon": { ConductorIcon: inert },
    "../components/Icons": { SearchIcon: inert },
  };
  const screenUrl = new URL("./MoveToSection.tsx", import.meta.url);
  if (existsSync(screenUrl)) evaluate("./MoveToSection.tsx", screenImports, screen);
  evaluate("./CommandPalette.tsx", {
    "../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut.ts": { glyphs: () => "" },
    "./search/model.ts": search,
    "./state.ts": paletteState,
    "../state/workspaceNumber.ts": { workspaceNumberLabel: () => "" },
    "./fromAppState.ts": adapter,
    "../home/allWorkspaces.ts": { loadFilters: () => ({}), saveFilters: noop, CLEARED_FILTERS: {} },
    "./workspacesTab.ts": { showClearFilters: () => false, workspacesTabRows: () => ({ active: [], archived: [] }) },
    "./WorkspacesTab.tsx": { WorkspaceFilters: inert, WorkspaceRow: inert },
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "../components/ConductorIcon": { ConductorIcon: inert },
    "../home/allWorkspaces": { shortRelativeTime: () => "now" },
    "./palette.css": {},
    "./MoveToSection.tsx": screen,
  }, exports);
  assert.ok(exports.CommandPalette);
  return exports.CommandPalette;
}

function actualHost(observe: (props: PaletteProps) => void = noop) {
  const Palette = actualPalette();
  const exports: Partial<typeof import("./PaletteHost")> = {};
  const imports = {
    "./CommandPalette.tsx": { CommandPalette: (props: PaletteProps) => { observe(props); return React.createElement(Palette, props); } },
    "../keybindings/KeybindingsProvider.tsx": { useKeybindings: noop },
    "./fromAppState.ts": adapter,
    "../settings/searchIndex": { buildSearchIndex: () => [] },
    "../settings/pages": { settingsGroups: () => [] },
    "../settings/SettingsView": { AGENT_SEARCH_TABS: [], scrollToRow: forbidden, searchIcon: inert },
    "../features/chat/ChatModelPicker": { openAgentSettings: forbidden, openRepoSettingsPage: forbidden, openSettingsPage: forbidden },
    "../settings/useBoolPref.ts": { useBoolPref: () => false },
    "./recentWorkspaces.ts": { loadRecentWorkspaceIds: () => [], saveRecentWorkspaceIds: noop, recordViewedWorkspace: (ids: string[]) => ids },
    "./settingsRepository.ts": { loadLastWorkspaceRoute: () => null, selectedWorkspaceRoute: () => null, saveLastWorkspaceRoute: noop, settingsRepositoryId: forbidden },
    "../workspace/archive": { listArchivedWorkspaces: async () => [] },
    "../state/nextUnread.ts": { openNextUnread: forbidden },
    "./projectWorkspace.ts": { preferredProjectWorkspace: forbidden },
    "../features/openIn/OpenInButton.tsx": { AppIcon: inert, useInstalledApps: () => [] },
    "../features/openIn/apps.ts": { openInApp: forbidden },
    "../settings/appPrefs.ts": { recordOpenIn: forbidden, useAppPrefs: () => prefs },
    "../components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: forbidden, dismiss: noop }) },
    "../components/ConductorIcon": { ConductorIcon: inert },
    "./gitPanelActions.ts": { GIT_PANEL_ACTIONS, requestGitPanelAction: forbidden },
    "./MoveToSection.tsx": (() => {
      const s: Record<string, unknown> = {};
      const screenUrl = new URL("./MoveToSection.tsx", import.meta.url);
      if (existsSync(screenUrl)) evaluate("./MoveToSection.tsx", { "../components/ConductorIcon": { ConductorIcon: inert }, "../components/Icons": { SearchIcon: inert } }, s);
      return s;
    })(),
  };
  evaluate("./PaletteHost.tsx", imports, exports);
  assert.ok(exports.PaletteHost);
  return exports.PaletteHost;
}

async function shellFixture(seed: AppState = empty, startup: StoreStartup = "ready") {
  type PaletteProps = ComponentProps<typeof import("./PaletteHost").PaletteHost>;
  type SidebarProps = ComponentProps<typeof import("../components/Sidebar").Sidebar>;
  const reduce = actualReducer();
  const actions: Action[] = [];
  let state = seed;
  let palette: PaletteProps | undefined;
  let sidebar: SidebarProps | undefined;
  let localStartup = startup;
  let nextId = 0;
  const window = Object.assign(new EventTarget(), { location: { pathname: "/", search: "?palette=1" }, history: { state: null, replaceState: noop } });
  const dialog: Partial<typeof import("../components/SectionDialog")> = {};
  const emojis: Partial<typeof import("../components/sectionEmoji")> = {};
  const modal: Partial<typeof import("../components/Dialogs")> = {};
  evaluate("../components/sectionEmoji.ts", {}, emojis);
  evaluate("../components/Dialogs.tsx", { "./Icons": { CloseIcon: inert }, "./motion/dialogMotion": { useDialogMotion: () => React.useRef(null) } }, modal);
  evaluate("../components/SectionDialog.tsx", {
    "./Dialogs": modal,
    "./sectionEmoji": emojis,
    // Stubs for primary-action keybinding imports added by #1246 (harmless before that merges).
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { matchesEvent: () => false },
  }, dialog);
  const Host = actualHost();
  const imports: Record<string, unknown> = {
    "@tauri-apps/api/core": { invoke: forbidden },
    "./state/store": { useAppStore() {
      const [current, dispatch] = React.useReducer(reduce, seed);
      state = current;
      const record = React.useCallback((action: Action) => { actions.push(action); dispatch(action); }, [dispatch]);
      return [current, record, localStartup];
    } },
    "./state/useCustomSectionCollapse": { useCustomSectionCollapse: () => [new Set(), noop] },
    "./features/terminal/session": { onAttachFailure: () => noop, destroyWorkspaceTerminals: forbidden },
    "./state/selectors": { isSidebarVisible: (value: AppState) => value.sidebarVisible !== false, removedWorkspaceIds: () => [] },
    "./components/Sidebar": { Sidebar: (props: SidebarProps) => { sidebar = props; return React.createElement("sidebar-probe"); }, OPEN_ADD_PROJECT_MENU: "unused-add-project" },
    "./components/SectionDialog": dialog,
    "./state/names": { newId: () => `new-section-${++nextId}` },
    "./components/Icons": { SidebarIcon: inert },
    "./components/Tooltip": { titleWithShortcut: () => "Toggle left sidebar" },
    "./keybindings/overrides": { effectiveShortcuts: () => [] },
    "./keybindings/shortcut": { glyphs: () => "" },
    "./home.css": {},
    "./settings/repoMisc": { MISC_COPY: {} },
    "./settings/appPrefs": { useAppPrefs: () => prefs },
    "./settings/useBoolPref": { useBoolPrefState: () => false },
    "./workspace/api": { loadBranchPrefix: forbidden },
    "./workspace/naming": { prefixSettingsFromInfo: forbidden },
    "./components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: noop, dismiss: noop }) },
    "./features/pr/useArchiveOnMerge": { useArchiveOnMergeWatcher: noop },
    "./workspace/useSetupWatch": { useSetupWatch: noop },
    "./workspace/archive": { onArchiveEvent: () => noop },
    "./workspace/useInitIssues": { useInitIssues: noop },
    "./components/helpMenuItems": { CHANGELOG_URL: "unused", DOCS_URL: "unused" },
    "./scripts/xcodeLicense": {},
    "./backend": { inTauri: () => false, appInfo: async () => null },
    "./features/chat/chatRuntime": {},
    "./features/quit/quit": {},
    "./state/openProject": {},
    "./state/githubRepoDialog": {},
    "./palette/PaletteHost": { PaletteHost: (props: PaletteProps) => { palette = props; return React.createElement(Host, props); } },
    "./keybindings/KeybindingsProvider": { useKeybindings: noop, useKeybindingOverrides: () => ({ overrides: {} }) },
    "./keybindings/dispatcher": { PRIORITY: { DIALOG: 100 } },
    "./workspace/link": { copyWorkspaceLink: forbidden },
    "./settings/pages": { USER_PAGES: [] },
    "./features/chat/ChatModelPicker.tsx": { OPEN_SETTINGS_EVENT: "unused-open-settings" },
    "./settings/routes": { resolveSettingsUrl: () => null, keptSearch: () => "" },
    "./settings/agents/kitModel": {},
    "./settings/providerTab": {},
    "./org/organization": { ORGANIZATION_EVENT: "unused-organization", storedOrganization: () => null },
    "./settings/useSettings": { rememberSettings: (value: unknown) => value },
    "./settings/appearance": { applyAppearance: noop },
    "./settings/api": { getSettings: async () => ({}), errorText: String },
    "@tauri-apps/api/event": { listen: forbidden },
    "./state/useNavHistory": { useNavHistory: () => ({ canBack: false, canForward: false, onBack: noop, onForward: noop }) },
    "./workspace/useWorkspaceDeepLinks": { useWorkspaceDeepLinks: noop },
    "./state/useAutoUnread": { useAutoUnread: noop },
    "./state/nextUnread": { nextUnreadChat: () => undefined, openNextUnread: forbidden },
    "./home/repoFilter": { createRepoDefault: forbidden },
    "./home/useRepoFilter": { storedRepoFilter: forbidden },
    "./components/panelPrefs": { useSidebarVisiblePref: noop, useSidebarWidth: () => ({ style: {}, resizer: null }) },
  };
  for (const [file, name] of Object.entries({
    "./components/HomeScreen": "HomeScreen", "./components/SubmitPromptDialog": "SubmitPromptDialog", "./components/FeedbackDialog": "FeedbackDialog",
    "./diagnostics/DiagnosticsPage": "DiagnosticsPage", "./components/AllWorkspaces": "AllWorkspaces", "./components/Dashboard": "Dashboard",
    "./components/WorkspaceView": "WorkspaceView", "./features/browser/BrowserPreview": "BrowserPreviewHost", "./components/CreateProjectDialog": "CreateProjectDialog",
    "./components/CloneGitHubRepoDialog": "CloneGitHubRepoDialog", "./components/CreateWorkspaceDialog": "CreateWorkspaceDialog", "./components/CreateWorkspacePage": "CreateWorkspacePage",
    "./components/RemoveRepositoryDialog": "RemoveRepositoryDialog", "./components/ArchiveRunningDialog": "ArchiveRunningDialog", "./components/ArchivedWorkspaceView": "ArchivedWorkspaceView",
    "./components/RestoreWorkspaceDialog": "RestoreWorkspaceDialog", "./components/QuickOpenDialog": "QuickOpenDialog", "./features/quit/QuitDialog": "QuitDialog",
    "./components/GitHubRepoDialog": "GitHubRepoDialog", "./settings/SettingsView": "SettingsView", "./features/routines/RoutinesPage": "RoutinesPage",
    "./features/routines/RoutineEditor": "RoutineEditor", "./components/KeyboardShortcutsDialog": "KeyboardShortcutsDialog",
  })) imports[file] = { [name]: inert };
  imports["./state/createProject"] = {};
  imports["./features/updates/useUpdates"] = { useUpdates: noop };
  const exports: Partial<typeof import("../App")> = {};
  evaluate("../App.tsx", imports, exports, { window });
  const App = exports.default;
  assert.ok(App);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(App)); });
  const requirePalette = () => { assert.ok(palette); return palette; };
  return {
    actions,
    state: () => state,
    root: () => renderer.root,
    async select(selection: AppState["selection"]) {
      const current = requirePalette();
      await act(async () => current.dispatch({ type: "select", selection }));
    },
    showPalette() { act(() => requirePalette().onOpenChange(true)); },
    palette: requirePalette,
    sidebar() { assert.ok(sidebar); return sidebar; },
    dialogs: () => renderer.root.findAllByProps({ role: "dialog" }).filter((node: { props: { "aria-label"?: string } }) => node.props["aria-label"] === "New section" || node.props["aria-label"] === "Edit section"),
    sidebarCount: () => renderer.root.findAllByType("sidebar-probe").length,
    openPlainCreate() {
      act(() => requirePalette().onOpenChange(true));
      const row = renderer.root.findAllByProps({ role: "option" }).find((node: { findAllByProps: (props: object) => { props: { children?: unknown } }[] }) => node.findAllByProps({ className: "palette-title" }).some((title) => title.props.children === "Create section"));
      assert.ok(row, "Create section must be reachable in the actual palette");
      act(() => row.props.onClick());
      assert.equal(requirePalette().open, false, "the actual CommandPalette.choose closes the palette");
    },
    name(value: string) { act(() => renderer.root.findByProps({ "aria-label": "Section name" }).props.onChange({ target: { value } })); },
    click(label: string) {
      const button = renderer.root.findAllByType("button").find((node: { props: { children?: unknown } }) => node.props.children === label);
      assert.ok(button, `Missing dialog button ${label}`);
      act(() => button.props.onClick());
    },
    async startup(value: StoreStartup) { localStartup = value; await act(async () => renderer.update(React.createElement(App))); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (value !== null && typeof value === "object" && "children" in value) return textOf(value.children);
  return "";
}

type Shell = Awaited<ReturnType<typeof shellFixture>>;

function options(view: Shell) {
  return view.root().findAllByProps({ role: "option" });
}

function row(view: Shell, title: string) {
  const item = options(view).find((node: unknown) => textOf(node) === title);
  assert.ok(item, `Missing visible palette row ${title}`);
  return item;
}

async function choose(view: Shell, title: string) {
  const item = row(view, title);
  await act(async () => item.props.onClick());
}

function moveEntry(data: search.PaletteData) {
  const rows = data.actions.filter((entry) => entry.id === "move-to-section");
  assert.equal(rows.length, 1, "M01 resolved local workspace must expose exactly one Move to section row");
  return rows[0];
}

async function move(view: Shell) {
  view.showPalette();
  await choose(view, moveEntry(adapter.workspacePaletteData(view.state(), [])).title);
  assert.equal(view.palette().open, true, "Move to section enters its screen without dismissing the palette");
  assert.ok(view.root().findByProps({ "aria-label": "Back to commands" }));
}

function searchSections(view: Shell, query: string) {
  const input = view.root().findByProps({ role: "combobox" });
  act(() => input.props.onChange({ target: { value: query } }));
}

function key(view: Shell, value: string) {
  const input = view.root().findByProps({ role: "combobox" });
  const event = { key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false };
  act(() => input.props.onKeyDown({ ...event, nativeEvent: event, preventDefault: noop, stopPropagation: noop }));
}

test("M01 actual adapter, All/Actions search and mounted palette expose the reference Move to section command", async () => {
  const data = adapter.workspacePaletteData(workspaceState, []);
  const entry = moveEntry(data);
  assert.equal(entry.title, "Move to section");
  assert.equal(entry.group, "workspace-actions");
  assert.deepEqual(entry.keywords, ["move", "to", "section", "organize", "workspace"]);
  assert.equal(entry.bindingId, undefined);
  assert.equal(entry.hint, undefined);
  assert.equal(data.actions.indexOf(entry), data.actions.findIndex((action) => action.id === "copy-url") + 1);
  for (const tab of ["all", "actions"] satisfies search.PaletteTab[]) {
    const matches = search.buildResults(tab, "move to section", data).flatMap((group) => group.items);
    assert.ok(matches.some((item) => item.kind === "action" && item.action.id === entry.id));
  }
  const view = await shellFixture(workspaceState);
  try { await move(view); } finally { await view.close(); }
});

test("M02 eligibility resolves only the selected repository and does not reuse editable/status guards", () => {
  const target = workspaceState.repos[0].workspaces[0];
  for (const workspaceState2 of ["ready", "initializing", "failed", "unstarted"]) {
    const ws = { ...target, state: workspaceState2 } as unknown as Workspace;
    const seeded: AppState = { ...workspaceState, repos: [{ ...workspaceState.repos[0], workspaces: [ws] }] };
    moveEntry(adapter.workspacePaletteData(seeded, []));
  }
  const archived = { ...target, status: "archived" as "archived" };
  const matching: AppState = { ...workspaceState, repos: [{ ...workspaceState.repos[0], workspaces: [] }], archivedOpen: { repoId: "repo-fixture", workspace: archived } };
  moveEntry(adapter.workspacePaletteData(matching, []));
});

test("M03 negative route and same-id other-repository controls never expose a usable Move to section action", () => {
  const negative: AppState[] = [
    empty,
    { ...workspaceState, selection: { kind: "home" } },
    { ...workspaceState, selection: { kind: "workspace", repoId: "missing", workspaceId: "workspace-fixture" } },
    { ...workspaceState, selection: { kind: "workspace", repoId: "repo-fixture", workspaceId: "missing" } },
    { ...workspaceState, repos: [{ ...workspaceState.repos[0], id: "other-repository" }] },
    { ...workspaceState, repos: [{ ...workspaceState.repos[0], workspaces: [] }], archivedOpen: { repoId: "other-repository", workspace: workspaceState.repos[0].workspaces[0] } },
  ];
  for (const state of negative) assert.equal(adapter.workspacePaletteData(state, []).actions.some((entry) => entry.id === "move-to-section"), false);
});

for (const startup of ["loading", "error"] satisfies StoreStartup[]) {
  test(`M03 mounted ${startup} local hydration withholds the row until ready`, async () => {
    const view = await shellFixture(workspaceState, startup);
    try {
      view.showPalette();
      assert.equal(options(view).some((node: unknown) => textOf(node) === "Move to section"), false);
      assert.equal(view.actions.length, 0);
      await view.startup("ready");
      await move(view);
    } finally { await view.close(); }
  });
}

test("M04 sections retain stored order; current membership is checked and disabled, with New and conditional Remove", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    assert.deepEqual(options(view).map(textOf), ["Current", "Focus", "New section…", "Remove from section"]);
    const current = row(view, "Current");
    assert.ok(current.props["aria-disabled"] === true || current.props["aria-disabled"] === "true");
    assert.equal(current.findAllByProps({ "aria-label": "Current section" }).length, 1, "Current section must expose its check mark");
    assert.ok(view.root().findAll((node: { type: unknown; props: { role?: string } }) => node.type === "hr" || node.props.role === "separator").length > 0);
    await choose(view, "Current");
    assert.equal(view.actions.length, 0);
  } finally { await view.close(); }
  const noSections = await shellFixture({ ...workspaceState, sections: [] });
  try {
    await move(noSections);
    assert.deepEqual(options(noSections).map(textOf), ["New section…"]);
  } finally { await noSections.close(); }
  const unassigned = await shellFixture({ ...workspaceState, sections: workspaceState.sections.map((section) => ({ ...section, workspaceIds: [] })) });
  try {
    await move(unassigned);
    assert.equal(options(unassigned).some((node: unknown) => textOf(node) === "Remove from section"), false);
  } finally { await unassigned.close(); }
});

test("M05 choosing an existing section reuses the reducer, removes old membership, unpins and retains the palette", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    await choose(view, "Focus");
    assert.equal(view.actions.length, 1);
    const action = view.actions[0];
    assert.equal(action.type, "assignSection");
    if (action.type !== "assignSection") throw new Error("Expected existing assignSection consumer");
    assert.equal(action.workspaceId, "workspace-fixture");
    assert.equal(action.sectionId, "section-focus");
    assert.deepEqual(view.state().sections?.find((section) => section.id === "section-current")?.workspaceIds, []);
    assert.equal(view.state().sections?.find((section) => section.id === "section-focus")?.workspaceIds.filter((id) => id === "workspace-fixture").length, 1);
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, undefined);
    const write = sidebarWrite(action);
    assert.equal(write?.command, "db_set_workspace_pinned");
    assert.equal(write?.args.workspaceId, "workspace-fixture");
    assert.equal(write?.args.pinned, false);
    assert.equal(view.palette().open, true);
  } finally { await view.close(); }
});

test("M06 Remove from section uses the existing null assignment without repinning or dismissing", async () => {
  const seeded: AppState = { ...workspaceState, repos: [{ ...workspaceState.repos[0], workspaces: [{ ...workspaceState.repos[0].workspaces[0], pinnedAt: undefined }] }] };
  const view = await shellFixture(seeded);
  try {
    await move(view);
    await choose(view, "Remove from section");
    assert.equal(view.actions.length, 1);
    const action = view.actions[0];
    assert.equal(action.type, "assignSection");
    if (action.type !== "assignSection") throw new Error("Expected existing assignSection consumer");
    assert.equal(action.workspaceId, "workspace-fixture");
    assert.equal(action.sectionId, null);
    assert.ok(view.state().sections?.every((section) => !section.workspaceIds.includes("workspace-fixture")));
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, undefined);
    assert.equal(sidebarWrite(action), undefined);
    assert.equal(view.palette().open, true);
  } finally { await view.close(); }
});

test("M07 Escape, empty Backspace and explicit Back return to commands, not out of the palette", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    searchSections(view, "Focus");
    key(view, "Backspace");
    assert.equal(view.root().findAllByProps({ "aria-label": "Back to commands" }).length, 1);
    searchSections(view, "");
    key(view, "Backspace");
    assert.equal(view.palette().open, true);
    row(view, "Move to section");
    await move(view);
    key(view, "Escape");
    assert.equal(view.palette().open, true);
    row(view, "Move to section");
    await move(view);
    act(() => view.root().findByProps({ "aria-label": "Back to commands" }).props.onClick());
    assert.equal(view.palette().open, true);
    row(view, "Move to section");
  } finally { await view.close(); }
});

test("M08 complete-name query filters eligible sections and Enter cannot activate the disabled current section", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    searchSections(view, "Current");
    assert.deepEqual(options(view).map(textOf), ["Current"]);
    key(view, "Enter");
    assert.equal(view.actions.length, 0);
    searchSections(view, "Focus");
    assert.deepEqual(options(view).map(textOf), ["Focus"]);
    key(view, "Enter");
    assert.equal(view.actions.length, 1);
    assert.equal(view.palette().open, true);
  } finally { await view.close(); }
});

test("M09 New section closes the palette and opens exactly one existing dialog for the captured workspace", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    await choose(view, "New section…");
    assert.equal(view.palette().open, false);
    assert.equal(view.dialogs().length, 1);
    assert.equal(view.actions.length, 0);
  } finally { await view.close(); }
});

test("M10 explicit Cancel returns to the same section screen without writes; stale selection is not restored", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    await choose(view, "New section…");
    view.click("Cancel");
    assert.equal(view.dialogs().length, 0);
    assert.equal(view.actions.length, 0);
    assert.equal(view.palette().open, true);
    row(view, "Current");
    await choose(view, "New section…");
    await view.select({ kind: "home" });
    view.click("Cancel");
    assert.equal(view.dialogs().length, 0);
    assert.equal(view.actions.length, 1);
    assert.equal(view.actions[0].type, "select");
    assert.equal(view.root().findAllByProps({ "aria-label": "Back to commands" }).length, 0);
  } finally { await view.close(); }
});

test("M11 valid Create reuses the captured-workspace creator with trimmed name/emoji, unpins and restores the screen", async () => {
  const view = await shellFixture(workspaceState);
  try {
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, 10, "M11 seed remains pinned; #1033 is not waived");
    await move(view);
    await choose(view, "New section…");
    view.name("  Created focus  ");
    act(() => view.root().findByProps({ "aria-label": "Choose section emoji" }).props.onClick());
    const emoji = view.root().findAllByProps({ className: "section-emoji-option" })[0];
    assert.ok(emoji);
    const chosenEmoji = textOf(emoji);
    act(() => emoji.props.onClick());
    view.click("Create");
    const creations = view.actions.filter((action) => action.type === "createSection");
    assert.equal(creations.length, 1);
    const created = creations[0];
    if (created.type !== "createSection") throw new Error("Expected existing creator");
    assert.equal(created.section.name, "Created focus");
    assert.equal(created.section.emoji, chosenEmoji);
    assert.equal(created.section.workspaceIds.length, 1);
    assert.equal(created.section.workspaceIds[0], "workspace-fixture");
    assert.ok(view.state().sections?.filter((section) => section.id !== created.section.id).every((section) => !section.workspaceIds.includes("workspace-fixture")));
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, undefined, "M11 create-with-workspace must honor the reference unpin contract; #1033 remains a separate dependency");
    assert.equal(view.palette().open, true);
    row(view, "Created focus");
    assert.equal(view.dialogs().length, 0);
  } finally { await view.close(); }
});

test("M12 plain Home Create section and ordinary Cancel remain independent of section navigation", async () => {
  const view = await shellFixture({ ...empty, selection: { kind: "home" } });
  try {
    view.openPlainCreate();
    assert.equal(view.dialogs().length, 1);
    view.click("Cancel");
    assert.equal(view.dialogs().length, 0);
    assert.equal(view.palette().open, false);
    assert.equal(view.actions.length, 0);
    view.openPlainCreate();
    view.name("Plain section");
    view.click("Create");
    assert.equal(view.actions.length, 1);
    assert.equal(view.state().sections?.[0].workspaceIds.length, 0);
    assert.equal(view.palette().open, false);
  } finally { await view.close(); }
});

test("M12 base adapter action equality and archived/Open in context stay unchanged", () => {
  const base = adapter.paletteDataFromState(workspaceState, []);
  assert.deepEqual(adapter.PALETTE_ACTIONS.filter((entry) => base.actions.some((action) => action.id === entry.id)), base.actions);
  const target = workspaceState.repos[0].workspaces[0];
  const withPath: AppState = { ...workspaceState, repos: [{ ...workspaceState.repos[0], workspaces: [{ ...target, path: "/synthetic/not-an-open-target" }] }] };
  const app = { id: "synthetic-editor", name: "Synthetic editor" };
  assert.ok(adapter.workspacePaletteData(withPath, [], [], [], [app]).actions.some((entry) => entry.id === "open-in-synthetic-editor"));
  const archived: AppState = { ...withPath, repos: [{ ...withPath.repos[0], workspaces: [{ ...withPath.repos[0].workspaces[0], status: "archived" }] }] };
  const data = adapter.workspacePaletteData(archived, [], [], [], [app]);
  assert.equal(data.actions.some((entry) => entry.id === "open-in-synthetic-editor"), false);
  assert.ok(data.actions.some((entry) => entry.id === adapter.VIEW_ARCHIVED_ACTION));
});

test("M13 no-match query renders the empty state and suppresses all options", async () => {
  const view = await shellFixture(workspaceState);
  try {
    await move(view);
    searchSections(view, "zzz-no-match");
    assert.deepEqual(options(view).map(textOf), [], "M13 no options when query matches nothing");
    const empty = view.root().findAllByProps({ className: "palette-section-empty" });
    assert.equal(empty.length, 1, "M13 palette-section-empty must appear for a no-match query");
    assert.ok(textOf(empty[0]).includes("No matching"), "M13 empty state text must reference no-match");
    // Clearing the query restores the full list.
    searchSections(view, "");
    assert.ok(options(view).length > 0, "M13 clearing query restores options");
    assert.equal(view.root().findAllByProps({ className: "palette-section-empty" }).length, 0, "M13 empty state gone after clear");
  } finally { await view.close(); }
});
