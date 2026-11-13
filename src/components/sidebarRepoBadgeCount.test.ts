import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import * as pending from "../workspace/pendingLaunches.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../keybindings/overrides.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const contractBytes = readFileSync(new URL("../../tests/fixtures/sidebar-repo-badge/expected-cases.json", import.meta.url));
assert.equal(createHash("sha256").update(contractBytes).digest("hex"), "fc9072761891c65736db29285644eaf15cd822fcbc3d50c53e5eeb4b26ede3b3");
const contract: unknown = JSON.parse(contractBytes.toString("utf8"));
assert.ok(contract && typeof contract === "object" && "cases" in contract && Array.isArray(contract.cases));
const cases = contract.cases.map((entry: unknown) => {
  assert.ok(entry && typeof entry === "object" && "id" in entry && typeof entry.id === "string");
  assert.ok("referenceBadge" in entry && (entry.referenceBadge === null || typeof entry.referenceBadge === "number"));
  assert.ok("pendingRows" in entry && typeof entry.pendingRows === "number");
  assert.ok("normalRowsRevealed" in entry && typeof entry.normalRowsRevealed === "number");
  return { id: entry.id, badge: entry.referenceBadge, pending: entry.pendingRows, rows: entry.normalRowsRevealed };
});

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
const pendingRows: typeof import("./PendingWorkspaceRow") = compile("./PendingWorkspaceRow.tsx", {
  ...reactImports,
  "./pendingWorkspaceRow.css": {},
  "./StatusMatrix": { StatusMatrix: empty },
  "../settings/useStatusMatrix": { useStatusMatrix: () => false },
  "../workspace/pendingLaunches": pending,
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
  "./PendingWorkspaceRow": pendingRows,
  "./SidebarSections": { SidebarGroup: passthrough },
  "../state/useCustomSectionCollapse": { useBuiltinSectionCollapse: () => [new Set(), noop] },
  "../state/customSectionCollapse": { MAIN_COLLAPSE_KEY: "main", PINNED_COLLAPSE_KEY: "pinned" },
  "./SidebarStatusGroups": { SidebarStatusGroups: empty },
  "../state/sidebarOrder": order,
  "./useSidebarDrag": { useSidebarDrag: () => ({ overlay: null }) },
  "../state/navigationSections": navigation,
  "./home/ProjectFilterSubmenu": { ProjectFilterSubmenu: empty, SidebarRadioSubmenu: empty },
  "../home/sidebarSort": { SIDEBAR_SORT_OPTIONS: [] },
  "../home/sidebarGroupBy": { SIDEBAR_GROUP_OPTIONS: [] },
  "../settings/appPrefs": { setAppPref: () => { throw new Error("unexpected preference write"); } },
  "../home/useRepoFilter": { useRepoFilter: () => [undefined, noop] },
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

const workspace = (id: string, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, ...extra,
});
const ordinary = workspace("ordinary");
const pinned = workspace("pinned", { pinnedAt: 1 });
const sectioned = workspace("sectioned");
const scenarios = new Map<string, { workspaces: Workspace[]; folded: boolean; pending?: boolean }>([
  ["folded-one-ordinary-one-pinned", { workspaces: [ordinary, pinned], folded: true }],
  ["folded-only-pinned", { workspaces: [pinned], folded: true }],
  ["folded-one-ordinary-one-sectioned", { workspaces: [ordinary, sectioned], folded: true }],
  ["folded-only-sectioned", { workspaces: [sectioned], folded: true }],
  ["folded-two-ordinary-control", { workspaces: [ordinary, workspace("other")], folded: true }],
  ["folded-empty-control", { workspaces: [], folded: true }],
  ["expanded-mixed-control", { workspaces: [ordinary, pinned], folded: false }],
  ["folded-mixed-with-pending", { workspaces: [ordinary, pinned], folded: true, pending: true }],
]);
assert.deepEqual(cases.map(({ id }) => id), [...scenarios.keys()]);

function stateFor(workspaces: Workspace[], folded: boolean, sort: AppState["sidebarSort"] = "updated"): AppState {
  return {
    selection: { kind: "home" }, sidebarSort: sort,
    repos: [{ id: "repo", name: "Project", path: "/project", defaultBranch: "main", collapsed: folded, workspaces }],
    sections: [{ id: "focus", name: "Focus", workspaceIds: ["sectioned"] }],
  };
}

function mounted(t: TestContext, initial: AppState, hasPending = false) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const launchId = `badge-${t.name}`;
  if (hasPending) pending.addPendingLaunch(launchId, "repo", 1);
  const props = (state: AppState): React.ComponentProps<typeof sidebar.Sidebar> => ({
    state, collapsedSections: new Set(), onToggleSection: noop, dispatch: noop,
    onOpenDialog: noop, onOpenSectionDialog: noop, onOpenProject: noop, onOpenSettings: noop,
    onOpenShortcuts: noop, onSendFeedback: noop, onSubmitPrompt: noop, onOpenDiagnostics: noop,
    onSearch: noop, nav: { canBack: false, canForward: false, onBack: noop, onForward: noop }, info: null,
  });
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(sidebar.Sidebar, props(initial))); });
  t.after(() => {
    act(() => renderer.unmount());
    pending.removePendingLaunch(launchId);
    assert.equal(pending.getPendingLaunches().length, 0);
  });
  const group = () => renderer.root.findByProps({ className: "sb-repo-group" });
  return {
    badge() {
      const badges = group().findAllByProps({ className: "sb-repo-count" });
      assert.ok(badges.length <= 1);
      return badges.length === 0 ? null : badges[0].children.join("");
    },
    rowIds: (): string[] => group().findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "span" && typeof node.props["data-workspace-id"] === "string").map((node: { props: Record<string, string> }) => node.props["data-workspace-id"]),
    pendingCount: () => group().findAllByProps({ "data-testid": "left-sidebar-pending-workspace" }).length,
    update(state: AppState) { act(() => renderer.update(React.createElement(sidebar.Sidebar, props(state)))); },
    startPending() { act(() => pending.addPendingLaunch(launchId, "repo", 1)); },
    finishPending() { act(() => pending.removePendingLaunch(launchId)); },
  };
}

