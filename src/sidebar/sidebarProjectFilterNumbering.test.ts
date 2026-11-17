import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { Action } from "../state/store.ts";
import { filterRepoGroups } from "../home/repoFilter.ts";
import { shortcutOrder } from "../palette/fromAppState.ts";
import { visibleRepos } from "../state/repoOrder.ts";
import { sidebarEntries } from "../state/sidebarOrder.ts";
import { hintNumbers } from "../state/shortcutHint.ts";
import type { AppState, Workspace } from "../state/types.ts";

// Qualification-only frozen RED, not an implementation or a production lease.
// Oracle: held Conductor 0.87.6 REA source, renderer SHA-256 5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde.
// Reference packet SHA-256: 5e704cf8e4df1f325992613f051bf7f21de164057eb38cb9846e2b324a52c627.
// Scope: local, Project grouping, two loaded/expanded repositories, one ordinary
// active workspace each, no sections/pins/shared rows, Beta selected by the normal
// project filter. This does not assert general contiguity or multi-row sort order.
const workspace = (id: string, createdAt: number): Workspace => ({
  id, name: id, branch: id, status: "idle", createdAt, updatedAt: createdAt,
  diff: { added: 0, removed: 0 },
});

const state: AppState = {
  selection: { kind: "home" },
  sidebarGroupBy: "repo",
  sidebarRepoFilter: "beta",
  sections: [],
  repos: [
    { id: "alpha", name: "Alpha", path: "/invented/alpha", defaultBranch: "main", collapsed: false, hidden: false, workspaces: [workspace("alpha-row", 10)] },
    { id: "beta", name: "Beta", path: "/invented/beta", defaultBranch: "main", collapsed: false, hidden: false, workspaces: [workspace("beta-row", 20)] },
  ],
};

const numberedRows = () => sidebarEntries(state, { visibleOnly: true });
const targets = () => shortcutOrder(state, new Set());

test("control: normal Project filter renders only Beta's repository group", () => {
  const listed = filterRepoGroups(visibleRepos(state.repos, false), state.sidebarRepoFilter ?? undefined);
  assert.deepEqual(listed.map((repo) => repo.id), ["beta"]);
});

test("filtered-out ordinary project rows consume no numbered position", () => {
  assert.deepEqual(numberedRows().map(({ workspace }) => workspace.id), ["beta-row"]);
});

test("the selected project's sole ordinary workspace has hint number one", () => {
  const numbers = hintNumbers(numberedRows().map(({ workspace }) => workspace.id));
  assert.equal(numbers.get("beta-row"), 1);
});

test("workspace.switchTo1 targets the selected project's sole workspace", () => {
  assert.equal(targets()[0]?.workspace.id, "beta-row");
});

test("workspace.switchTo2 has no target when the filtered sequence has one row", () => {
  assert.equal(targets()[1]?.workspace.id, undefined);
});

test("control: filtering leaves both loaded repositories and their rows intact", () => {
  numberedRows();
  targets();
  assert.deepEqual(state.repos.map(({ id, workspaces }) => ({ id, rows: workspaces.map(({ id }) => id) })), [
    { id: "alpha", rows: ["alpha-row"] },
    { id: "beta", rows: ["beta-row"] },
  ]);
});

// Consumer replay: actual project radio click -> useRepoFilter -> appPrefs ->
// useAppStore -> Sidebar/useWorkspaceRows/SidebarWorkspaceRow and PaletteHost.
// Effects/decorations and unrelated features are mocked. The app is not launched:
// React's in-memory renderer, a browser-fallback storage adapter, and the real
// pure bindCommands/dispatcher are used. useKeybindings' React glue is adapted;
// this does not test native preference I/O or OS/window keyboard delivery.
const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("External operation forbidden in project-filter qualification"); };
const textOf = (node: any): string => typeof node === "string" || typeof node === "number"
  ? String(node) : (Array.isArray(node) ? node : node?.children ?? []).map(textOf).join("");

