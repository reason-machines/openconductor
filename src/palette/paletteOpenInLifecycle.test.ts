import * as Pierre from "@pierre/diffs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps } from "react";
import type { AppState, Workspace } from "../state/types.ts";
import type { Action } from "../state/store.ts";
import type { WorkspaceOpenInTarget, OpenInTargetPublisher } from "./fromAppState.ts";
import { emptyTabs } from "../features/terminal/tabs.ts";
import { DEFAULT_PR_SETTINGS } from "../features/pr/prSettings.ts";
import type { FileDiff } from "../features/diff/types.ts";
import { supportsFileOpen } from "../features/openIn/apps.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = fileURLToPath(new URL("../../", import.meta.url));
const noop = () => {};
const unsubscribe = () => noop;
const forbidden = () => { throw new Error("Unexpected native/provider operation in palette lifecycle fixture"); };
const inert = () => null;
const child = ({ children }: { children?: unknown }) => children ?? null;
const owner = { repoId: "repo-a", workspaceId: "workspace-a", workspacePath: "/synthetic/workspace-a" };
const workspace: Workspace = { id: owner.workspaceId, name: "Synthetic workspace", branch: "main", status: "idle", path: owner.workspacePath, diff: { added: 0, removed: 0 }, createdAt: 1 };
const seed: AppState = { repos: [{ id: owner.repoId, name: "Synthetic project", path: "/synthetic/project", defaultBranch: "main", workspaces: [workspace] }], selection: { kind: "workspace", repoId: owner.repoId, workspaceId: owner.workspaceId }, sidebarVisible: false };
type PaletteProps = ComponentProps<typeof import("./CommandPalette").CommandPalette>;
type HostProps = ComponentProps<typeof import("./PaletteHost").PaletteHost>;
type ViewProps = ComponentProps<typeof import("../components/WorkspaceView").WorkspaceView>;
type TextNode = string | { children: readonly TextNode[] };
function visibleText(node: TextNode): string {
  return typeof node === "string" ? node : node.children.map(visibleText).join("");
}

