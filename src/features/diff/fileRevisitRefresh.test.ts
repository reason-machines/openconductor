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
  "src/features/diff/DiffViewer.tsx", "src/features/diff/useWorkspaceDiff.ts", "src/features/diff/api.ts",
  "src/features/diff/types.ts", "src/features/diff/target.ts", "src/features/diff/nav.ts",
  "src/features/diff/changesTree.ts", "src/features/diff/changesFilter.ts", "src/features/diff/viewed.ts",
  "src/features/diff/EditInViewer.ts", "src/features/diff/editable.ts", "src/features/diff/editorContents.ts", "src/features/diff/draftStorage.ts",
  "src/features/diff/copyFile.ts", "src/features/diff/pierre.ts", "src/features/files/tree.ts", "src/lib/keyedCache.ts", "src/keybindings/fuzzy.ts",
].map((path) => resolve(root, path)));
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
    repo: string | null; request: { path: string | null; context_lines: number | null; scope: Record<string, unknown> };
    finish: (files: FileDiff[]) => void; fail: () => void;
  }> = [];
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map<string, string>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let fileFilter = "";
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = filename === resolve(root, "src/features/diff/DiffViewer.tsx") && process.env.DIFF_VIEWER_REGRESSION_REF
      ? execFileSync("git", ["show", `${process.env.DIFF_VIEWER_REGRESSION_REF}:src/features/diff/DiffViewer.tsx`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = (name: string) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "fuzzysort") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => true };
      if (name === "@tauri-apps/api/core") return {
        invoke: (command: string, args: { repo: string | null; request: typeof requests[number]["request"] }) => {
          assert.equal(command, "diff_workspace", "no editor saves or other IPC during the fixture");
          if (args.request.context_lines === 0) return Promise.resolve({ files: [] });
          return new Promise((resolve, reject) => requests.push({
            ...args, finish: (files) => resolve({ files }), fail: () => reject(new Error("git unavailable")),
          }));
        },
      };
      if (name === "@pierre/diffs/edit") return { Editor: class { constructor() { assert.fail("No DOM editor in the component test"); } } };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined };
      if (name === "./wrapLinesPref.ts") return { useWrapLinesPref: () => ({ value: true, save: () => {} }) };
      if (name === "./useChangesPresentation.ts") return {
        useChangesPresentation: () => ({ presentation: { filePathFilter: fileFilter, diffFileListMode: "flat" } }),
      };
      if (name === "./FileDiffView") return { FileDiffView: (props: ViewProps) => React.createElement("diff-view", props) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => assert.fail("Unrelated discard dialog") };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: () => null };
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
  const workspaceModule = load(resolve(root, "src/features/diff/useWorkspaceDiff.ts"));
  assert.ok(typeof DiffTab === "function");
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
  const visible = (): ViewProps => {
    const node = renderer.root.findAllByType("diff-view").find((node: { props: ViewProps }) => node.props.isVisible);
    assert.ok(node, "selected file is mounted");
    return node.props;
  };
  const request = (path: string | null) => {
    const pending = requests.filter((entry) => entry.request.path === path).at(-1);
    assert.ok(pending, `Missing request for ${path ?? "list"}`);
    return pending;
  };
  return {
    requests, visible,
    async filter(value: string) { fileFilter = value; await act(async () => { renderer.update(React.createElement(Fixture)); }); },
    state: () => state,
    async list(files: FileDiff[]) { await act(async () => { request(null).finish(files); }); },
    async open(path = "src/file.ts") { await act(async () => { state.openPath(path); }); },
    async full(file: FileDiff) { await act(async () => { request(file.path).finish([file]); }); },
    async fail(path = "src/file.ts") { await act(async () => { request(path).fail(); }); },
    async refresh(files: FileDiff[]) {
      assert.equal(timers.size, 1, "the production hook schedules one background poll");
      const [id, callback] = [...timers][0]; timers.delete(id);
      await act(async () => { callback(); });
      await act(async () => { request(null).finish(files); });
    },
    async direct(patch: Partial<WorkspaceDiff>) { override = patch; await act(async () => { renderer.update(React.createElement(Fixture)); }); },
    async close() { await act(async () => { renderer.unmount(); }); assert.equal(timers.size, 0); },
  };
}

const count = (view: Awaited<ReturnType<typeof fixture>>, path: string) =>
  view.requests.filter((request) => request.request.path === path).length;
const A = "src/file.ts", B = "src/other.ts";

test("returning to a retained file retries its failed whole-file load without a changed list", async () => {
  const view = await fixture();
  try {
    const a = patch(), b = patch(1, { path: B });
    await view.list([a, b]); await view.open(A);
    assert.equal(count(view, A), 1);
    await view.fail(A);
    assert.equal(view.visible().full, null);
    await view.open(B); await view.full(whole(1, { path: B }));
    assert.equal(count(view, A), 1, "hidden A must not retry in a loop");
    await view.open(A);
    assert.equal(view.state().selected, a, "no metadata object was replaced");
    assert.equal(count(view, A), 2, "revisiting the same retained file must request fresh complete contents");
    await view.full(whole(2));
    assert.equal(view.visible().edit?.current(), "unchanged prefix\nrevision 2\nunchanged suffix\n");
  } finally { await view.close(); }
});