async function mountedFixture() {
  const initial: AppState = { ...state, sidebarRepoFilter: undefined };
  const storage = new Map([["openconductor.shell.v1", JSON.stringify(initial)]]);
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const listeners = new Map<string, Set<(event: any) => void>>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const window = {
    location: { search: "", pathname: "/all-workspaces" },
    addEventListener(type: string, listener: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: (event: any) => void) => listeners.get(type)?.delete(listener),
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
  };
  const document = { body: {}, addEventListener: noop, removeEventListener: noop };
  const pass = ({ children }: any) => children ?? null;
  const icons = new Proxy({}, { get: () => inert });
  const wrappers = { SidebarPresence: pass, SidebarRowMotion: pass, SidebarSectionMotion: pass,
    endingProps: () => ({}), useMenuPresence: (open: boolean) => ({ mounted: open, ending: false }) };
  const actions: Action[] = [];
  const compiled = new Map<string, any>();
  const externalCalls: string[] = [];
  const acknowledgment = { succeed: noop, fail: forbidden };
  const persistence = { begin: () => acknowledgment, run: forbidden };
  const mocks: Record<string, any> = {
    "backend": { inTauri: () => false },
    "lib/persistence/producer": { usePersistenceProducer: () => persistence },
    "lib/persistence/restartPersistence": { persistenceOwner: () => ({ run: forbidden }) },
    "state/names": { newId: forbidden, workspaceName: forbidden },
    "state/nextUnread": { withActivity: forbidden, openNextUnread: forbidden, nextUnreadChat: () => null },
    "state/chatUnread": { isWorkspaceUnread: () => false, withWorkspaceRead: (ws: Workspace) => ws, attentionChat: forbidden },
    "state/openChat": { restoreChatTabs: noop, workspaceChats: () => [], requestChat: forbidden },
    "state/addRepo": { sameRepoRecord: forbidden },
    "workspace/archive": { listArchivedWorkspaces: forbidden },
    "scripts/api": { runStatus: async () => ({ runs: [] }), onScriptEvent: async () => noop },
    "scripts/model": { activeRun: () => null },
    "workspace/setupWatch": {},
    "features/chat/chatRuntime": { chatStatuses: () => [] },
    "features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => null },
    "features/pr/sidebarPrPoller": { useRowPrPoll: noop, applyRowLookup: forbidden },
    "features/pr/usePullRequest": { usePrSettings: () => ({ optionalChecksBlock: false }) },
    "components/useRowDiffStat": { useRowDiffStat: (ws: Workspace) => ({ ref: null, stat: ws.diff, onScreen: false }) },
    "components/useBranchPrefix": { useBranchPrefix: () => "" },
    "components/WorkspaceContextMenu": { WorkspaceContextMenu: inert },
    "settings/useStatusMatrix": { useStatusMatrix: () => false },
    "components/RepoIcon": { RepoIcon: inert }, "components/RowStatusIcon": { RowStatusIcon: inert },
    "components/StatusMatrix": { StatusMatrix: inert }, "components/Icons": icons, "components/menu/menuIcons": icons,
    "components/Tooltip": { Tooltip: pass, titleWithShortcut: (label: string) => label },
    "components/ui/Tooltip": { Tooltip: pass }, "components/menu/ContextMenu": { ContextMenu: pass, MenuItem: pass, MenuSeparator: inert },
    "components/sidebarMotion": wrappers,
    "components/SidebarSections": { SidebarGroup: pass }, "components/SidebarStatusGroups": { SidebarStatusGroups: inert },
    "components/useSidebarDrag": { useSidebarDrag: () => ({ dragging: null, overlay: null, workspacePointerDown: forbidden }) },
    "state/useCustomSectionCollapse": { useBuiltinSectionCollapse: () => [new Set(), forbidden] },
    "components/PendingWorkspaceRow": { RepoWorkspaceList: ({ collapsed, children }: any) => collapsed ? null : children },
    "components/SidebarActionsMenu": { SidebarActionsMenu: inert },
    "components/HelpMenu": { HelpMenu: inert }, "components/RenameWorkspaceDialog": { RenameWorkspaceDialog: inert },
    "components/AccountMenu": { AccountMenu: inert }, "components/AppMark": { AppMark: inert },
    "components/ResourceUsagePill": { ResourceUsagePill: inert }, "onboarding/ReasonCliStatus": { ReasonCliStatus: inert },
    "components/AddRepositoryMenu": { SidebarAddRepositoryMenu: inert },
    "home/useDashboardEnabled": { useDashboardEnabled: () => ({ enabled: false }) },
    "features/routines/useRoutinesAvailable": { useRoutinesAvailable: () => false },
    "palette/CommandPalette": { CommandPalette: inert }, "palette/MoveToSection": { MoveToSection: inert, sectionItems: forbidden },
    "settings/searchIndex": { buildSearchIndex: () => [] }, "settings/pages": { settingsGroups: () => [] },
    "settings/SettingsView": { AGENT_SEARCH_TABS: [], scrollToRow: forbidden, searchIcon: inert },
    "features/chat/ChatModelPicker": { openAgentSettings: forbidden, openRepoSettingsPage: forbidden, openSettingsPage: forbidden },
    "settings/useBoolPref": { useBoolPref: () => false }, "settings/useSettings": { useSettings: () => ({}) },
    "palette/recentWorkspaces": { loadRecentWorkspaceIds: () => [], saveRecentWorkspaceIds: noop, recordViewedWorkspace: (ids: string[]) => ids },
    "palette/settingsRepository": { loadLastWorkspaceRoute: () => null, selectedWorkspaceRoute: () => null, saveLastWorkspaceRoute: noop },
    "palette/projectWorkspace": { preferredProjectWorkspace: forbidden },
    "features/openIn/OpenInButton": { AppIcon: inert, useInstalledApps: () => [] },
    "features/openIn/apps": { openInApp: forbidden },
    "components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: forbidden, dismiss: noop }) },
    "components/ConductorIcon": { ConductorIcon: inert },
    "palette/gitPanelActions": { GIT_PANEL_ACTIONS: [], gitPanelWorkspace: () => undefined, requestGitPanelAction: forbidden },
  };
  const externals: Record<string, any> = {
    "@tauri-apps/api/core": { isTauri: () => false, invoke: (...args: any[]) => { externalCalls.push(args[0]); return forbidden(); } },
    "@hello-pangea/dnd": {
      DragDropContext: pass,
      Droppable: ({ children }: any) => children({ innerRef: noop, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
      Draggable: ({ children }: any) => children({ innerRef: noop, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
    },
    "react-dom": { createPortal: (child: any) => child },
  };
  function load(file: string): any {
    const id = file.replace(/\.(?:tsx?|css)$/, "");
    if (id in mocks) return mocks[id];
    if (compiled.has(id)) return compiled.get(id);
    const sourceFile = resolve(sourceRoot, `${id}.${["components/Sidebar", "components/SidebarWorkspaceRow", "components/home/ProjectFilterSubmenu", "palette/PaletteHost"].includes(id) ? "tsx" : "ts"}`);
    const source = readFileSync(sourceFile, "utf8");
    const exports: Record<string, any> = {};
    compiled.set(id, exports);
    const output = ts.transpileModule(source, { fileName: sourceFile,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    runInNewContext(output.outputText, {
      exports, console, Date, URLSearchParams, window, document, localStorage,
      setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name in externals) return externals[name];
        if (name.endsWith(".css")) return {};
        assert.ok(name.startsWith("."), `Unexpected external import ${name} from ${id}`);
        // Resolve source-relative imports without touching any installed app/module.
        const absolute = resolve(sourceRoot, dirname(id), name);
        assert.ok(absolute.startsWith(`${sourceRoot}/`), `Source import escaped snapshot: ${name}`);
        const relative = absolute.slice(sourceRoot.length + 1);
        return load(relative);
      },
    });
    return exports;
  }
  const dispatcher = load("keybindings/dispatcher").createDispatcher();
  const { bindCommands } = load("keybindings/bind");
  mocks["keybindings/KeybindingsProvider"] = {
    useKeybindingOverrides: () => ({ overrides: {} }),
    useKeybindings(handlers: Record<string, () => unknown>) {
      React.useEffect(() => bindCommands(dispatcher, handlers), [handlers]);
    },
  };
  const { useAppStore } = load("state/store");
  const { Sidebar } = load("components/Sidebar");
  const { PaletteHost } = load("palette/PaletteHost");
  const prefs = load("settings/appPrefs");
  let live: AppState;
  const commands = Object.fromEntries(["addProject", "toggleTheme", "toggleLeftSidebar", "toggleRightSidebar", "toggleZenMode", "sendFeedback", "submitPrompt", "showShortcuts", "openChangelog", "openSettings", "openDocs", "quickOpen", "copyUrl"].map((id) => [id, forbidden]));
  function Harness() {
    const [viewState, dispatch] = useAppStore();
    live = viewState;
    const checkedDispatch = (action: Action) => { actions.push(plain(action)); dispatch(action); };
    return React.createElement(React.Fragment, null,
      React.createElement(Sidebar, { state: viewState, collapsedSections: new Set(), dispatch: checkedDispatch,
        onToggleSection: forbidden, onOpenDialog: forbidden, onOpenSectionDialog: forbidden, onOpenProject: forbidden,
        onOpenSettings: forbidden, onOpenShortcuts: forbidden, onSendFeedback: forbidden, onSubmitPrompt: forbidden,
        onOpenDiagnostics: forbidden, onSearch: forbidden, info: null,
        nav: { canBack: false, canForward: false, onBack: forbidden, onForward: forbidden } }),
      React.createElement(PaletteHost, { state: viewState, collapsedSections: new Set(), dispatch: checkedDispatch,
        onOpenDialog: forbidden, onOpenProject: forbidden, open: false, onOpenChange: forbidden, commands }));
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness), { createNodeMock: () => ({
    getBoundingClientRect: () => ({ right: 100, top: 100 }), addEventListener: noop, removeEventListener: noop,
  }) }); });
  const rows = () => renderer.root.findAllByProps({ "data-testid": "left-sidebar-workspace-item" });
  const hints = () => rows().map((row: any) => ({
    row: textOf(row.findByProps({ className: "sb-ws-name" })),
    hints: row.findAllByProps({ className: "sb-ws-hint" }).map((hint: any) => ({ label: hint.props["aria-label"], text: textOf(hint), state: hint.props["data-state"] })),
  }));
  return {
    actions, externalCalls, compiled, prefs, hints,
    state: () => live!,
    async choose(label: string) {
      await act(async () => renderer.root.findByProps({ "aria-label": "My workspaces actions" }).props.onClick({ stopPropagation: noop }));
      const trigger = renderer.root.findAllByProps({ role: "menuitem" }).find((node: any) => textOf(node) === "Filter by project");
      assert.ok(trigger, "actual sidebar menu must expose the project filter");
      await act(async () => trigger.props.onClick());
      const option = renderer.root.findAllByProps({ role: "menuitemradio" }).find((node: any) => textOf(node) === label);
      assert.ok(option, `actual filter radio must expose ${label}`);
      await act(async () => option.props.onClick());
    },
    async holdHints() {
      await act(async () => {
        for (const listener of [...(listeners.get("keydown") ?? [])]) listener({ key: "Meta", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false });
        const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback());
      });
    },
    async key(number: number) {
      let outcome: any;
      await act(async () => { outcome = dispatcher.dispatch({ key: String(number), code: `Digit${number}`, metaKey: true,
        ctrlKey: false, altKey: false, shiftKey: false, repeat: false }, { typing: false, inTerminal: false, activeDialogId: null }); });
      assert.equal(outcome.kind, "ran");
      assert.equal(outcome.commandId, `workspace.switchTo${number}`);
      return actions.at(-1);
    },
    async close() { await act(async () => renderer.unmount()); },
  };
}

