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
  "src/features/diff/EditInViewer.ts", "src/features/diff/editable.ts", "src/features/diff/editorContents.ts",
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
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
      if (name === "./useChangesPresentation.ts") return {
        useChangesPresentation: () => ({ presentation: { filePathFilter: "", diffFileListMode: "flat" } }),
      };
      if (name === "./FileDiffView") return { FileDiffView: (props: ViewProps) => React.createElement("diff-view", props) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => assert.fail("Unrelated discard dialog") };
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

async function loaded() {
  const view = await fixture();
  const file = patch(); const full = whole();
  await view.list([file]); await view.open(); await view.full(full);
  assert.equal(view.visible().full, full);
  assert.equal(view.visible().edit?.current(), "unchanged prefix\nrevision 1\nunchanged suffix\n");
  return { view, file, full };
}

test("a same-file revision retains loaded whole-file context while the background refresh is pending", async () => {
  const { view, full } = await loaded();
  try {
    const next = patch(2);
    await view.refresh([next]);
    assert.equal(view.state().selected, next, "the real list loader selected a new FileDiff object");
    assert.equal(view.visible().file, next);
    assert.equal(view.visible().full, full, "keep prior context instead of falling back to a partial patch");
    assert.equal(view.visible().edit, undefined, "retained context must not seed an editor with stale contents");
    const replacement = whole(2); await view.full(replacement);
    assert.equal(view.visible().full, replacement);
    assert.equal(view.visible().edit?.current(), "unchanged prefix\nrevision 2\nunchanged suffix\n");
  } finally { await view.close(); }
});

test("a rejected same-file refresh keeps prior whole-file data without making it editable", async () => {
  const { view, full } = await loaded();
  try {
    await view.refresh([patch(2)]); await view.fail();
    assert.equal(view.visible().full, full, "a transient rejected refresh must not discard loaded context");
    assert.equal(view.visible().edit, undefined);
    await view.refresh([patch(3)]); const recovered = whole(3); await view.full(recovered);
    assert.equal(view.visible().full, recovered, "a later poll retries and accepts fresh contents");
    assert.ok(view.visible().edit);
  } finally { await view.close(); }
});

test("an unchanged selected revision survives object replacement when another file changes, then refresh rejects", async () => {
  const { view, file, full } = await loaded();
  try {
    const equivalent = patch();
    await view.refresh([equivalent, patch(2, { path: "src/other.ts" })]);
    assert.notEqual(view.state().selected, file);
    assert.deepEqual(view.state().selected, file, "only another file changed, not the selected logical file or revision");
    await view.fail();
    assert.equal(view.visible().full, full, "an equivalent replacement must not discard loaded context on rejection");
    assert.equal(view.visible().edit, undefined, "the rejected verification cannot turn retained data into writable current contents");
  } finally { await view.close(); }
});

test("an identical background list result reuses the selected object without a redundant full load", async () => {
  const { view, file, full } = await loaded();
  try {
    const before = view.requests.filter((entry) => entry.request.path !== null).length;
    await view.refresh([patch()]);
    assert.equal(view.state().selected, file);
    assert.equal(view.visible().full, full);
    assert.ok(view.visible().edit);
    assert.equal(view.requests.filter((entry) => entry.request.path !== null).length, before);
  } finally { await view.close(); }
});

test("an initial whole-file failure stays a non-editable partial diff", async () => {
  const view = await fixture();
  try {
    await view.list([patch()]); await view.open(); await view.fail();
    assert.equal(view.visible().full, null); assert.equal(view.visible().edit, undefined);
  } finally { await view.close(); }
});

for (const outcome of ["success", "failure"] as const) {
  test(`a superseded whole-file ${outcome} cannot replace a newer same-file result`, async () => {
    const view = await fixture();
    try {
      await view.list([patch()]); await view.open();
      const first = view.requests.at(-1)!;
      await view.refresh([patch(2)]); const newest = whole(2); await view.full(newest);
      await act(async () => { if (outcome === "success") first.finish([whole()]); else first.fail(); });
      assert.equal(view.visible().full, newest); assert.ok(view.visible().edit);
    } finally { await view.close(); }
  });
}

test("switching to a different file never displays the previous file's full contents", async () => {
  const { view } = await loaded();
  try {
    await view.refresh([patch(), patch(1, { path: "src/other.ts" })]); await view.open("src/other.ts");
    assert.equal(view.visible().full, null); await view.fail("src/other.ts");
    assert.equal(view.visible().full, null); assert.equal(view.visible().edit, undefined);
  } finally { await view.close(); }
});

const identityChanges: Array<[string, (state: WorkspaceDiff) => Partial<WorkspaceDiff>]> = [
  ["worktree", () => ({ worktree: "/other-repo" })],
  ["target branch", (state) => ({ target: { ...state.target, branch: "release" } })],
  ["target remote", (state) => ({ target: { ...state.target, remote: "upstream" } })],
  ["scope", (state) => ({ opts: { ...state.opts, scope: "uncommitted" } })],
  ["commit", (state) => ({ opts: { ...state.opts, scope: { type: "commit", commitHash: "abc" } } })],
  ["turn", () => ({ turn: { sessionId: "chat", turnId: "turn" } })],
  ["whitespace mode", (state) => ({ opts: { ...state.opts, ignoreWhitespace: true } })],
  ["rename origin", (state) => { const next = { ...state.selected!, old_path: "src/before.ts" }; return { files: [next], selected: next }; }],
  ["status", (state) => { const next = { ...state.selected!, status: "added" as const }; return { files: [next], selected: next }; }],
];
for (const [name, change] of identityChanges) {
  test(`a changed ${name} is a different logical diff, not a same-file refresh`, async () => {
    const { view } = await loaded();
    try {
      await view.direct(change(view.state()));
      assert.equal(view.visible().full, null, "never carry loaded contents across a logical identity change");
      assert.equal(view.visible().edit, undefined);
      await view.fail(); assert.equal(view.visible().full, null);
    } finally { await view.close(); }
  });
}
