import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { AppState, Workspace } from "../state/types.ts";
import * as order from "../state/sidebarOrder.ts";
import * as navigation from "../state/navigationSections.ts";
import * as repoOrder from "../state/repoOrder.ts";
import * as repoFilter from "../home/repoFilter.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../keybindings/overrides.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const noop = () => {};
const empty = () => null;
const passthrough = ({ children }: { children?: React.ReactNode }) => children;
const iconNames = ["ArrowLeftIcon", "ArrowRightIcon", "ChevronDownIcon", "ChevronIcon", "FolderPlusIcon", "HomeIcon", "LayoutGridIcon", "MoreIcon", "PlayIcon", "PlusIcon", "SearchIcon", "SettingsIcon", "SidebarIcon"];
const menuIconNames = ["EyeIcon", "EyeOffIcon", "Link2Icon", "PencilIcon", "PlusIcon", "SettingsIcon", "Trash2Icon"];

function compile(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, {
    exports: {},
    require(name: string) {
      assert.ok(Object.prototype.hasOwnProperty.call(imports, name), `unexpected mounted sidebar dependency: ${name}`);
      return imports[name];
    },
    ...globals,
  });
}

const reactImports = { react: React, "react/jsx-runtime": dependencies("react/jsx-runtime") };
const sections = compile("./SidebarSections.tsx", {
  ...reactImports, "./Icons": { ChevronDownIcon: empty, ChevronIcon: empty }, "../state/navigationSections": navigation,
});
let collapsed = new Set<string>();
const sidebar: Pick<typeof import("./Sidebar"), "Sidebar"> = compile("./Sidebar.tsx", {
  ...reactImports,
  "../onboarding/ReasonCliStatus": { ReasonCliStatus: empty },
  "./Icons": Object.fromEntries(iconNames.map((name) => [name, empty])),
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
  "./PendingWorkspaceRow": { RepoWorkspaceList: () => null },
  "./SidebarSections": sections,
  "../state/useCustomSectionCollapse": { useBuiltinSectionCollapse: () => [collapsed, noop] },
  "../state/customSectionCollapse": { MAIN_COLLAPSE_KEY: "main", PINNED_COLLAPSE_KEY: "pinned" },
  "./SidebarStatusGroups": { SidebarStatusGroups: empty },
  "../state/sidebarOrder": order,
  "./useSidebarDrag": { useSidebarDrag: () => ({ overlay: null }) },
  "../state/navigationSections": navigation,
  "./home/ProjectFilterSubmenu": { ProjectFilterSubmenu: empty, SidebarRadioSubmenu: empty },
  "../home/sidebarSort": { SIDEBAR_SORT_OPTIONS: [] },
  "../home/sidebarGroupBy": { SIDEBAR_GROUP_OPTIONS: [] },
  "../settings/appPrefs": { setAppPref: () => assert.fail("unexpected preference write") },
  "../home/useRepoFilter": { useRepoFilter: () => [undefined, noop] },
  "../home/useDashboardEnabled": { useDashboardEnabled: () => ({ enabled: false }) },
  "../home/repoFilter": repoFilter,
  "./AddRepositoryMenu": { SidebarAddRepositoryMenu: empty },
  "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings: noop },
  "./AccountMenu": { AccountMenu: empty },
  "./AppMark": { AppMark: empty },
  "./ResourceUsagePill": { ResourceUsagePill: empty },
  "./Tooltip": { Tooltip: passthrough, titleWithShortcut: (title: string) => title },
  "./ui/Tooltip": { Tooltip: passthrough },
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

const workspace = (id: string, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, ...extra,
});
function stateFor(workspaces: Workspace[], extra: Partial<AppState> = {}): AppState {
  return {
    selection: { kind: "home" }, sidebarSort: "updated",
    repos: [{ id: "repo", name: "Project", path: "/project", defaultBranch: "main", collapsed: false, workspaces }],
    ...extra,
  };
}
function mounted(t: TestContext, initial: AppState, folded = false) {
  collapsed = folded ? new Set(["pinned"]) : new Set();
  const props = (state: AppState): React.ComponentProps<typeof sidebar.Sidebar> => ({
    state, collapsedSections: new Set(), onToggleSection: noop, dispatch: () => assert.fail("unexpected dispatch"),
    onOpenDialog: noop, onOpenSectionDialog: noop, onOpenProject: noop, onOpenSettings: noop,
    onOpenShortcuts: noop, onSendFeedback: noop, onSubmitPrompt: noop, onOpenDiagnostics: noop,
    onSearch: noop, nav: { canBack: false, canForward: false, onBack: noop, onForward: noop }, info: null,
  });
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(sidebar.Sidebar, props(initial))); });
  t.after(() => { act(() => renderer.unmount()); collapsed = new Set(); });
  return {
    rowIds: (): string[] => renderer.root.findAllByProps({ "data-group": "Pinned" }).flatMap((group: any) =>
      group.findAll((node: any) => node.type === "span" && typeof node.props["data-workspace-id"] === "string").map((node: any) => node.props["data-workspace-id"])),
    update(state: AppState) { act(() => renderer.update(React.createElement(sidebar.Sidebar, props(state)))); },
  };
}

