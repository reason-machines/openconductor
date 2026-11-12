import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { AppState, Repo, Workspace } from "../state/types.ts";
import * as order from "../state/sidebarOrder.ts";
import * as navigation from "../state/navigationSections.ts";
import * as repoOrder from "../state/repoOrder.ts";
import * as repoFilter from "../home/repoFilter.ts";
import * as collapse from "../state/customSectionCollapse.ts";
import { ROUTE_USER_STATE } from "../lib/local-storage/subsystems.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../keybindings/overrides.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const contractBytes = readFileSync(new URL("../../evidence/sidebar/empty-guidance/expected-cases.json", import.meta.url));
assert.equal(createHash("sha256").update(contractBytes).digest("hex"), "a1942f64fa21dff44be7e9f0ac4814a442a80423c9f977cb9970544918356115");
const contract: unknown = JSON.parse(contractBytes.toString("utf8"));
assert.ok(contract && typeof contract === "object" && "cases" in contract && Array.isArray(contract.cases));
const cases = contract.cases.map((entry: unknown) => {
  assert.ok(entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string");
  assert.ok("groupBy" in entry && (entry.groupBy === "repo" || entry.groupBy === "status"));
  assert.ok("mainCollapsed" in entry && typeof entry.mainCollapsed === "boolean");
  assert.ok("referenceMessage" in entry && typeof entry.referenceMessage === "boolean");
  assert.ok("repos" in entry && Array.isArray(entry.repos));
  const filter = "filter" in entry ? entry.filter : undefined;
  assert.ok(filter === undefined || typeof filter === "string");
  const repos = entry.repos.map((repo: unknown): Repo => {
    assert.ok(repo && typeof repo === "object" && "id" in repo && typeof repo.id === "string");
    assert.ok("hidden" in repo && typeof repo.hidden === "boolean");
    assert.ok("workspaces" in repo && Array.isArray(repo.workspaces) && repo.workspaces.length === 0);
    return { id: repo.id, name: repo.id, path: filter ? "" : `/${repo.id}`, defaultBranch: "main", hidden: repo.hidden, workspaces: [] };
  });
  return { id: entry.id, groupBy: entry.groupBy, collapsed: entry.mainCollapsed, message: entry.referenceMessage, repos, filter };
});
assert.deepEqual(cases.map(({ id }) => id), [
  "empty-repo-expanded", "empty-repo-collapsed", "empty-status-expanded", "empty-status-collapsed",
  "one-linked-empty-repo-expanded", "one-linked-empty-repo-collapsed", "hidden-only-repo", "nonmatching-filter-nonempty-repos",
]);

const noop = () => {};
const empty = () => null;
const passthrough = ({ children }: { children?: React.ReactNode }) => children;
const iconNames = ["ArrowLeftIcon", "ArrowRightIcon", "ChevronDownIcon", "ChevronIcon", "FolderPlusIcon", "HomeIcon", "LayoutGridIcon", "MoreIcon", "PlayIcon", "PlusIcon", "SearchIcon", "SettingsIcon", "SidebarIcon"];
const menuIconNames = ["EyeIcon", "EyeOffIcon", "Link2Icon", "PencilIcon", "PlusIcon", "SettingsIcon", "Trash2Icon"];
let saved = new Map<string, string>();
let projectFilter: string | undefined;
const storage = {
  async getItem(key: string) { return saved.get(key) ?? null; },
  async setItem(key: string, value: string) { saved.set(key, value); },
};

function compile(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, {
    exports: {}, console,
    require(name: string) {
      assert.ok(Object.prototype.hasOwnProperty.call(imports, name), `unexpected mounted sidebar dependency: ${name}`);
      return imports[name];
    },
    ...globals,
  });
}

