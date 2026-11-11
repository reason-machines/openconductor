import * as Pierre from "@pierre/diffs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { FileDiff } from "./types.ts";
import type { WorkspaceDiff, WorkspaceDiffArgs } from "./useWorkspaceDiff.ts";

type ViewProps = Parameters<typeof import("./FileDiffView.tsx").FileDiffView>[0];
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const allowed = new Set([
  "DiffViewer.tsx", "FileDiffView.tsx", "useWorkspaceDiff.ts", "api.ts", "types.ts", "target.ts", "nav.ts",
  "changesTree.ts", "changesFilter.ts", "viewed.ts", "EditInViewer.ts", "editable.ts", "editorContents.ts", "copyFile.ts", "pierre.ts",
].map((path) => resolve(root, "src/features/diff", path)).concat([
  "src/features/files/tree.ts", "src/lib/keyedCache.ts", "src/keybindings/fuzzy.ts",
].map((path) => resolve(root, path))));
const patch = (revision = 1, over: Partial<FileDiff> = {}): FileDiff => ({
  path: "src/file.ts", old_path: null, status: "modified", binary: false, additions: 1, deletions: 1,
  last_modified_time: revision,
  hunks: [{ old_start: 8, new_start: 8, old_lines: 1, new_lines: 1, section: "", lines: [
    { kind: "deletion", old_line: 8, new_line: null, text: "old" },
    { kind: "addition", old_line: null, new_line: 8, text: `revision ${revision}` },
  ] }], ...over,
});
const whole = (revision = 1, over: Partial<FileDiff> = {}): FileDiff => ({
  ...patch(revision, over),
  hunks: [{ old_start: 1, new_start: 1, old_lines: 3, new_lines: 3, section: "", lines: [
    { kind: "context", old_line: 1, new_line: 1, text: "unchanged prefix" },
    { kind: "deletion", old_line: 2, new_line: null, text: "old" },
    { kind: "addition", old_line: null, new_line: 2, text: `revision ${revision}` },
    { kind: "context", old_line: 3, new_line: 3, text: "unchanged suffix" },
  ] }],
});