const expectedHint = (row: string, number: number) => ({ row, hints: [{ label: `Switch with Command-${number}`, text: String(number), state: "visible" }] });

test("mounted control: ordinary unfiltered producer renders hints 1/2 and dispatches both targets", async () => {
  const view = await mountedFixture();
  try {
    await view.holdHints();
    assert.deepEqual(view.hints(), [expectedHint("Alpha row", 1), expectedHint("Beta row", 2)]);
    for (const [number, repoId] of [[1, "alpha"], [2, "beta"]] as const) {
      assert.deepEqual(await view.key(number), { type: "select", selection: { kind: "workspace", repoId, workspaceId: `${repoId}-row` } });
    }
    assert.deepEqual(view.externalCalls, []);
  } finally { await view.close(); }
});

test("mounted control: normal Beta radio propagates through app prefs and useAppStore without deleting loaded rows", async () => {
  const view = await mountedFixture();
  try {
    await view.choose("Beta");
    assert.equal(view.prefs.getAppPrefs().sidebar_repo_filter, "beta");
    assert.equal(view.state().sidebarRepoFilter, "beta");
    assert.deepEqual(view.hints().map(({ row }: any) => row), ["Beta row"]);
    assert.deepEqual(plain(view.state().repos), state.repos);
    for (const id of ["components/home/ProjectFilterSubmenu", "home/useRepoFilter", "settings/appPrefs", "state/store", "components/Sidebar", "components/SidebarWorkspaceRow", "palette/PaletteHost", "state/sidebarOrder", "palette/fromAppState"]) {
      assert.ok(view.compiled.has(id), `actual ${id} must be evaluated`);
    }
    assert.deepEqual(view.externalCalls, []);
  } finally { await view.close(); }
});

