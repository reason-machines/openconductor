import assert from "node:assert/strict";
import * as sectionShortcutOverrides from "../keybindings/overrides.ts";
import * as sectionShortcutMatcher from "../keybindings/shortcut.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { ComponentProps } from "react";
import type { Action, StoreStartup } from "../state/store";
import type { AppState } from "../state/types";
import * as navigationSections from "../state/navigationSections.ts";
import * as adapter from "./fromAppState.ts";
import * as search from "./search/model.ts";
import { GIT_PANEL_ACTIONS } from "./gitPanelActions.ts";
import * as persistence from "../lib/persistence/producer.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in Create section fixture"); };
const prefs = { default_open_in: null, sidebar_repo_filter: null, experimental_new_workspace_page: false };
const empty = { repos: [], selection: { kind: "root" }, sections: [], sidebarVisible: false } satisfies AppState;
const workspaceState = {
  ...empty,
  selection: { kind: "workspace", repoId: "repo-a", workspaceId: "workspace-a" },
  repos: [{ id: "repo-a", name: "Local project", path: "/synthetic/local", defaultBranch: "main", workspaces: [{ id: "workspace-a", name: "Local workspace", branch: "feature", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, pinnedAt: 10 }] }],
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
      if (name === "../lib/persistence/producer.ts") return persistence;
      assert.ok(name in imports, `Unexpected ${file} dependency: ${name}`);
      return imports[name];
    },
  });
}

function actualReducer() {
  const exports: Partial<typeof import("../state/store")> = {};
  const imports: Record<string, unknown> = {};
  for (const name of ["@tauri-apps/api/core", "./names", "./selectors", "../backend", "./repoOrder", "./persisted", "./sidebarPersist", "./sidebarOrder", "./nextUnread", "./chatUnread", "./addRepo", "../workspace/archive", "../scripts/api", "../scripts/model", "../workspace/setupWatch", "../settings/appPrefs"]) imports[name] = {};
  imports["./navigationSections"] = navigationSections;
  evaluate("../state/store.ts", imports, exports);
  assert.ok(exports.reducer);
  return exports.reducer;
}

test("local section action has the reference row contract without requiring a project or workspace", () => {
  for (const selection of [{ kind: "root" }, { kind: "home" }] satisfies AppState["selection"][]) {
    const data = adapter.workspacePaletteData({ ...empty, selection }, []);
    const section = data.actions.find((entry) => entry.id === "create-section");
    assert.ok(section);
    assert.equal(section.title, "Create section");
    assert.equal(section.group, "actions");
    assert.deepEqual(section.keywords, ["create", "new", "section", "sidebar"]);
    assert.equal(section.bindingId, undefined);
    const ids = data.actions.map((entry) => entry.id);
    assert.equal(ids.indexOf("create-section"), ids.indexOf("new-workspace") + 1);
    assert.equal(ids.indexOf("add-project"), ids.indexOf("create-section") + 1);
    for (const tab of ["all", "actions"] satisfies search.PaletteTab[]) {
      for (const query of ["create section", "new section", "sidebar"]) {
        assert.ok(search.buildResults(tab, query, data).some((group) => group.items.some((item) => item.kind === "action" && item.action.id === "create-section")));
      }
    }
  }
});

type PaletteProps = ComponentProps<typeof import("./CommandPalette").CommandPalette>;

function actualPalette() {
  const exports: Partial<typeof import("./CommandPalette")> = {};
  evaluate("./CommandPalette.tsx", {
    "../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut.ts": { glyphs: () => "" },
    "./search/model.ts": search,
    "./state.ts": { COMMAND_PALETTE_DIALOG_ID: "command-palette", paletteCommandFor: forbidden, moveActive: forbidden, tabSelectionIndex: forbidden },
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
  };
  evaluate("./PaletteHost.tsx", imports, exports);
  assert.ok(exports.PaletteHost);
  return exports.PaletteHost;
}

function hostFixture(available: boolean) {
  let palette: PaletteProps | undefined;
  let selected = 0;
  const Host = actualHost((props) => { palette = props; });
  const commands = {
    createSection: available ? () => { selected++; } : undefined,
    addProject: forbidden, toggleTheme: forbidden, toggleLeftSidebar: forbidden, toggleRightSidebar: forbidden,
    toggleZenMode: forbidden, sendFeedback: forbidden, submitPrompt: forbidden, showShortcuts: forbidden,
    openChangelog: forbidden, openSettings: forbidden, openDocs: forbidden, quickOpen: forbidden, copyUrl: forbidden,
  } satisfies ComponentProps<typeof Host>["commands"];
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(Host, { state: empty, collapsedSections: new Set<string>(), dispatch: forbidden, onOpenDialog: forbidden, onOpenProject: forbidden, open: true, onOpenChange: noop, commands })); });
  return {
    palette() { assert.ok(palette); return palette; },
    selected: () => selected,
    close() { act(() => renderer.unmount()); },
  };
}

test("actual PaletteHost selects the local section handler exactly once", () => {
  const view = hostFixture(true);
  try {
    const palette = view.palette();
    const action = palette.data.actions.find((entry) => entry.id === "create-section");
    assert.ok(action);
    act(() => palette.onSelect({ kind: "action", id: "action:create-section", action }));
    assert.equal(view.selected(), 1);
  } finally { view.close(); }
});