// Reference: Pia selects pins, maps Fia, sorts jia(t,e)=e.pinnedAt-t.pinnedAt,
// maps Mia, and renders Lia in that order. Stored order/row activity is not pin order.
test("Pinned mounted: latest pin appears first", (t) => {
  const state = stateFor([workspace("older", { pinnedAt: 100 }), workspace("latest", { pinnedAt: 300 }), workspace("middle", { pinnedAt: 200 })]);
  assert.deepEqual(mounted(t, state).rowIds(), ["latest", "middle", "older"]);
});
test("Pinned mounted: newest first spans loaded repositories", (t) => {
  const state = stateFor([workspace("alpha", { pinnedAt: 100 })]);
  state.repos.push({ ...state.repos[0], id: "other", name: "Other", workspaces: [workspace("beta", { pinnedAt: 200 })] });
  assert.deepEqual(mounted(t, state).rowIds(), ["beta", "alpha"]);
});
test("Pinned mounted: a later pin update moves to the front", (t) => {
  const state = stateFor([workspace("alpha", { pinnedAt: 100 }), workspace("beta", { pinnedAt: 200 })]);
  const view = mounted(t, state);
  view.update(stateFor([workspace("alpha", { pinnedAt: 300 }), workspace("beta", { pinnedAt: 200 })]));
  assert.deepEqual(view.rowIds(), ["alpha", "beta"]);
});
for (const sort of ["updated", "created"] as const) test(`Pinned mounted: ${sort} setting does not override pin time`, (t) => {
  const state = stateFor([workspace("older", { pinnedAt: 100, createdAt: 900, updatedAt: 999 }), workspace("newer", { pinnedAt: 200, createdAt: 1, updatedAt: 1 })], { sidebarSort: sort });
  assert.deepEqual(mounted(t, state).rowIds(), ["newer", "older"]);
});
test("Pinned control: equal pin timestamps retain repository/input order", (t) => {
  const state = stateFor([workspace("alpha", { pinnedAt: 100 }), workspace("beta", { pinnedAt: 100 })]);
  assert.deepEqual(mounted(t, state).rowIds(), ["alpha", "beta"]);
});
test("Pinned control: unpinned and archived unpinned rows stay out", (t) => {
  const state = stateFor([workspace("plain"), workspace("archived", { status: "archived" }), workspace("pin", { pinnedAt: 100 })]);
  assert.deepEqual(mounted(t, state).rowIds(), ["pin"]);
});
test("Pinned control: section membership takes precedence", (t) => {
  const state = stateFor([workspace("sectioned", { pinnedAt: 200 }), workspace("pin", { pinnedAt: 100 })], { sections: [{ id: "focus", name: "Focus", workspaceIds: ["sectioned"] }] });
  assert.deepEqual(mounted(t, state).rowIds(), ["pin"]);
});
test("Pinned control: collapsed Pinned group has no rendered rows", (t) => {
  assert.deepEqual(mounted(t, stateFor([workspace("pin", { pinnedAt: 100 })]), true).rowIds(), []);
});
test("Pinned control: empty pin projection has no rows", (t) => {
  assert.deepEqual(mounted(t, stateFor([workspace("plain")])).rowIds(), []);
});
test("Pinned control: Status grouping keeps the separate Pinned group", (t) => {
  assert.deepEqual(mounted(t, stateFor([workspace("pin", { pinnedAt: 100, manualStatus: "backlog" })], { sidebarGroupBy: "status" })).rowIds(), ["pin"]);
});
test("Pinned control: unrelated hidden repository does not enter the group", (t) => {
  const state = stateFor([workspace("pin", { pinnedAt: 100 })]);
  state.repos.push({ ...state.repos[0], id: "hidden", hidden: true, workspaces: [workspace("hidden-plain")] });
  assert.deepEqual(mounted(t, state).rowIds(), ["pin"]);
});