async function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const emptyMap = new Map();
  const snapshot = { transcript: { messages: [], turns: {}, activeTurn: null }, queue: { status: "idle", items: [], editingId: null, paused: false, next: 1 }, permissions: [] };
  const agents = Object.fromEntries(["reason", "codex", "claude"].map((id) => [id, {
    id, label: id, canSteer: false, chatId: (chatId: string) => chatId,
    snapshot: () => snapshot, subscribe: unsubscribe, submit: forbidden, stop: forbidden, queueAction: forbidden,
  }]));
  const terminals = emptyTabs();
  const launches: unknown[][] = [];
  const records: unknown[][] = [];
  const errors: unknown[][] = [];
  const bindings: Record<string, () => unknown> = {};
  const prefs = { right_panel_visible: true, experimental_new_workspace_page: true, default_open_in: "vscode", sidebar_repo_filter: [] };
  let palette: PaletteProps | undefined;
  let host: HostProps | undefined;
  let publisher: OpenInTargetPublisher | undefined;
  let openFile: ((path: string) => boolean) | undefined;
  let replace: ((state: AppState) => void) | undefined;
  const diffFiles: FileDiff[] = [{ path: "src/selected.ts", old_path: null, status: "modified", binary: false, additions: 1, deletions: 0, hunks: [] }];
  const presentation = { filePathFilter: "", diffFileListMode: "flat", collapsedDirectoryPaths: [] };
  const requirePalette = () => { assert.ok(palette); return palette; };
  const modules = new Map<string, Record<string, unknown>>();
  const actualTsx = new Set(["src/App", "src/components/WorkspaceView", "src/palette/PaletteHost"]);
  const overrides: Record<string, Record<string, unknown>> = {
    "src/backend": { inTauri: () => false, appInfo: async () => null },
    "src/state/store": { loadReposFromDb: forbidden, useAppStore() {
      const [state, setState] = React.useState(seed);
      replace = setState;
      const dispatch = React.useCallback((action: Action) => {
        assert.equal(action.type, "select", "this fixture permits navigation only, never storage or workspace mutation");
        if (action.type === "select") setState((current: AppState) => ({ ...current, selection: action.selection }));
      }, []);
      return [state, dispatch, "ready"];
    } },
    "src/state/selectors": { isSidebarVisible: () => false, removedWorkspaceIds: () => [] },
    "src/state/useCustomSectionCollapse": { useCustomSectionCollapse: () => [new Set(), noop] },
    "src/state/useNavHistory": { useNavHistory: () => ({ canBack: false, canForward: false, onBack: noop, onForward: noop }) },
    "src/state/useAutoUnread": { useAutoUnread: noop, useWindowFocused: () => false },
    "src/components/panelPrefs": { toggleRightPanel: noop, useSidebarVisiblePref: noop, useSidebarWidth: () => ({ style: {}, resizer: null }) },
    "src/components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: (...args: unknown[]) => errors.push(args), dismiss: noop }) },
    "src/components/WorkspaceView": { WorkspaceView: (props: ViewProps) => {
      publisher = props.onOpenInTarget;
      const Actual = load(resolve(root, "src/components/WorkspaceView.tsx"), true).WorkspaceView;
      return React.createElement(Actual, props);
    } },
    "src/palette/PaletteHost": { PaletteHost: (props: HostProps) => {
      host = props;
      const Actual = load(resolve(root, "src/palette/PaletteHost.tsx"), true).PaletteHost;
      return React.createElement(Actual, props);
    } },
    "src/palette/CommandPalette": { CommandPalette: (props: PaletteProps) => { palette = props; return null; } },
    "src/settings/api": { getSettings: async () => ({}), errorText: String },
    "src/settings/appPrefs": { useAppPrefs: () => prefs, recordOpenIn: async (...args: unknown[]) => { records.push(args); } },
    "src/settings/useBoolPref": { useBoolPref: () => false, useBoolPrefState: () => false },
    "src/settings/routes": { resolveSettingsUrl: () => null, keptSearch: () => "", settingsSearch: () => "" },
    "src/settings/pages": { USER_PAGES: [], settingsGroups: () => [] },
    "src/settings/SettingsView": { SettingsView: inert, AGENT_SEARCH_TABS: [], scrollToRow: forbidden, searchIcon: inert },
    "src/settings/searchIndex": { buildSearchIndex: () => [] },
    "src/settings/useSettings": { rememberSettings: (value: unknown) => value },
    "src/settings/appearance": { applyAppearance: noop },
    "src/features/updates/useUpdates": { useUpdates: noop },
    "src/keybindings/KeybindingsProvider": {
      KeybindingScope: inert,
      useKeybindingOverrides: () => ({ overrides: {} }),
      useKeybindings: (handlers: Record<string, () => unknown>) => { Object.assign(bindings, handlers); },
    },
    "src/keybindings/overrides": { effectiveShortcuts: () => [] },
    "src/keybindings/shortcut": { glyphs: () => "" },
    "src/components/ui/Tooltip": { Tooltip: child, ShortcutHint: inert },
    "src/components/Tooltip": { titleWithShortcut: () => "Toggle left sidebar" },
    "src/features/chat/chatRuntime": { chatStatuses: () => emptyMap, subscribeChatStatuses: unsubscribe },
    "src/features/chat/reasonChat": { reasonAvailable: () => false },
    "src/features/terminal/session": { subscribeTabs: unsubscribe, getTabs: () => terminals, onCenterTabOpened: unsubscribe, onAttachFailure: unsubscribe, destroyWorkspaceTerminals: forbidden },
    "src/features/browser/store": { subscribeBrowser: unsubscribe, browserSnapshot: () => ({ pages: emptyMap }) },
    "src/features/diff/api": { loadWorkspaceDiff: async () => diffFiles, discardFileChanges: forbidden, WHOLE_FILE_CONTEXT: 1000000 },
    "src/features/diff/useChangesPresentation": { useChangesPresentation: () => ({ presentation, ready: true, update: noop }) },
    "src/features/diff/ReviewComments": { useReviewComments: () => ({ hasPending: false }) },
    "src/features/diff/ReviewButton": { ReviewButton: inert, useReviewChats: () => ({ tabs: [], newChat: forbidden, fork: forbidden }) },
    "src/features/diff/chatAttachment": { useWorkspaceChatAttach: () => ({ attach: forbidden, queued: [] }) },
    "src/features/files/AllFilesTree": { useFilesToolbar: () => ({}), FilesToolbarButtons: inert, AllFilesTree: (props: { onOpenFile?: (path: string) => boolean }) => { openFile = props.onOpenFile; return null; } },
    "src/features/openIn/OpenInButton": { OpenInButton: inert, AppIcon: inert, useInstalledApps: () => [{ id: "vscode", name: "VS Code", iconType: "code", icon: null }] },
    "src/features/openIn/apps": { supportsFileOpen, openInApp: async (...args: unknown[]) => { launches.push(structuredClone(args)); }, copyText: forbidden },
    "src/workspace/useSetupWatch": { useCreateSetupRunning: () => false, useSetupWatch: noop },
    "src/workspace/useWorkspaceDeepLinks": { useWorkspaceDeepLinks: noop },
    "src/workspace/useInitIssues": { useInitIssues: noop },
    "src/workspace/archive": { onArchiveEvent: unsubscribe, listArchivedWorkspaces: async () => [] },
    "src/features/pr/useArchiveOnMerge": { useArchiveOnMerge: () => noop, useArchiveOnMergeWatcher: noop },
    "src/features/pr/workspaceSync": { useWorkspacePrSync: () => noop },
    "src/features/pr/usePullRequest": { usePullRequest: () => ({ lookup: null, pr: null, git: null, header: null, settings: DEFAULT_PR_SETTINGS, error: null, refresh: noop }) },
    "src/features/pr/useTargetBranch": { useTargetBranch: () => ({ branch: "main", disabledReason: null, changing: false }) },
    "src/features/pr/usePrActions": { usePrActions: () => ({ busy: null }) },
    "src/features/pr/checks/useFixErrors": { useFixErrors: () => ({}) },
    "src/features/pr/usePullLatest": { usePullLatest: () => ({ shortcut: noop }) },
    "src/lib/local-storage": { composerDrafts: () => ({ load: async () => "", save: async () => {}, clear: async () => {} }) },
    "src/org/organization": { ORGANIZATION_EVENT: "unused-organization", storedOrganization: () => null },
    "src/home/repoFilter": { createRepoDefault: () => owner.repoId },
    "src/home/useRepoFilter": { storedRepoFilter: () => [] },
  };
  const window = Object.assign(new EventTarget(), { location: { pathname: "/", search: "?palette=1" }, history: { state: null, replaceState: noop } });
  function load(filename: string, bypass = false): Record<string, unknown> {
    const key = filename.slice(root.length).replace(/\.(tsx?|css)$/, "");
    if (key === "src/features/chat/agents") return { ...load(resolve(root, "src/features/chat/agentChoice.ts")), CHAT_AGENTS: agents };
    if (!bypass && overrides[key]) return overrides[key];
    if (filename.endsWith(".css")) return {};
    if (filename.endsWith(".tsx") && !actualTsx.has(key)) return new Proxy({}, { get: () => child });
    const cached = modules.get(filename);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(filename, exports);
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(javascript, { exports, console, window, localStorage: storage, navigator: { clipboard: { writeText: forbidden } }, setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder, require(name: string) {
      if (["react", "react/jsx-runtime", "fuzzysort"].includes(name)) return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@tauri-apps/api/core") return { invoke: forbidden, isTauri: () => false };
      if (name === "@tauri-apps/api/event") return { listen: forbidden };
      assert.ok(name.startsWith("."), `Unexpected external module ${name}`);
      const base = resolve(dirname(filename), name);
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
      assert.ok(path, `Missing lifecycle fixture module ${name} from ${filename}`);
      return load(path);
    } });
    return exports;
  }
  const App = load(resolve(root, "src/App.tsx")).default;
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(React.StrictMode, null, React.createElement(App))); });
  return {
    launches, records, errors,
    async launch() {
      const action = requirePalette().data.actions.find((entry) => entry.id === "open-in-vscode");
      assert.ok(action, "the actual App/PaletteHost must offer the live workspace app");
      await act(async () => requirePalette().onSelect({ kind: "action", id: `action:${action.id}`, action }));
      return launches.at(-1);
    },
    async diff() { assert.ok(bindings["diff.open"]); await act(async () => bindings["diff.open"]()); },
    async tab(label: string) {
      const tab = renderer.root.findAllByProps({ role: "tab" }).find((node: { children: readonly TextNode[] }) => visibleText(node) === label);
      assert.ok(tab, `Missing actual tab ${label}`);
      await act(async () => tab.props.onClick());
    },
    async markdown(path: string) { await this.tab("All files"); assert.ok(openFile); await act(async () => assert.equal(openFile?.(path), true)); },
    async state(next: AppState) { assert.ok(replace); await act(async () => replace?.(next)); },
    publisher() { assert.ok(publisher); return publisher; },
    async publish(target: WorkspaceOpenInTarget) { const publish = this.publisher(); let dispose = noop; await act(async () => { dispose = publish(target); }); return async () => { await act(async () => dispose()); }; },
    async createPage() { assert.ok(host); await act(async () => host?.onOpenDialog("create")); },
    rows: () => Array.from(requirePalette().data.actions.filter((entry) => entry.group === "open-in")),
    target: () => host?.activeOpenInTarget,
    async close() { await act(async () => renderer.unmount()); assert.deepEqual(errors, []); },
  };
}