test("mounted Beta filter: the rendered, visible hint says Switch with Command-1", async () => {
  const view = await mountedFixture();
  try {
    await view.choose("Beta"); await view.holdHints();
    assert.deepEqual(view.hints(), [expectedHint("Beta row", 1)]);
  } finally { await view.close(); }
});

test("mounted Beta filter: actual numbered shortcut dispatch selects Beta on Command-1", async () => {
  const view = await mountedFixture();
  try {
    await view.choose("Beta");
    assert.deepEqual(await view.key(1), { type: "select", selection: { kind: "workspace", repoId: "beta", workspaceId: "beta-row" } });
  } finally { await view.close(); }
});

test("mounted Beta filter: actual Command-2 dispatch has no selection target", async () => {
  const view = await mountedFixture();
  try {
    await view.choose("Beta"); await view.key(2);
    assert.deepEqual(view.actions, []);
    assert.deepEqual(plain(view.state().selection), { kind: "home" });
  } finally { await view.close(); }
});

test("mounted control: clearing normal filter restores both labels and targets unchanged", async () => {
  const view = await mountedFixture();
  try {
    await view.choose("Beta"); await view.choose("All projects"); await view.holdHints();
    assert.equal(view.state().sidebarRepoFilter, null);
    assert.deepEqual(view.hints(), [expectedHint("Alpha row", 1), expectedHint("Beta row", 2)]);
    assert.deepEqual(await view.key(1), { type: "select", selection: { kind: "workspace", repoId: "alpha", workspaceId: "alpha-row" } });
    assert.deepEqual(await view.key(2), { type: "select", selection: { kind: "workspace", repoId: "beta", workspaceId: "beta-row" } });
    assert.deepEqual(plain(view.state().repos), state.repos);
    assert.deepEqual(view.externalCalls, []);
  } finally { await view.close(); }
});