const reactImports = { react: React, "react/jsx-runtime": dependencies("react/jsx-runtime") };
const collapseHook: typeof import("../state/useCustomSectionCollapse") = compile("../state/useCustomSectionCollapse.ts", {
  ...reactImports,
  "../features/terminal/localStorage": { subsystemStorage: (name: string, sizeLimit: number) => {
    assert.equal(name, ROUTE_USER_STATE.name);
    assert.equal(sizeLimit, ROUTE_USER_STATE.sizeLimit);
    return storage;
  } },
  "../lib/local-storage/subsystems": { ROUTE_USER_STATE },
  "./customSectionCollapse": collapse,
});
const filterHook: typeof import("../home/useRepoFilter") = compile("../home/useRepoFilter.ts", {
  ...reactImports,
  "@tauri-apps/api/core": { isTauri: () => false },
  "../settings/appPrefs": {
    useAppPrefs: () => ({ sidebar_repo_filter: projectFilter }),
    setAppPref: async ({ value }: { value: string | null }) => { projectFilter = value ?? undefined; },
  },
  "./repoFilter": repoFilter,
});
const sidebar: Pick<typeof import("./Sidebar"), "Sidebar"> = compile("./Sidebar.tsx", {
  ...reactImports,
  "../onboarding/ReasonCliStatus": { ReasonCliStatus: empty },
  "./Icons": Object.fromEntries(iconNames.map((name) => [name, empty])),
  "../keybindings/registry": { COMMANDS },
  "../keybindings/shortcut": { glyphs },
  "../keybindings/overrides": { effectiveShortcuts },
  "./HelpMenu": { HelpMenu: empty },
  "./RepoIcon": { RepoIcon: empty },
  "./RenameWorkspaceDialog": { RenameWorkspaceDialog: empty },
  "../state/repoOrder": repoOrder,
  "./SidebarWorkspaceRow": {
    SidebarWorkspaceRow: ({ workspace }: { workspace: Workspace }) => React.createElement("span", { "data-workspace-id": workspace.id }, workspace.name),
    useWorkspaceRows: () => ({ rowProps: () => ({}), menu: null }),
  },
  "./PendingWorkspaceRow": { RepoWorkspaceList: passthrough },
  "./SidebarSections": { SidebarGroup: passthrough },
  "../state/useCustomSectionCollapse": collapseHook,
  "../state/customSectionCollapse": collapse,
  "./SidebarStatusGroups": { SidebarStatusGroups: empty },
  "../state/sidebarOrder": order,
  "./useSidebarDrag": { useSidebarDrag: () => ({ overlay: null }) },
  "../state/navigationSections": navigation,
  "./home/ProjectFilterSubmenu": { ProjectFilterSubmenu: empty, SidebarRadioSubmenu: empty },
  "../home/sidebarSort": { SIDEBAR_SORT_OPTIONS: [] },
  "../home/sidebarGroupBy": { SIDEBAR_GROUP_OPTIONS: [] },
  "../settings/appPrefs": { setAppPref: () => { throw new Error("unexpected sidebar preference write"); } },
  "../home/useRepoFilter": filterHook,
  "../home/useDashboardEnabled": { useDashboardEnabled: () => ({ enabled: false }) },
  "../home/repoFilter": repoFilter,
  "./AddRepositoryMenu": { SidebarAddRepositoryMenu: empty },
  "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: noop },
  "./AccountMenu": { AccountMenu: empty },
  "./AppMark": { AppMark: empty },
  "./ResourceUsagePill": { ResourceUsagePill: empty },
  "./Tooltip": { Tooltip: passthrough, titleWithShortcut: (title: string) => title },
  "./menu/ContextMenu": { ContextMenu: empty, MenuItem: empty, MenuSeparator: empty },
  "../features/routines/useRoutinesAvailable": { useRoutinesAvailable: () => false },
  "./menu/menuIcons": Object.fromEntries(menuIconNames.map((name) => [name, empty])),
  "@hello-pangea/dnd": {
    DragDropContext: passthrough,
    Droppable: ({ children }: { children: (provided: unknown, state: unknown) => React.ReactNode }) => children({ innerRef: noop, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
    Draggable: ({ children }: { children: (provided: unknown, state: unknown) => React.ReactNode }) => children({ innerRef: noop, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
  },
  "./sidebarMotion": { SidebarPresence: passthrough, SidebarRowMotion: passthrough, SidebarSectionMotion: passthrough, endingProps: () => ({}), useMenuPresence: () => ({ mounted: false }) },
  "./SidebarActionsMenu": { SidebarActionsMenu: empty },
}, { window: { addEventListener: noop, removeEventListener: noop } });

function stateFor(repos: Repo[], groupBy: AppState["sidebarGroupBy"] = "repo"): AppState {
  return { selection: { kind: "home" }, sidebarGroupBy: groupBy, repos };
}

async function mounted(t: TestContext, initial: AppState, collapsed = false, filter?: string) {
  saved = new Map([[collapse.BUILTIN_SECTION_COLLAPSE_ID, JSON.stringify(collapsed ? [collapse.MAIN_COLLAPSE_KEY] : [])]]);
  projectFilter = filter;
  const props = (state: AppState): React.ComponentProps<typeof sidebar.Sidebar> => ({
    state, collapsedSections: new Set(), onToggleSection: noop, dispatch: noop,
    onOpenDialog: noop, onOpenSectionDialog: noop, onOpenProject: noop, onOpenSettings: noop,
    onOpenShortcuts: noop, onSendFeedback: noop, onSubmitPrompt: noop, onOpenDiagnostics: noop,
    onSearch: noop, nav: { canBack: false, canForward: false, onBack: noop, onForward: noop }, info: null,
  });
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(sidebar.Sidebar, props(initial))); });
  t.after(() => { act(() => renderer.unmount()); });
  const toggle = () => renderer.root.findByProps({ className: "sb-section-toggle" });
  return {
    expanded: (): boolean => toggle().props["aria-expanded"],
    guidance() {
      const messages = renderer.root.findAllByProps({ className: "sidebar-empty" });
      assert.ok(messages.length <= 1);
      return messages.map((node: { children: unknown[] }) => node.children.join(""));
    },
    groupCount: () => renderer.root.findAllByProps({ className: "sb-repo-group" }).length,
    async toggle() { await act(async () => { toggle().props.onClick(); }); },
    async update(state: AppState) { await act(async () => { renderer.update(React.createElement(sidebar.Sidebar, props(state))); }); },
  };
}

for (const expected of cases) {
  test(`empty sidebar frozen8: ${expected.id}`, async (t) => {
    const view = await mounted(t, stateFor(expected.repos, expected.groupBy), expected.collapsed, expected.filter);
    assert.equal(view.expanded(), !expected.collapsed, "real collapse hook hydrates the frozen state");
    if (expected.filter) {
      assert.equal(projectFilter, expected.filter, "pending repository hydration preserves the supplied filter");
      assert.equal(view.groupCount(), 0, "the real project projection has no matching group");
    }
    if (expected.repos.some((repo) => repo.hidden)) assert.equal(view.groupCount(), 0);
    assert.deepEqual(view.guidance(), expected.message ? ["Add a project to get started."] : []);
  });
}

for (const groupBy of ["repo", "status"] as const) {
  test(`empty sidebar adjacent: live ${groupBy} collapse keeps guidance and persists`, async (t) => {
    const view = await mounted(t, stateFor([], groupBy));
    await view.toggle();
    assert.equal(view.expanded(), false);
    assert.deepEqual(JSON.parse(saved.get(collapse.BUILTIN_SECTION_COLLAPSE_ID) ?? "null"), [collapse.MAIN_COLLAPSE_KEY]);
    assert.deepEqual(view.guidance(), ["Add a project to get started."]);
    await view.toggle();
    assert.equal(view.expanded(), true);
    assert.deepEqual(JSON.parse(saved.get(collapse.BUILTIN_SECTION_COLLAPSE_ID) ?? "null"), []);
    assert.deepEqual(view.guidance(), ["Add a project to get started."]);
  });
}

test("empty sidebar adjacent: adding and removing the last repository retains collapsed state", async (t) => {
  const repo: Repo = { id: "project", name: "Project", path: "/project", defaultBranch: "main", workspaces: [] };
  const view = await mounted(t, stateFor([repo]), true);
  assert.deepEqual(view.guidance(), []);
  await view.update(stateFor([]));
  assert.equal(view.expanded(), false);
  assert.deepEqual(view.guidance(), ["Add a project to get started."]);
  await view.update(stateFor([repo]));
  assert.equal(view.expanded(), false);
  assert.deepEqual(view.guidance(), []);
});
