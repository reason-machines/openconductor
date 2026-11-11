import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const allowed = new Set([
  "src/features/diff/DiffViewer.tsx", "src/features/diff/useWorkspaceDiff.ts", "src/features/diff/api.ts",
  "src/features/diff/types.ts", "src/features/diff/target.ts", "src/features/diff/nav.ts",
  "src/features/diff/changesTree.ts", "src/features/diff/changesFilter.ts", "src/features/diff/viewed.ts",
  "src/features/files/tree.ts", "src/lib/keyedCache.ts", "src/keybindings/fuzzy.ts",
].map((path) => resolve(root, path)));
const file: FileDiff = {
  path: "src/file.ts", old_path: null, status: "modified", binary: false,
  additions: 0, deletions: 0, hunks: [],
};

type TextNode = string | { children: TextNode[] | null };
function visibleText(node: TextNode | TextNode[] | null): string {
  if (node === null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(visibleText).join("");
  return (node.children ?? []).map(visibleText).join("");
}

async function fixture() {
  const requests: Array<{
    finish: (files: FileDiff[]) => void;
    fail: () => void;
    settled: boolean;
  }> = [];
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map<string, string>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = filename === resolve(root, "src/features/diff/DiffViewer.tsx") && process.env.DIFF_EMPTY_REGRESSION_REF
      ? execFileSync("git", ["show", `${process.env.DIFF_EMPTY_REGRESSION_REF}:src/features/diff/DiffViewer.tsx`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (name: string) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => true };
      if (name === "@tauri-apps/api/core") return {
        invoke: (command: string, args: { request: { path: string | null; context_lines: number | null } }) => {
          assert.equal(command, "diff_workspace", "no unrelated IPC");
          if (args.request.context_lines === 0) return Promise.resolve({ files: [] });
          assert.equal(args.request.path, null, "only the changed-file list is requested");
          return new Promise((resolve, reject) => {
            const request = {
              finish: (files: FileDiff[]) => { request.settled = true; resolve({ files }); },
              fail: () => { request.settled = true; reject(new Error("git unavailable")); },
              settled: false,
            };
            requests.push(request);
          });
        },
      };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined };
      if (name === "./useChangesPresentation.ts") return { useChangesPresentation: () => ({ presentation: { filePathFilter: "", diffFileListMode: "flat" } }) };
      if (name === "./FileDiffView") return { FileDiffView: (props: unknown) => React.createElement("diff-view", props) };
      if (name === "./EditInViewer.ts") return { useFileEdit: () => undefined, editableContents: () => null };
      if (name === "./copyFile.ts") return { newFileText: () => assert.fail("No file-content copy in this fixture") };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => assert.fail("No discard in this fixture") };
      if (name === "./Whitespace") return { ViewOptionsMenu: () => null };
      if (name === "../../components/ConductorIcon") return { ConductorIcon: () => null };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: ({ children }: { children: unknown }) => children };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
      setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout: (id: number) => timers.delete(id),
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { DiffTab } = load(resolve(root, "src/features/diff/DiffViewer.tsx"));
  const { useWorkspaceDiff } = load(resolve(root, "src/features/diff/useWorkspaceDiff.ts"));
  assert.ok(typeof DiffTab === "function" && typeof useWorkspaceDiff === "function");
  let state: WorkspaceDiff;
  let closed = 0;
  let opened = 0;
  const onClose = () => { closed++; };
  const onOpen = () => { opened++; };
  const Fixture = () => {
    state = useWorkspaceDiff({ workspaceId: "workspace", worktree: "/repo", target: { branch: "main", remote: "origin" }, onOpen });
    return React.createElement(DiffTab, { diff: state, onClose });
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Fixture)); });
  const pending = () => {
    const request = requests.filter((entry) => !entry.settled).at(-1);
    assert.ok(request, "the real hook has a pending changed-file request");
    return request;
  };
  return {
    state: () => state,
    closed: () => closed,
    opened: () => opened,
    text: () => visibleText(renderer.toJSON()),
    loading: () => renderer.root.findAll((node: { props: Record<string, unknown> }) => node.props.role === "status" && node.props["aria-label"] === "Loading file changes"),
    files: () => renderer.root.findAllByType("diff-view"),
    async finish(files: FileDiff[]) { await act(async () => { pending().finish(files); }); },
    async fail() { await act(async () => { pending().fail(); }); },
    async open() { await act(async () => { state.openPath(file.path); }); },
    async openTurn() { await act(async () => { state.openTurnFile({ sessionId: "chat", turnId: "turn" }, file.path); }); },
    async refresh() { await act(async () => { state.refresh(); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("a pending initial list announces loading rather than asking the user to pick a file", async () => {
  const view = await fixture();
  try {
    assert.equal(view.state().load.state, "loading");
    assert.equal(view.loading().length, 1, "the actual DiffTab announces loading");
    assert.doesNotMatch(view.text(), /Pick a file|No changes to show/);
    assert.equal(view.closed(), 0);
  } finally { await view.close(); }
});

test("opening an uncached turn file keeps loading distinct from an empty selection", async () => {
  const view = await fixture();
  try {
    await view.finish([file]);
    await view.open();
    assert.equal(view.files().length, 1);
    await view.openTurn();
    assert.equal(view.opened(), 2, "the real hook requested the workspace tab");
    assert.equal(view.state().load.state, "loading");
    assert.equal(view.state().selected, null);
    assert.equal(view.loading().length, 1);
    assert.doesNotMatch(view.text(), /Pick a file|No changes to show/);
    assert.equal(view.closed(), 0);
  } finally { await view.close(); }
});

test("a first-load rejection displays file-change failure and its reason, not selection instructions", async () => {
  const view = await fixture();
  try {
    await view.openTurn();
    await view.fail();
    assert.equal(view.state().load.state, "error");
    assert.match(view.text(), /Couldn't load file changes/);
    assert.match(view.text(), /git unavailable/);
    assert.doesNotMatch(view.text(), /Pick a file|No changes to show/);
    assert.equal(view.loading().length, 0);
    assert.equal(view.closed(), 0);
  } finally { await view.close(); }
});

test("a later successful list replaces the error with the selected file", async () => {
  const view = await fixture();
  try {
    await view.openTurn();
    await view.fail();
    await view.refresh();
    await view.finish([file]);
    assert.equal(view.state().load.state, "ready");
    assert.equal(view.state().selected?.path, file.path);
    assert.equal(view.files().length, 1);
    assert.doesNotMatch(view.text(), /Couldn't load file changes|git unavailable|Pick a file/);
    assert.equal(view.loading().length, 0);
    assert.equal(view.closed(), 0);
  } finally { await view.close(); }
});

test("only a successfully loaded empty list closes the diff tab", async () => {
  const view = await fixture();
  try {
    assert.equal(view.closed(), 0, "pending is not empty");
    await view.fail();
    assert.equal(view.closed(), 0, "a failed load is not empty");
    await view.refresh();
    await view.finish([]);
    assert.equal(view.state().load.state, "ready");
    assert.equal(view.closed(), 1, "preserve ready-empty auto-close");
  } finally { await view.close(); }
});
