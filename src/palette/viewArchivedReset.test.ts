import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as home from "../home/allWorkspaces.ts";
import type { HomeFilters, HomeRow } from "../home/allWorkspaces.ts";
import type { Repo, Workspace } from "../state/types.ts";
import type { ArchivedWorkspace } from "../workspace/archivedList.ts";
import * as search from "./search/model.ts";
import * as state from "./state.ts";
import * as workspacesTab from "./workspacesTab.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import type { CommandPaletteProps } from "./CommandPalette.tsx";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const workspace = (id: string, archived = false): Workspace => ({
  id, name: id, userSetWorkspaceName: true, branch: id, status: archived ? "archived" : "idle",
  diff: { added: 0, removed: 0 }, createdAt: 1,
});
const repos: Repo[] = ["project-a", "project-b"].map((id) => ({
  id, name: id, path: `/synthetic/${id}`, defaultBranch: "main", workspaces: [workspace(`${id}-active`)],
}));
const archived: ArchivedWorkspace[] = repos.map((repo) => {
  const ws = workspace(`${repo.id}-archived`, true);
  return { id: ws.id, repoId: repo.id, name: ws.name, branch: ws.branch, createdAt: ws.createdAt, workspace: ws };
});
const data: search.PaletteData = {
  actions: [
    { id: VIEW_ARCHIVED_ACTION, title: "View archived workspaces", group: "navigation" },
    { id: "ordinary", title: "Ordinary action", group: "actions" },
  ],
  settings: [], workspaces: [], projects: [], recentWorkspaceIds: [], activeWorkspaceId: "project-a-active",
};
const allIds = ["project-a-active", "project-a-archived", "project-b-active", "project-b-archived"];

async function fixture(saved: HomeFilters) {
  const writes: HomeFilters[] = [];
  const selected: string[] = [];
  let closes = 0;
  const inert = () => null;
  function WorkspaceFilters(props: { filters: HomeFilters; onChange: (next: HomeFilters) => void }) {
    return React.createElement("button", {
      "data-filter-control": true,
      onClick: () => props.onChange({ projects: ["project-b"], archiveFilter: "archived" }),
    }, props.filters.archiveFilter);
  }
  function WorkspaceRow({ row, onChoose }: { row: HomeRow; onChoose: () => void }) {
    return React.createElement("div", { role: "option", "data-workspace": row.workspace.id, onClick: onChoose }, row.title);
  }
  const imports: Record<string, unknown> = {
    "../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut.ts": { glyphs: () => "" },
    "./search/model.ts": search,
    "./state.ts": state,
    "../state/workspaceNumber.ts": { workspaceNumberLabel: () => "" },
    "./fromAppState.ts": { VIEW_ARCHIVED_ACTION },
    "../home/allWorkspaces.ts": {
      ...home, loadFilters: () => saved,
      saveFilters: (filters: HomeFilters) => writes.push({ projects: [...filters.projects], archiveFilter: filters.archiveFilter }),
    },
    "../home/allWorkspaces": home,
    "./workspacesTab.ts": workspacesTab,
    "./WorkspacesTab.tsx": { WorkspaceFilters, WorkspaceRow },
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "../components/ConductorIcon": { ConductorIcon: inert },
    "./palette.css": {},
  };
  const exported: Partial<typeof import("./CommandPalette.tsx")> = {};
  const javascript = ts.transpileModule(readFileSync(new URL("./CommandPalette.tsx", import.meta.url), "utf8"), {
    fileName: "CommandPalette.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    console, Date, exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected palette dependency: ${name}`);
      return imports[name];
    },
  });
  const CommandPalette = exported.CommandPalette;
  assert.ok(CommandPalette);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(CommandPalette, {
      data, repos, archived,
      onSelect(item: Parameters<CommandPaletteProps["onSelect"]>[0]) { selected.push(item.id); },
      onClose() { closes += 1; },
    }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        return node.props.id === "palette-list" ? { scrollTo() {}, querySelector() { return null; } } : null;
      },
    });
  });
  const input = () => renderer.root.findByProps({ className: "palette-input" });
  return {
    writes, selected,
    closes: () => closes,
    query: () => input().props.value,
    activeTab: () => renderer.root.findByProps({ role: "tab", "aria-selected": true }).props.children,
    rowIds: () => renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "div" && typeof node.props["data-workspace"] === "string").map((node: { props: Record<string, string> }) => node.props["data-workspace"]).sort(),
    async type(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async tab(label: string) {
      const button = renderer.root.findAllByProps({ role: "tab" }).find((node: { props: { children: string } }) => node.props.children === label);
      assert.ok(button);
      await act(async () => { button.props.onClick(); });
    },
    async click(title: string) {
      const titleNode = renderer.root.findByProps({ className: "palette-title", children: title });
      assert.ok(titleNode.parent);
      await act(async () => { titleNode.parent.props.onClick(); });
    },
    async enter() {
      const nativeEvent = { key: "Enter", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 13, defaultPrevented: false };
      await act(async () => { input().props.onKeyDown({ ...nativeEvent, nativeEvent, preventDefault() {}, stopPropagation() {} }); });
    },
    async changeFilters() { await act(async () => { renderer.root.findByProps({ "data-filter-control": true }).props.onClick(); }); },
    async dispose() { await act(async () => { renderer.unmount(); }); },
  };
}