test("actual PaletteHost omits the row without the shell's local-section capability", () => {
  const view = hostFixture(false);
  try {
    assert.equal(view.palette().data.actions.some((entry) => entry.id === "create-section"), false);
  } finally { view.close(); }
});

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
    "./Dialogs": modal, "./sectionEmoji": emojis,
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": sectionShortcutOverrides,
    "../keybindings/shortcut": sectionShortcutMatcher,
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
    "./features/updates/useUpdates": { useUpdates: noop },
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
    palette: requirePalette,
    sidebar() { assert.ok(sidebar); return sidebar; },
    dialogs: () => renderer.root.findAllByProps({ role: "dialog" }).filter((node: { props: { "aria-label"?: string } }) => node.props["aria-label"] === "New section" || node.props["aria-label"] === "Edit section"),
    sidebarCount: () => renderer.root.findAllByType("sidebar-probe").length,
    open() {
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

for (const selection of [{ kind: "root" }, { kind: "home" }] satisfies AppState["selection"][]) {
  test(`mounted App opens one shared section dialog with hidden Sidebar at ${selection.kind}`, async () => {
    const view = await shellFixture({ ...empty, selection });
    try {
      assert.equal(view.sidebarCount(), 0);
      view.open();
      assert.equal(view.dialogs().length, 1);
      assert.equal(view.sidebarCount(), 0);
      assert.equal(view.actions.length, 0);
      view.name("  Local focus  ");
      view.click("Create");
      assert.equal(view.actions.length, 1);
      const action = view.actions[0];
      assert.equal(action.type, "createSection");
      if (action.type !== "createSection") throw new Error("Expected createSection");
      assert.equal(action.section.name, "Local focus");
      assert.equal(action.section.workspaceIds.length, 0);
      assert.equal(action.beforeSectionId, undefined);
      assert.equal(view.state().sections?.length, 1);
      assert.equal(view.state().sections?.[0].id, action.section.id);
      assert.equal(view.state().selection.kind, selection.kind);
      assert.equal(view.state().sidebarVisible, false);
      assert.equal(view.dialogs().length, 0);
    } finally { await view.close(); }
  });
}

test("mounted App creates in the local section store without moving the selected workspace", async () => {
  const view = await shellFixture(workspaceState);
  try {
    view.open();
    view.name("Independent group");
    view.click("Create");
    assert.equal(view.actions.length, 1);
    assert.equal(view.state().sections?.[0].workspaceIds.length, 0);
    assert.equal(view.state().selection.kind, "workspace");
    const selection = view.state().selection;
    if (selection.kind !== "workspace") throw new Error("Expected workspace selection");
    assert.equal(selection.workspaceId, "workspace-a");
    assert.equal(selection.repoId, "repo-a");
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, 10);
  } finally { await view.close(); }
});

test("mounted App Cancel and repeated opens do not write a section or duplicate the dialog", async () => {
  const view = await shellFixture();
  try {
    view.open();
    view.open();
    assert.equal(view.dialogs().length, 1);
    view.name("Do not save");
    view.click("Cancel");
    assert.equal(view.actions.length, 0);
    assert.equal(view.state().sections?.length, 0);
    assert.equal(view.dialogs().length, 0);
    view.open();
    view.name("Different section");
    view.click("Create");
    assert.equal(view.actions.length, 1);
    assert.equal(view.state().sections?.[0].name, "Different section");
  } finally { await view.close(); }
});

for (const startup of ["loading", "error"] satisfies StoreStartup[]) {
  test(`mounted App with ${startup} local store withholds creation until ready`, async () => {
    const view = await shellFixture(empty, startup);
    try {
      assert.equal(view.palette().commands.createSection, undefined);
      assert.equal(view.dialogs().length, 0);
      assert.equal(view.actions.length, 0);
      await view.startup("ready");
      view.open();
      assert.equal(view.dialogs().length, 1);
    } finally { await view.close(); }
  });
}

test("shared shell owner preserves Sidebar create-before, workspace move and edit contracts", async () => {
  const section = { id: "existing", name: "Existing", workspaceIds: ["workspace-a"] };
  const view = await shellFixture({ ...workspaceState, sidebarVisible: true, sections: [section] });
  try {
    act(() => view.sidebar().onOpenSectionDialog({ mode: "create", beforeSectionId: "existing", workspaceIdToMove: "workspace-a" }));
    view.name("Moved");
    view.click("Create");
    assert.equal(view.actions.length, 1);
    assert.equal(view.state().sections?.[0].name, "Moved");
    assert.equal(view.state().sections?.[0].workspaceIds[0], "workspace-a");
    assert.equal(view.state().sections?.[1].workspaceIds.length, 0);
    act(() => view.sidebar().onOpenSectionDialog({ mode: "edit", sectionId: "existing", name: "Existing" }));
    view.name("Renamed");
    view.click("Save");
    assert.equal(view.actions.length, 2);
    assert.equal(view.actions[1].type, "editSection");
    assert.equal(view.state().sections?.[1].name, "Renamed");
  } finally { await view.close(); }
});
