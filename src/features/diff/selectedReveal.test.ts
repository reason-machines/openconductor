import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PERSIST_NAMES, ROUTE_USER_STATE, routeStateKey } from "../../lib/local-storage/subsystems.ts";
import { parseChangesPresentation } from "./changesPresentation.ts";
import { DEFAULT_VIEW_OPTIONS, type FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const ownerPath = resolve(root, "src/components/WorkspaceView.tsx");
const allowed = new Set([
  "src/features/diff/ChangesList.tsx", "src/features/diff/useChangesPresentation.ts",
  "src/features/diff/changesPresentation.ts", "src/features/diff/changesTree.ts",
  "src/features/diff/changesFilter.ts", "src/features/diff/renameDisplayPath.ts",
  "src/features/diff/fileCopyPaths.ts", "src/features/files/tree.ts",
  "src/lib/local-storage/subsystems.ts", "src/keybindings/fuzzy.ts",
].map((path) => resolve(root, path)));
const files: FileDiff[] = ["root.ts", "src/top.ts", "src/nested/target.ts", "src/nested/peer.ts", "other/away.ts"].map((path) => ({
  path, old_path: null, status: "modified", additions: 1, deletions: 0, binary: false, hunks: [],
}));
const initialCollapsed = ["src", "src/nested", "other"];
const target = "src/nested/target.ts";
const storageKey = `local-storage:${ROUTE_USER_STATE.name}:${PERSIST_NAMES.routeUserState}`;
const route = (workspaceId: string) => routeStateKey({ routeId: "workspace.changes", scope: [workspaceId] });
const unexpected = () => assert.fail("Unrelated action in selected-file reveal fixture");
const inert = () => null;
type TextNode = string | { children: readonly TextNode[] };
function visibleText(node: TextNode): string {
  return typeof node === "string" ? node : node.children.map(visibleText).join("");
}

function evaluate(source: string, fileName: string, require: (name: string) => unknown, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(source, {
    fileName,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, globals, { filename: fileName })(require, module, module.exports);
  return module.exports;
}

async function fixture(initial: { mainTab?: string; selected?: string; panelTab?: string } = {}) {
  const seeded = Object.fromEntries(["one", "two"].map((id) => [route(id), {
    diffFileListMode: "tree", filePathFilter: "", collapsedDirectoryPaths: initialCollapsed,
  }]));
  const storage = new Map([[storageKey, JSON.stringify({ state: { routeStates: seeded }, version: 0 })]]);
  const writes: string[] = [];
  const modules = new Map<string, Record<string, unknown>>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { assert.equal(key, storageKey); writes.push(value); storage.set(key, value); },
  };
  const pathChipPath = resolve(root, "src/features/diff/FilePathChip.tsx");
  const chipSource = ts.createSourceFile(pathChipPath, readFileSync(pathChipPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const formatter = chipSource.statements.find((node: { name?: { text: string } }) => ts.isFunctionDeclaration(node) && node.name?.text === "splitPath");
  assert.ok(formatter, "the real path formatter exists");
  const pathFormatter = evaluate(formatter.getText(chipSource), pathChipPath, unexpected);
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached;
    const result = evaluate(readFileSync(filename, "utf8"), filename, (name) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => false };
      if (name === "../../lib/local-storage/index.ts") return { ...load(resolve(root, "src/lib/local-storage/subsystems.ts")), persistedIn: unexpected };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: ({ children }: { children: unknown }) => children };
      if (name === "./DiscardDialog") return { RevertIcon: inert };
      if (name === "./FileContextMenu") return { FileContextMenu: unexpected };
      if (name === "../openIn/apps") return { copyText: unexpected, openInApp: unexpected };
      if (name === "./FilePathChip") return pathFormatter;
      if (name === "../files/panelIcons") return { SearchIcon: inert, XIcon: inert };
      const base = resolve(dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    }, { localStorage, console });
    modules.set(filename, result);
    return result;
  }
  const ownerText = process.env.SELECTED_REVEAL_REGRESSION_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.SELECTED_REVEAL_REGRESSION_REF}:src/components/WorkspaceView.tsx`], { encoding: "utf8" })
    : readFileSync(ownerPath, "utf8");
  const owner = ts.createSourceFile(ownerPath, ownerText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = (name: string) => {
    const result = owner.statements.find((node: { name?: { text: string } }) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(result?.body, `Actual ${name} declaration exists`);
    return result;
  };
  const workspace = declaration("WorkspaceView");
  const variable = (name: string) => {
    for (const statement of workspace.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const item of statement.declarationList.declarations) if (item.name.getText(owner) === name) return statement.getText(owner);
    }
    return assert.fail(`Actual workspace variable ${name} exists`);
  };
  let mount = "";
  const findMount = (node: { getText(source: unknown): string; tagName?: { getText(source: unknown): string } }) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName?.getText(owner) === "RightPanel") {
      assert.equal(mount, "", "one actual owner-to-panel mount");
      mount = node.getText(owner);
    }
    ts.forEachChild(node, findMount);
  };
  findMount(workspace);
  assert.notEqual(mount, "");
  const { ChangesList } = load(resolve(root, "src/features/diff/ChangesList.tsx"));
  const { useChangesPresentation } = load(resolve(root, "src/features/diff/useChangesPresentation.ts"));
  const { ancestors } = load(resolve(root, "src/features/files/tree.ts"));
  const filter = load(resolve(root, "src/features/diff/changesFilter.ts"));
  assert.ok(typeof ChangesList === "function" && typeof useChangesPresentation === "function" && typeof ancestors === "function");
  const probeText = `
    const { useState, useEffect, useRef } = React;
    ${declaration("RightPanel").getText(owner)}
    function Probe({ workspace, mainTab, diffOpen, fileTarget, diff, gitPanelTab, setGitPanelTab }) {
      ${variable("showDiff")}
      ${variable("showFile")}
      const openMarkdown = unrelated;
      const review = { actions: () => null };
      const target = {}; const pickingChangesTarget = false; const setPickingChangesTarget = unrelated; const repo = {};
      const pullRequest = { pr: null, refresh: unrelated };
      const reviews = { start: unrelated, error: null };
      const fixErrors = {}; const notify = undefined; const pullLatest = {}; const agentWorking = false;
      return (${mount});
    }
    module.exports = { Probe };
  `;
  const compiled = evaluate(probeText, ownerPath, dependencies, {
    React, ChangesList, useChangesPresentation, ancestors, ...filter,
    useKeybindings: () => undefined, useFilesToolbar: () => ({}), showUncommittedChanges: unexpected,
    Tooltip: ({ children }: { children: unknown }) => children, SearchIcon: inert,
    ChangesToolbar: (props: unknown) => React.createElement("presentation-mode", props),
    AllFilesTree: inert, FilesToolbarButtons: inert, ChecksTab: inert,
    ReviewButton: inert, TargetChip: inert, PullLatestButton: inert, unrelated: unexpected,
  });
  assert.ok(typeof compiled.Probe === "function");
  const Probe = compiled.Probe;
  let inputs: {
    workspace: { id: string; path: string; status: string };
    mainTab: string;
    diffOpen: boolean;
    fileTarget: { workspaceId: string; path: string } | null;
    selected: string | undefined;
    panelTab: string;
  } = {
    workspace: { id: "one", path: "/repo/one", status: "active" },
    mainTab: initial.mainTab ?? "chat", diffOpen: true,
    fileTarget: null,
    selected: initial.selected, panelTab: initial.panelTab ?? "changes",
  };
  let renderer: ReturnType<typeof create>;
  const element = () => {
    const selected = files.find((file) => file.path === inputs.selected) ?? null;
    return React.createElement(Probe, {
      ...inputs, gitPanelTab: inputs.panelTab, setGitPanelTab: (panelTab: string) => { inputs = { ...inputs, panelTab }; renderer.update(element()); },
      diff: { opts: DEFAULT_VIEW_OPTIONS, load: { state: "ready", files }, files, selected,
        current: files.findIndex((file) => file.path === inputs.selected), totals: { a: files.length, d: 0 },
        isViewed: () => false, uncommittedPaths: new Set(), canDiscard: false, turn: null, update: unexpected,
        openPath: unexpected, refresh: unexpected },
    });
  };
  await act(async () => { renderer = create(element()); });
  const update = async () => { await act(async () => { renderer.update(element()); }); };
  const persisted = (id = inputs.workspace.id) => {
    const value: unknown = JSON.parse(storage.get(storageKey) ?? "null");
    assert.ok(value !== null && typeof value === "object" && "state" in value);
    const state = value.state;
    assert.ok(state !== null && typeof state === "object" && "routeStates" in state);
    const routes = state.routeStates;
    assert.ok(routes !== null && typeof routes === "object");
    return parseChangesPresentation(Reflect.get(routes, route(id)));
  };
  return {
    persisted, writes,
    rows: () => renderer.root.findAll((node: { type: unknown; props: { title?: string } }) => node.type === "button" && node.props.title?.startsWith("Open ")).map((node: { props: { title: string } }) => node.props.title.slice(5)),
    directories: () => renderer.root.findAllByProps({ className: "oc-change-directory" }).map((node: { props: { "aria-label": string; "aria-expanded": boolean } }) => ({ name: node.props["aria-label"], expanded: node.props["aria-expanded"] })),
    async select(path: string | undefined, mainTab = "diff") { inputs = { ...inputs, mainTab, selected: path }; await update(); },
    async file(path: string, workspaceId = inputs.workspace.id) { inputs = { ...inputs, mainTab: "file", fileTarget: { workspaceId, path } }; await update(); },
    async workspace(id: string) { inputs = { ...inputs, workspace: { ...inputs.workspace, id, path: `/repo/${id}` } }; await update(); },
    async collapse(name: string) { await act(async () => { renderer.root.findByProps({ className: "oc-change-directory", "aria-label": name }).props.onClick(); }); },
    async mode(mode: "flat" | "tree") { await act(async () => { renderer.root.findByType("presentation-mode").props.onViewChange(mode); }); },
    async panel(tab: string) {
      await act(async () => {
        const button = renderer.root.findAllByProps({ role: "tab" }).find((node: { children: readonly TextNode[]; props: { onClick: () => void } }) => visibleText(node).trim().startsWith(tab));
        assert.ok(button, `Actual ${tab} tab exists`);
        button.props.onClick();
      });
    },
    update,
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("active diff selection reveals nested ancestors, persists them and retains unrelated collapsed folders", async () => {
  const view = await fixture({ selected: target });
  try {
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, initialCollapsed);
    assert.ok(!view.rows().includes(target));
    await view.select(target);
    assert.ok(view.rows().includes(target), "the actual ChangesList displays the selected nested file");
    assert.deepEqual(view.directories(), [{ name: "other", expanded: false }, { name: "src", expanded: true }, { name: "nested", expanded: true }]);
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other"]);
    assert.ok(!view.rows().includes("other/away.ts"));
    assert.ok(view.writes.length > 0, "the actual presentation hook persisted the reveal");
  } finally { await view.close(); }
});

test("manual re-collapse survives rerender and inactive-chat return until tree mode resets", async () => {
  const view = await fixture({ selected: target });
  try {
    await view.select(target);
    await view.collapse("src");
    await view.update();
    await view.select(target, "chat");
    await view.select(target);
    assert.ok(!view.rows().includes(target));
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other", "src"]);
    await view.mode("flat");
    assert.ok(view.rows().includes(target));
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other", "src"]);
    await view.mode("tree");
    assert.ok(view.rows().includes(target));
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other"]);
  } finally { await view.close(); }
});

test("inactive or absent file selection never unfolds stale diff selection", async () => {
  const view = await fixture({ selected: target });
  try {
    await view.select(target, "pr");
    await view.select(target, "chat");
    await view.select(undefined);
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, initialCollapsed);
    assert.ok(!view.rows().includes(target));
    assert.equal(view.writes.length, 0);
  } finally { await view.close(); }
});

test("only a file view belonging to this workspace reveals the current file", async () => {
  const view = await fixture({ selected: target });
  try {
    await view.file(target, "another-workspace");
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, initialCollapsed);
    await view.file(target);
    assert.ok(view.rows().includes(target));
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other"]);
  } finally { await view.close(); }
});

test("same file path in a different workspace reveals only that workspace's persisted ancestors", async () => {
  const view = await fixture({ selected: target });
  try {
    await view.select(target);
    await view.collapse("src");
    await view.workspace("two");
    assert.ok(view.rows().includes(target));
    assert.deepEqual(view.persisted("two").collapsedDirectoryPaths, ["other"]);
    assert.deepEqual(view.persisted("one").collapsedDirectoryPaths, ["other", "src"]);
  } finally { await view.close(); }
});

test("an inactive Changes panel does not reveal until the Changes consumer is mounted", async () => {
  const view = await fixture({ mainTab: "diff", selected: target, panelTab: "files" });
  try {
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, initialCollapsed);
    await view.panel("Changes");
    assert.ok(view.rows().includes(target));
    await view.collapse("src");
    await view.panel("Checks");
    await view.panel("Changes");
    assert.ok(view.rows().includes(target));
    assert.deepEqual(view.persisted().collapsedDirectoryPaths, ["other"]);
  } finally { await view.close(); }
});