for (const expected of cases) {
  test(`repository badge frozen8: ${expected.id}`, (t) => {
    const scenario = scenarios.get(expected.id);
    assert.ok(scenario);
    const view = mounted(t, stateFor(scenario.workspaces, scenario.folded), scenario.pending);
    assert.equal(view.pendingCount(), expected.pending, "pending launches remain separate from normal rows");
    assert.equal(view.rowIds().length, expected.rows, "folding never reveals ordinary rows");
    assert.equal(view.badge(), expected.badge === null ? null : String(expected.badge));
  });
}

for (const [sort, ids] of [["updated", ["old", "new"]], ["created", ["new", "old"]]] as const) {
  test(`repository badge adjacent: expanded ${sort} row order stays unchanged`, (t) => {
    const view = mounted(t, stateFor([
      workspace("new", { createdAt: 30, updatedAt: 40 }), pinned, sectioned,
      workspace("old", { createdAt: 10, updatedAt: 90 }),
    ], false, sort));
    assert.equal(view.badge(), null);
    assert.deepEqual(view.rowIds(), [...ids]);
    assert.equal(view.pendingCount(), 0);
  });
}

test("repository badge adjacent: pending-only folded group has no badge", (t) => {
  const view = mounted(t, stateFor([], true), true);
  assert.equal(view.pendingCount(), 1);
  assert.deepEqual(view.rowIds(), []);
  assert.equal(view.badge(), null);
});

test("repository badge adjacent: live pending add/remove and expansion preserve ordinary rows", (t) => {
  const state = stateFor([ordinary, pinned, sectioned], true);
  const view = mounted(t, state);
  view.startPending();
  assert.equal(view.pendingCount(), 1);
  assert.deepEqual(view.rowIds(), []);
  assert.equal(view.badge(), "1");
  view.update({ ...state, repos: state.repos.map((repo) => ({ ...repo, collapsed: false })) });
  assert.equal(view.pendingCount(), 1);
  assert.deepEqual(view.rowIds(), ["ordinary"]);
  assert.equal(view.badge(), null);
  view.finishPending();
  assert.equal(view.pendingCount(), 0);
  assert.deepEqual(view.rowIds(), ["ordinary"]);
});