test("actual App and WorkspaceView publish only the visible diff or Markdown file", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.launch(), ["vscode", owner.workspacePath]);
    await view.diff();
    assert.deepEqual(await view.launch(), ["vscode", `${owner.workspacePath}/src/selected.ts`, { workspacePath: owner.workspacePath }]);
    await view.tab(workspace.name);
    assert.deepEqual(await view.launch(), ["vscode", owner.workspacePath]);
    await view.markdown("docs/selected.md");
    assert.deepEqual(await view.launch(), ["vscode", `${owner.workspacePath}/docs/selected.md`, { workspacePath: owner.workspacePath }]);
    await view.tab(workspace.name);
    assert.deepEqual(await view.launch(), ["vscode", owner.workspacePath]);
    assert.equal(view.records.length, view.launches.length);
  } finally { await view.close(); }
});

test("actual producer remount and owner transitions cannot leak the previous file", async () => {
  const view = await fixture();
  try {
    await view.diff();
    await view.launch();
    const next: AppState = { ...seed, repos: [{ ...seed.repos[0], id: "repo-b", workspaces: [{ ...workspace, id: "workspace-b", path: "/synthetic/workspace-b" }] }], selection: { kind: "workspace", repoId: "repo-b", workspaceId: "workspace-b" } };
    await view.state(next);
    assert.deepEqual(await view.launch(), ["vscode", "/synthetic/workspace-b"]);
    await view.state({ ...next, selection: { kind: "root" } });
    assert.deepEqual(view.rows(), []);
    assert.equal(view.target(), null);
    await view.state(seed);
    assert.deepEqual(await view.launch(), ["vscode", owner.workspacePath]);
    await view.diff();
    await view.createPage();
    assert.deepEqual(view.rows(), []);
    assert.equal(view.target(), null);
  } finally { await view.close(); }
});

test("actual App keeps the newest registration when an obsolete owner cleans up", async () => {
  const view = await fixture();
  try {
    const oldTarget: WorkspaceOpenInTarget = { ...owner, kind: "file", relativePath: "src/old.ts" };
    const newTarget: WorkspaceOpenInTarget = { ...owner, kind: "file", relativePath: "src/new.ts" };
    const oldCleanup = await view.publish(oldTarget);
    const newCleanup = await view.publish(newTarget);
    await oldCleanup();
    assert.deepEqual(await view.launch(), ["vscode", `${owner.workspacePath}/src/new.ts`, { workspacePath: owner.workspacePath }]);
    await newCleanup();
    assert.deepEqual(await view.launch(), ["vscode", owner.workspacePath]);
  } finally { await view.close(); }
});