async function fixture() {
  const requests: Array<{
    repo: string | null; request: { path: string | null; context_lines: number | null };
    finish: (files: FileDiff[]) => void; fail: () => void;
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
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_REFRESH_REGRESSION_REF && /\/(DiffViewer|FileDiffView)\.tsx$/.test(filename)
      ? execFileSync("git", ["show", `${process.env.DIFF_REFRESH_REGRESSION_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (name: string) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return {
        CodeView: React.forwardRef((props: unknown) => React.createElement("code-view", props)),
        EditProvider: ({ children }: { children: unknown }) => children,
      };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => true };
      if (name === "@tauri-apps/api/core") return {
        invoke: (command: string, args: { repo: string | null; request: typeof requests[number]["request"] }) => {
          assert.equal(command, "diff_workspace", "no saves or unrelated IPC");
          if (args.request.context_lines === 0) return Promise.resolve({ files: [] });
          return new Promise((resolve, reject) => requests.push({
            ...args, finish: (files) => resolve({ files }), fail: () => reject(new Error("git unavailable")),
          }));
        },
      };
      if (name === "@pierre/diffs/edit") return { Editor: class { constructor() { assert.fail("No DOM editor in this test"); } } };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined, useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "../../keybindings/overrides.ts") return { effectiveShortcuts: () => [] };
      if (name === "../../keybindings/shortcut.ts") return { matchesEvent: () => false };
      if (name === "./useChangesPresentation.ts") return { useChangesPresentation: () => ({ presentation: { filePathFilter: "", diffFileListMode: "flat" } }) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => assert.fail("Unrelated discard dialog"), RevertIcon: () => null };
      if (name === "./Whitespace") return { ViewOptionsMenu: () => null, WhitespaceOnly: () => null };
      if (name === "./FilePathChip") return { FilePathChip: () => null };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "test-theme" };
      if (name === "./CommentNav") return { CommentNav: () => null, useCommentNavigation: () => ({ refresh: () => undefined, previousCount: 0, nextCount: 0 }) };
      if (name === "../../components/ConductorIcon") return { ConductorIcon: () => null };
      if (name === "../../components/Icons.tsx") return { CheckIcon: () => null, CopyIcon: () => null };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: ({ children }: { children: unknown }) => children };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
      document: { documentElement: { dataset: { theme: "light" } } },
      MutationObserver: class { observe() {} disconnect() {} },
      setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout: (id: number) => timers.delete(id),
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { DiffTab } = load(resolve(root, "src/features/diff/DiffViewer.tsx"));
  const { FileDiffView } = load(resolve(root, "src/features/diff/FileDiffView.tsx"));
  const workspaceModule = load(resolve(root, "src/features/diff/useWorkspaceDiff.ts"));
  assert.ok(typeof DiffTab === "function" && typeof FileDiffView === "function");
  assert.ok(typeof workspaceModule.useWorkspaceDiff === "function");
  const useWorkspaceDiff = workspaceModule.useWorkspaceDiff;
  let state: WorkspaceDiff;
  const args: WorkspaceDiffArgs = { workspaceId: "workspace", worktree: "/repo", target: { branch: "main", remote: "origin" } };
  let override: Partial<WorkspaceDiff> = {};
  function Fixture() {
    state = useWorkspaceDiff(args);
    return React.createElement(DiffTab, { diff: { ...state, ...override } });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Fixture)); });
  const visibleNode = () => {
    const node = renderer.root.findAllByType(FileDiffView).find((node: { props: ViewProps }) => node.props.isVisible);
    assert.ok(node, "selected real FileDiffView is mounted");
    return node;
  };
  const request = (path: string | null) => {
    const pending = requests.filter((entry) => entry.request.path === path).at(-1);
    assert.ok(pending, `Missing request for ${path ?? "list"}`);
    return pending;
  };
  const buttons = (label: string) => visibleNode().findAll((node: { type: string; props: Record<string, unknown> }) => node.type === "button" && node.props["aria-label"] === label);
  return {
    requests, request,
    visible: (): ViewProps => visibleNode().props,
    retry: () => buttons("Update failed. Retry"),
    viewed: () => buttons("Mark as viewed"),
    updating: () => visibleNode().findAll((node: { type: string; props: Record<string, unknown> }) => node.type === "span" && node.props.role === "status"),
    state: () => state,
    async list(files: FileDiff[]) { await act(async () => { request(null).finish(files); }); },
    async open(path = "src/file.ts") { await act(async () => { state.openPath(path); }); },
    async full(file: FileDiff) { await act(async () => { request(file.path).finish([file]); }); },
    async fail(path = "src/file.ts") { await act(async () => { request(path).fail(); }); },
    async refresh(files: FileDiff[]) {
      assert.equal(timers.size, 1);
      const [id, callback] = [...timers][0]; timers.delete(id);
      await act(async () => { callback(); });
      await act(async () => { request(null).finish(files); });
    },
    async clickRetry() {
      const button = buttons("Update failed. Retry")[0];
      assert.ok(button, "the actual header offers Retry update");
      await act(async () => { button.props.onClick(); });
    },
    async settle(request: typeof requests[number], file?: FileDiff) {
      await act(async () => { if (file) request.finish([file]); else request.fail(); });
    },
    async direct(patch: Partial<WorkspaceDiff>) { override = patch; await act(async () => { renderer.update(React.createElement(Fixture)); }); },
    async close() { await act(async () => { renderer.unmount(); }); assert.equal(timers.size, 0); },
  };
}

async function loaded() {
  const view = await fixture();
  const file = patch(); const full = whole();
  await view.list([file]); await view.open(); await view.full(full);
  assert.equal(view.visible().full, full);
  return { view, full };
}

test("the actual header replaces Viewed with Updating while loaded context refreshes", async () => {
  const { view, full } = await loaded();
  try {
    await view.refresh([patch(2)]);
    assert.equal(view.visible().full, full);
    assert.equal(view.visible().edit, undefined);
    assert.equal(view.updating().length, 1, "announce the background refresh");
    assert.equal(view.updating()[0].children.filter((child: unknown) => typeof child === "string").join(""), "Updating…");
    assert.equal(view.viewed().length, 0, "refresh status occupies the Viewed slot");
    await view.full(whole(2));
    assert.equal(view.updating().length, 0);
    assert.equal(view.viewed().length, 1);
  } finally { await view.close(); }
});

test("a rejected refresh exposes Retry update and clicking it reloads without another list revision", async () => {
  const { view, full } = await loaded();
  try {
    await view.refresh([patch(2)]); await view.fail();
    assert.equal(view.visible().full, full, "retain display-only context");
    assert.equal(view.visible().edit, undefined);
    assert.equal(view.retry().length, 1, "a failed refresh offers a visible retry");
    assert.equal(view.viewed().length, 0);
    const selected = view.state().selected; const count = view.requests.length;
    await view.clickRetry();
    assert.equal(view.requests.length, count + 1, "one fresh whole-file request");
    assert.equal(view.state().selected, selected, "retry does not require list identity churn");
    assert.equal(view.updating().length, 1);
    assert.equal(view.retry().length, 0);
    const fresh = whole(2); await view.full(fresh);
    assert.equal(view.visible().full, fresh);
    assert.ok(view.visible().edit, "only current successful data enables editing");
    assert.equal(view.viewed().length, 1);
  } finally { await view.close(); }
});

test("same-revision object replacement followed by rejection has the same retry affordance", async () => {
  const { view, full } = await loaded();
  try {
    await view.refresh([patch(), patch(1, { path: "src/other.ts" })]); await view.fail();
    assert.equal(view.visible().full, full);
    assert.equal(view.retry().length, 1);
    await view.clickRetry(); await view.fail();
    assert.equal(view.retry().length, 1, "a failed retry stays retryable");
    assert.equal(view.visible().full, full);
    assert.equal(view.visible().edit, undefined);
    await view.clickRetry(); await view.full(whole());
    assert.equal(view.retry().length, 0);
    assert.ok(view.visible().edit);
  } finally { await view.close(); }
});

test("a late retry failure cannot replace the next selected revision's status", async () => {
  const { view } = await loaded();
  try {
    await view.refresh([patch(2)]); await view.fail(); await view.clickRetry();
    const old = view.request("src/file.ts");
    await view.refresh([patch(3)]); await view.settle(old);
    assert.equal(view.retry().length, 0, "obsolete failure is ignored");
    assert.equal(view.updating().length, 1);
    await view.full(whole(3));
    assert.equal(view.retry().length, 0);
    assert.equal(view.viewed().length, 1);
  } finally { await view.close(); }
});

test("a different file does not inherit retained contents or refresh failure", async () => {
  const { view } = await loaded();
  try {
    const other = patch(1, { path: "src/other.ts" });
    await view.refresh([patch(2), other]); await view.fail();
    await view.open(other.path);
    assert.equal(view.visible().full, null);
    assert.equal(view.retry().length, 0);
    assert.equal(view.updating().length, 0, "first load is not a loaded-data refresh");
    await view.full(whole(1, { path: other.path }));
    assert.equal(view.retry().length, 0);
    assert.equal(view.viewed().length, 1);
  } finally { await view.close(); }
});

test("a target identity change clears the old failure and retained contents", async () => {
  const { view } = await loaded();
  try {
    await view.refresh([patch(2)]); await view.fail();
    await view.direct({ target: { branch: "release", remote: "upstream" } });
    assert.equal(view.visible().full, null);
    assert.equal(view.retry().length, 0);
    assert.equal(view.updating().length, 0);
  } finally { await view.close(); }
});

test("an initial load failure is not mislabelled as a loaded-data refresh failure", async () => {
  const view = await fixture();
  try {
    await view.list([patch()]); await view.open(); await view.fail();
    assert.equal(view.visible().full, null);
    assert.equal(view.retry().length, 0);
    assert.equal(view.updating().length, 0);
  } finally { await view.close(); }
});