test("an unchanged background list poll cannot substitute for the missing file retry", async () => {
  const view = await fixture();
  try {
    const a = patch(), b = patch(1, { path: B });
    await view.list([a, b]); await view.open(A); await view.fail(A);
    await view.refresh([patch(), patch(1, { path: B })]);
    assert.equal(view.state().selected, a, "the real list loader reuses unchanged file objects");
    assert.equal(count(view, A), 1, "list polling did not retry the whole file");
    await view.open(B); await view.full(whole(1, { path: B })); await view.open(A);
    assert.equal(count(view, A), 2, "returning to A must recover without waiting for different metadata");
  } finally { await view.close(); }
});

test("successful retained contents refresh on a later visit without losing a pending draft", async () => {
  const view = await fixture();
  try {
    await view.list([patch(), patch(1, { path: B })]); await view.open(A);
    const previous = whole(); await view.full(previous);
    await act(async () => { view.visible().edit!.onChange("my pending draft\n"); });
    await view.open(B); await view.full(whole(1, { path: B }));
    assert.equal(count(view, A), 1, "hiding A does not fetch it");
    await view.open(A);
    assert.equal(count(view, A), 2, "a later visible visit refreshes even already loaded contents");
    assert.equal(view.visible().full, previous, "loaded display context remains during the request");
    assert.equal(view.visible().refreshStatus?.type, "updating");
    assert.equal(view.visible().edit, undefined, "stale full contents must not seed editing during refresh");
    await view.full(whole(2));
    assert.equal(view.visible().edit?.current(), "my pending draft\n", "refresh must preserve unsaved contents");
  } finally { await view.close(); }
});

test("ordinary renders and reselecting the visible path do not duplicate the initial request", async () => {
  const view = await fixture();
  try {
    await view.list([patch()]); await view.open(A);
    assert.equal(count(view, A), 1);
    await view.open(A); await view.direct({});
    assert.equal(count(view, A), 1, "an already visible pending load is not duplicated");
    await view.full(whole()); await view.open(A); await view.direct({});
    assert.equal(count(view, A), 1, "an already visible loaded file is not refreshed every render");
  } finally { await view.close(); }
});

test("binary files still skip whole-file requests on revisits", async () => {
  const view = await fixture();
  try {
    await view.list([patch(1, { binary: true, hunks: [] }), patch(1, { path: B })]); await view.open(A);
    assert.equal(count(view, A), 0);
    await view.open(B); await view.full(whole(1, { path: B })); await view.open(A);
    assert.equal(count(view, A), 0, "binary files are not eligible for full text loading");
  } finally { await view.close(); }
});

test("returning during an existing request waits for it, then refreshes only once for the new visit", async () => {
  const view = await fixture();
  try {
    await view.list([patch(), patch(1, { path: B })]); await view.open(A);
    await view.open(B); await view.full(whole(1, { path: B })); await view.open(A);
    assert.equal(count(view, A), 1, "the in-flight request must not be duplicated");
    const previous = whole(); await view.full(previous);
    assert.equal(count(view, A), 2, "the unhandled new visit is refreshed after the pending request settles");
    const latest = whole(2); await view.full(latest);
    assert.equal(count(view, A), 2, "settling the revisit request must not cause a fetch loop");
    assert.equal(view.visible().full, latest);
  } finally { await view.close(); }
});

test("filtering out and revealing the same selected file is not another path visit", async () => {
  const view = await fixture();
  try {
    await view.list([patch()]); await view.open(A); await view.full(whole());
    await view.filter("no-such-file");
    assert.equal(view.state().noMatchingFiles, true);
    await view.filter("");
    assert.equal(view.state().selected?.path, A);
    assert.equal(count(view, A), 1, "visibility changes without path selection do not refresh again");
  } finally { await view.close(); }
});

test("a failed revisit makes one request per later visit, not an automatic retry loop", async () => {
  const view = await fixture();
  try {
    await view.list([patch(), patch(1, { path: B })]); await view.open(A); await view.full(whole());
    await view.open(B); await view.full(whole(1, { path: B })); await view.open(A);
    assert.equal(count(view, A), 2);
    await view.fail(A); await view.direct({});
    assert.equal(count(view, A), 2, "failure alone does not retry without another visit");
    assert.equal(view.visible().refreshStatus?.type, "failed");
    await view.open(B); await view.open(A);
    assert.equal(count(view, A), 3, "a later distinct visit can retry again");
  } finally { await view.close(); }
});

test("a hidden file's pending request may settle without being cancelled by visibility alone", async () => {
  const view = await fixture();
  try {
    await view.list([patch(), patch(1, { path: B })]); await view.open(A);
    await view.open(B);
    const hidden = whole(); await view.full(hidden); await view.full(whole(1, { path: B }));
    assert.equal(count(view, A), 1, "hiding did not restart the request");
    await view.open(A);
    assert.equal(view.visible().full, hidden, "hidden settlement remains retained display context");
    assert.equal(count(view, A), 2, "the next actual path visit refreshes it");
  } finally { await view.close(); }
});
