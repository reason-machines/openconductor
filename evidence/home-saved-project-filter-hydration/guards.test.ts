import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import ts from "typescript";
import * as home from "../../src/home/allWorkspaces.ts";
import * as status from "../../src/state/rowStatus.ts";
import { workspaceNumberLabel } from "../../src/state/workspaceNumber.ts";
import type { Repo } from "../../src/state/types";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const repos: Repo[] = ["a", "b"].map((id) => ({
  id, name: `Project ${id.toUpperCase()}`, path: `/fixture/${id}`, defaultBranch: "main",
  workspaces: [{ id, name: `Working ${id.toUpperCase()}`, userSetWorkspaceName: true, branch: id,
    status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1 }],
}));

async function fixture(loading: boolean) {
  let raw = JSON.stringify({ projects: ["b"], archiveFilter: "active" });
  let reads = 0;
  let writes = 0;
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters(ids: Set<string>) { reads++; return home.parseFilters(raw, ids); },
      saveFilters(filters: home.HomeFilters) { writes++; raw = JSON.stringify(filters); } },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => inert },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert }, "./StatusMatrix": { StatusMatrix: inert },
  };
  const exports: Partial<Pick<typeof import("../../src/components/AllWorkspaces"), "AllWorkspaces">> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../src/components/AllWorkspaces.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, window: new EventTarget(), require(name: string) {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.ok(name in imports, name); return imports[name];
  } });
  const Component = exports.AllWorkspaces;
  assert.ok(Component);
  let props = { repos: loading ? [] : repos, loading, sidebarVisible: true, dispatch() {}, onCreateWorkspace() {} };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  const value = (label: string) => renderer.root.findByProps({ "aria-label": label }).findByProps({ className: "allws-filter-label" }).children.join("");
  return {
    reads: () => reads, writes: () => writes,
    project: () => value("Projects"), archive: () => value("Archived workspaces"),
    async choose(menu: string, label: string) {
      const control = renderer.root.findByProps({ "aria-label": menu });
      if (!control.props["aria-expanded"]) await act(async () => { control.props.onClick(); });
      const choice = renderer.root.findAllByProps({ role: "menuitemcheckbox" }).find((node: any) => node.children.includes(label));
      assert.ok(choice, label); await act(async () => { choice.props.onClick(); });
    },
    async update(loading: boolean) { props = { ...props, repos: [...repos], loading }; await act(async () => { renderer.update(React.createElement(Component, props)); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("a user archive edit during pending startup cancels automatic filter recovery", async () => {
  const view = await fixture(true);
  try {
    await view.choose("Archived workspaces", "Showing all");
    await view.update(false);
    assert.equal(view.project(), "In all projects");
    assert.equal(view.archive(), "Showing all");
    assert.equal(view.reads(), 1);
    assert.equal(view.writes(), 1);
  } finally { await view.close(); }
});

test("a project edit before startup settles is not replaced by automatic recovery", async () => {
  const view = await fixture(true);
  try {
    await view.update(true);
    await view.choose("Projects", "Project A");
    await view.update(false);
    assert.equal(view.project(), "In Project A");
    assert.equal(view.reads(), 1);
    assert.equal(view.writes(), 1);
  } finally { await view.close(); }
});

test("hydration runs once and later repository churn does not clobber user filters", async () => {
  const view = await fixture(true);
  try {
    await view.update(false);
    assert.equal(view.project(), "In Project B");
    assert.equal(view.reads(), 2);
    assert.equal(view.writes(), 0);
    await view.choose("Projects", "All projects");
    await view.choose("Projects", "Project A");
    await view.update(false);
    await view.update(true);
    await view.update(false);
    assert.equal(view.project(), "In Project A");
    assert.equal(view.reads(), 2);
    assert.equal(view.writes(), 2);
  } finally { await view.close(); }
});

test("an initially ready Home reads only once across repository changes", async () => {
  const view = await fixture(false);
  try {
    assert.equal(view.project(), "In Project B");
    await view.update(false);
    await view.update(true);
    await view.update(false);
    assert.equal(view.project(), "In Project B");
    assert.equal(view.reads(), 1);
    assert.equal(view.writes(), 0);
  } finally { await view.close(); }
});