test("View archived workspaces reveals archived rows from every project without saving over Home filters", async () => {
  const saved: HomeFilters = { projects: ["project-a"], archiveFilter: "active" };
  const view = await fixture(saved);
  try {
    await view.click("View archived workspaces");
    assert.deepEqual(view.rowIds(), allIds);
    assert.equal(view.activeTab(), "Workspaces");
    assert.equal(view.query(), "");
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
    assert.deepEqual(view.writes, []);
    assert.deepEqual(saved, { projects: ["project-a"], archiveFilter: "active" });
  } finally { await view.dispose(); }
});

test("Enter on View archived workspaces clears its search and a saved Only archived project restriction", async () => {
  const view = await fixture({ projects: ["project-a"], archiveFilter: "archived" });
  try {
    await view.type("View archived workspaces");
    await view.enter();
    assert.deepEqual(view.rowIds(), allIds);
    assert.equal(view.activeTab(), "Workspaces");
    assert.equal(view.query(), "");
    assert.deepEqual(view.selected, []);
    assert.equal(view.closes(), 0);
    assert.deepEqual(view.writes, []);
  } finally { await view.dispose(); }
});

test("View archived workspaces replaces a project restriction changed earlier in the same palette", async () => {
  const view = await fixture({ projects: ["project-a"], archiveFilter: "active" });
  try {
    await view.tab("Workspaces");
    assert.deepEqual(view.rowIds(), ["project-a-active"]);
    await view.changeFilters();
    assert.deepEqual(view.rowIds(), ["project-b-archived"]);
    await view.tab("All");
    await view.click("View archived workspaces");
    assert.deepEqual(view.rowIds(), allIds);
    assert.deepEqual(view.writes, [{ projects: ["project-b"], archiveFilter: "archived" }]);
    assert.equal(view.closes(), 0);
    assert.deepEqual(view.selected, []);
  } finally { await view.dispose(); }
});

test("ordinary Workspaces tab navigation preserves filters and an ordinary action still selects and closes", async () => {
  const view = await fixture({ projects: ["project-a"], archiveFilter: "archived" });
  try {
    await view.tab("Workspaces");
    assert.deepEqual(view.rowIds(), ["project-a-archived"]);
    assert.deepEqual(view.writes, []);
    await view.tab("All");
    await view.click("Ordinary action");
    assert.deepEqual(view.selected, ["action:ordinary"]);
    assert.equal(view.closes(), 1);
  } finally { await view.dispose(); }
});
