import * as Pierre from "@pierre/diffs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { bindCommands, type CommandHandlers } from "../../keybindings/bind.ts";
import { createDispatcher } from "../../keybindings/dispatcher.ts";
import type { DiffLayout, FileDiff } from "./types.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";

// Real React DiffTab -> useFileEdit -> FileDiffView. No rendered DOM/editor/IPC.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const allowed = new Set([
  "DiffViewer.tsx", "FileDiffView.tsx", "EditInViewer.ts", "editable.ts", "editorContents.ts", "draftStorage.ts", "pierre.ts", "copyFile.ts",
].map((name) => resolve(root, "src/features/diff", name)));
const key = { key: "e", code: "KeyE", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
const focus = { typing: false, inTerminal: false, activeDialogId: null };
const noop = () => {};
const file: FileDiff = {
  path: "example.ts", old_path: null, status: "modified", binary: false, additions: 1, deletions: 1,
  hunks: [{ old_start: 1, new_start: 1, old_lines: 1, new_lines: 1, section: "", lines: [
    { kind: "deletion", old_line: 1, new_line: null, text: "old" },
    { kind: "addition", old_line: null, new_line: 1, text: "new" },
  ] }],
};
type Kind = "code" | "history" | "turn" | "binary" | "deleted" | "metadata" | "loading" | "preview";

async function fixture(layout: DiffLayout, kind: Kind) {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map<string, string>();
  const dispatcher = createDispatcher();
  const writes: string[] = [];
  const selected: FileDiff = { ...file, ...(kind === "preview" ? { path: "example.md" } : {}),
    ...(kind === "binary" ? { binary: true, hunks: [] } : {}),
    ...(kind === "deleted" ? { status: "deleted" as const } : {}),
    ...(kind === "metadata" ? { hunks: [] } : {}),
  };
  const pending: Array<{ finish: (file: FileDiff) => void }> = [];
  const passthrough = ({ children }: { children: unknown }) => children;
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename); if (cached) return cached.exports;
    const module = { exports: {} }; modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_READONLY_EDIT_REF
      ? execFileSync("git", ["show", `${process.env.DIFF_READONLY_EDIT_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const js = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return { CodeView: React.forwardRef((props: unknown, _ref: unknown) => React.createElement("code-view", props)), EditProvider: passthrough };
      if (name === "@pierre/diffs/edit") return { Editor: class { constructor() { assert.fail("No real DOM editor in fixture"); } } };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => true };
      if (name === "@tauri-apps/api/core") return { invoke: (command: string) => { writes.push(command); assert.fail(`No IPC expected: ${command}`); } };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return {
        useKeybindingOverrides: () => ({ overrides: {} }),
        useKeybindings: (handlers: CommandHandlers) => React.useEffect(() => bindCommands(dispatcher, handlers), [handlers]),
      };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "github-dark" };
      if (name === "./CommentNav") return { CommentNav: () => null, useCommentNavigation: () => ({ refresh: noop }) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => null, RevertIcon: () => null };
      if (name === "./FilePathChip") return { FilePathChip: () => null };
      if (name === "./Whitespace") return { ViewOptionsMenu: () => null, WhitespaceOnly: () => null };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: () => null };
      if (name === "../../components/ConductorIcon") return { ConductorIcon: () => null };
      if (name === "../../components/Icons.tsx") return { CopyIcon: () => null, CheckIcon: () => null };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: passthrough };
      // Save-shortcut utilities are unrelated to edit-mode dispatch in this fixture.
      if (name === "../../keybindings/overrides.ts") return { effectiveShortcuts: () => [] };
      if (name === "../../keybindings/shortcut.ts") return { matchesEvent: () => false };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`); return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${js}\n})`, {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
      document: { documentElement: { dataset: { theme: "dark" } } }, MutationObserver: class { observe() {} disconnect() {} },
      setTimeout, clearTimeout, console,
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { DiffTab } = load(resolve(root, "src/features/diff/DiffViewer.tsx"));
  assert.ok(typeof DiffTab === "function");
  const diff = {
    selected, files: [selected], load: { state: "ready", files: [selected] }, redirectRevision: 0,
    turn: kind === "turn" ? { sessionId: "session", turnId: "turn" } : null,
    opts: { layout, ignoreWhitespace: false, wrapLines: false, scope: kind === "history" ? { commit: "abc" } : "uncommitted" },
    worktree: "/repo", target: { branch: "main", remote: null }, noMatchingFiles: false,
    loadFull: () => new Promise<FileDiff>((finish) => pending.push({ finish })), reloadQuietly: noop,
    isViewed: () => false, toggleViewed: noop, canDiscard: false, unread: -1, current: 0, update: noop,
  } as unknown as WorkspaceDiff;
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(DiffTab, { diff })); });
  if (kind !== "loading") await act(async () => { for (const request of pending) request.finish(selected); });
  const buttons = () => renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && ["Edit", "View read-only"].includes(String(node.props["aria-label"])));
  const code = () => renderer.root.findByType("code-view").props;
  return {
    buttons, code, writes, dispatcher,
    preview: () => renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && ["Show source", "Show preview"].includes(String(node.props["aria-label"]))),
    async dispatch() { let result: ReturnType<typeof dispatcher.dispatch>; await act(async () => { result = dispatcher.dispatch(key, focus); }); return result!; },
    async toggle() { await act(async () => { assert.equal(buttons().length, 1); buttons()[0].props.onClick(); }); },
    async ready() { await act(async () => { for (const request of pending) request.finish(selected); }); },
    async close() { await act(async () => renderer.unmount()); assert.equal(dispatcher.handlers().length, 0); },
  };
}

for (const layout of ["unified", "split", "file"] as const) {
  for (const kind of ["history", "turn", "binary", "deleted", "metadata"] as const) {
    test(`${layout}: ${kind} has no nonfunctional Edit button or edit-mode shortcut`, async () => {
      const f = await fixture(layout, kind); try {
        const observed = { editButtons: f.buttons().length, shortcut: (await f.dispatch()).kind };
        assert.deepEqual(observed, { editButtons: 0, shortcut: "pass" }, "read-only/ineligible file must neither offer Edit nor consume Cmd+E");
        assert.deepEqual(f.writes, []);
      } finally { await f.close(); }
    });
  }
  test(`${layout}: editable code retains pointer and shortcut read-only round trips`, async () => {
    const f = await fixture(layout, "code"); try {
      assert.equal(f.buttons().length, 1); assert.equal(f.buttons()[0].props["aria-label"], "View read-only");
      assert.equal(f.code().items[0].edit, true);
      await f.toggle(); assert.equal(f.buttons()[0].props["aria-label"], "Edit"); assert.notEqual(f.code().items[0].edit, true);
      assert.equal((await f.dispatch()).kind, "ran"); assert.equal(f.code().items[0].edit, true); assert.deepEqual(f.writes, []);
    } finally { await f.close(); }
  });
}
test("whole-file markdown preview retains its independent source/preview shortcut", async () => {
  const f = await fixture("file", "preview"); try {
    assert.equal(f.buttons().length, 0); assert.equal(f.preview().length, 1);
    assert.equal(f.preview()[0].props["aria-label"], "Show source");
    assert.equal((await f.dispatch()).kind, "ran");
    assert.equal(f.preview()[0].props["aria-label"], "Show preview");
    assert.equal((await f.dispatch()).kind, "ran");
    assert.equal(f.preview()[0].props["aria-label"], "Show source"); assert.deepEqual(f.writes, []);
  } finally { await f.close(); }
});

for (const layout of ["unified", "split"] as const) {
  test(`${layout}: loading full contents does not offer editing until ready`, async () => {
    const f = await fixture(layout, "loading"); try {
      const observed = { editButtons: f.buttons().length, shortcut: (await f.dispatch()).kind };
      assert.deepEqual(observed, { editButtons: 0, shortcut: "pass" });
      await f.ready(); assert.equal(f.buttons().length, 1); assert.equal(f.code().items[0].edit, true);
    } finally { await f.close(); }
  });
}
