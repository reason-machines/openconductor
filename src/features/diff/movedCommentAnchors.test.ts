import * as Pierre from "@pierre/diffs";
import { TextDocument } from "@pierre/diffs/edit";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { LineAnchor } from "./FileDiffView.tsx";
import type { DiffComment } from "./comments.ts";
import type { CommentStore } from "./commentStore.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const { applyDocumentChangeToLineAnnotations } = await import(new URL("../editor/lineAnnotations.js", import.meta.resolve("@pierre/diffs/edit")).href);
const root = resolve(".");
const product = new Set([
  "ReviewComments.tsx", "FileDiffView.tsx", "DiffViewer.tsx", "comments.ts", "commentStore.ts", "commentsApi.ts", "pierre.ts",
].map((name) => `src/features/diff/${name}`));
const allowed = new Set([
  ...product, "src/features/diff/EditInViewer.ts", "src/features/diff/editorContents.ts", "src/features/diff/editable.ts",
  "src/features/diff/copyFile.ts", "src/features/diff/nav.ts", "src/keybindings/overrides.ts",
  "src/keybindings/registry.ts", "src/keybindings/shortcut.ts", "src/keybindings/types.ts", "src/keybindings/fuzzy.ts",
].map((name) => resolve(root, name)));
const original = "heading\nmodified second\nthird\nfourth\nfifth\ntail\n";
let sequence = 0;

function fullFile(contents: string): FileDiff {
  const lines = contents.slice(0, -1).split("\n");
  const old = original.replace("modified second", "old second").slice(0, -1).split("\n");
  return { path: "example.txt", old_path: null, status: "modified", binary: false, additions: lines.length, deletions: old.length,
    hunks: [{ old_start: 1, new_start: 1, old_lines: old.length, new_lines: lines.length, section: "", lines: [
      ...old.map((text, index) => ({ kind: "deletion" as const, old_line: index + 1, new_line: null, text })),
      ...lines.map((text, index) => ({ kind: "addition" as const, old_line: null, new_line: index + 1, text })),
    ] }] };
}

async function fixture(layout: DiffLayout, native: boolean) {
  const workspace = `anchor-${++sequence}`;
  const storage = new Map<string, string>();
  const kv = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  let disk = original;
  let editorText = original;
  const writes: unknown[] = [];
  const timers = new Set<unknown>();
  let store: CommentStore;
  const CodeView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ getEditor: () => ({ getFile: () => ({ contents: editorText }) }) }), []);
    return React.createElement("code-view", props);
  });
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_ANCHORS_BASELINE && product.has(relative)
      ? execFileSync("git", ["show", `${process.env.DIFF_ANCHORS_BASELINE}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const javascript = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (["react", "react/jsx-runtime", "fuzzysort"].includes(name)) return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return { CodeView, EditProvider: ({ children }: { children: unknown }) => children };
      if (name === "@pierre/diffs/edit") return { Editor: class { constructor() { assert.fail("DOM editor is not admitted in this fixture"); } } };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => native, openUrl: () => assert.fail("unexpected external URL") };
      if (name === "@tauri-apps/api/core") return { invoke: async (command: string, args: Record<string, unknown>) => {
        if (command === "diff_comments_list") { assert.equal(args.workspaceId, workspace); return store.list(); }
        if (command === "diff_comments_update_anchors") {
          assert.equal(args.workspaceId, workspace);
          writes.push(args);
          assert.ok(Array.isArray(args.updates));
          return store.updateAnchors(args.updates);
        }
        if (command === "diff_write_file") {
          assert.equal(args.repo, workspace);
          assert.ok(typeof args.request === "object" && args.request !== null && "contents" in args.request);
          assert.equal(typeof args.request.contents, "string");
          disk = String(args.request.contents);
          return;
        }
        assert.fail(`Unexpected IPC: ${command}`);
      } };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return { useKeybindings: () => undefined, useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "github-dark" };
      if (name === "./CommentNav") return { CommentNav: () => null, useCommentNavigation: () => ({ previousCount: 0, nextCount: 0, refresh: () => undefined }) };
      if (name === "./ChangesList") return {};
      if (name === "./DiscardDialog") return { DiscardDialog: () => null, RevertIcon: () => null };
      if (name === "./FilePathChip") return { FilePathChip: () => null };
      if (name === "./Whitespace") return { ViewOptionsMenu: () => null, WhitespaceOnly: () => null };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: () => null };
      if (["../../components/ConductorIcon", "../../components/Icons.tsx"].includes(name)) return { ConductorIcon: () => null, CopyIcon: () => null, CheckIcon: () => null };
      if (name === "../../components/DialogFrame") return { DialogFrame: () => null };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: ({ children }: { children: unknown }) => children };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    }
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      localStorage: kv, console, Map, Set,
      document: { documentElement: { dataset: { theme: "dark" } } }, MutationObserver: class { observe() {} disconnect() {} },
      setInterval: (callback: unknown) => { timers.add(callback); return callback; }, clearInterval: (id: unknown) => timers.delete(id),
      setTimeout: (callback: unknown) => { timers.add(callback); return callback; }, clearTimeout: (id: unknown) => timers.delete(id),
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const comments = load(resolve(root, "src/features/diff/comments.ts"));
  const stores = load(resolve(root, "src/features/diff/commentStore.ts"));
  assert.ok(typeof stores.localCommentStore === "function" && typeof comments.newLocalComment === "function");
  store = stores.localCommentStore(kv, workspace);
  const base = { workspaceId: workspace, filePath: "example.txt", side: "new", start: 3, end: 5, body: "preserve this range", now: 1 };
  const local = comments.newLocalComment({ ...base, id: "local" });
  await store.add(local);
  await store.add(comments.newLocalComment({ ...base, id: "reply", replyTo: local }));
  await store.add({ ...comments.newLocalComment({ ...base, id: "remote" }), remote_url: "https://github.com/example/repo/pull/1#discussion_r1" });
  await store.add(comments.newLocalComment({ ...base, id: "old", side: "old" }));
  await store.add(comments.newLocalComment({ ...base, id: "file", fileLevel: true }));
  await store.add(comments.newLocalComment({ ...base, id: "other", filePath: "other.txt" }));
  const viewer = load(resolve(root, "src/features/diff/DiffViewer.tsx"));
  const reviewModule = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  const edits = load(resolve(root, "src/features/diff/EditInViewer.ts"));
  assert.ok(typeof viewer.DiffTab === "function" && typeof reviewModule.useReviewComments === "function");
  const DiffTab = viewer.DiffTab;
  const useReviewComments = reviewModule.useReviewComments;
  const chat = { insert() {}, send() {}, attach() {} };
  let review: ReturnType<typeof import("./ReviewComments.tsx")["useReviewComments"]>;
  function Harness() {
    const [file, setFile] = React.useState(() => fullFile(disk));
    const reload = React.useCallback(() => {
      if (!native) { const saved = edits.sampleSaves; assert.ok(saved instanceof Map); disk = saved.get("example.txt") ?? disk; }
      setFile(fullFile(disk));
    }, []);
    review = useReviewComments(workspace, chat);
    React.useEffect(() => review.onLoaded([file], "uncommitted"), [file]);
    return React.createElement(DiffTab, { diff: {
      selected: file, files: [file], load: { state: "ready", files: [file] }, redirectRevision: 0,
      turn: null, worktree: workspace, target: { branch: "main", remote: null }, opts: { scope: "uncommitted", layout, ignoreWhitespace: false, wrapLines: false },
      loadFull: async () => fullFile(disk), reloadQuietly: reload, isViewed: () => false, toggleViewed() {},
      loadText: async () => disk, unread: -1, current: 0, canDiscard: false, update() {},
    }, anchors: review.anchors, annotations: review.annotations, onPersistAnchors: review.persistAnchors });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const code = () => renderer.root.findByType("code-view");
  const item = () => code().props.items[0];
  assert.equal(item().edit, true, "real DiffTab must enable the production editor");
  let moved: Array<{ lineNumber: number; metadata: LineAnchor; side?: string }>;
  return {
    rows: () => store.list(), writes,
    async insert() {
      const document = new TextDocument("example.txt", original);
      const change = document.applyEdits([{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "inserted\n" }]);
      assert.ok(change);
      moved = applyDocumentChangeToLineAnnotations(change, item().annotations) ?? item().annotations;
      assert.ok(moved.some((a) => a.lineNumber === 6 && a.metadata.side === "new"), "Pierre's real annotation mapper moves the terminal line from 5 to 6");
      editorText = document.getText();
      await act(async () => code().props.onItemEditChange({ file: { contents: editorText }, lineAnnotations: moved }));
    },
    async save() {
      const wrapper = renderer.root.findByProps({ className: "oc-code-edit" });
      let prevented = false;
      await act(async () => wrapper.props.onKeyDown({ nativeEvent: { key: "s", code: "KeyS", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, preventDefault: () => { prevented = true; } }));
      assert.ok(prevented, "production Cmd+S handler consumes the shortcut");
      assert.equal(disk, editorText, "production save preserves the complete inserted document");
    },
    async complete() {
      await act(async () => assert.equal(code().props.onItemEditComplete({ lineAnnotations: moved }), "accept"));
    },
    anchorLine: () => review.anchors(fullFile(disk)).find((a) => a.side === "new")?.line,
    async remount() {
      await act(async () => renderer.unmount());
      await act(async () => { renderer = create(React.createElement(Harness)); });
    },
    async close() { await act(async () => renderer.unmount()); assert.equal(timers.size, 0); },
  };
}

for (const layout of ["unified", "split", "file"] as const) {
  for (const native of [false, true]) {
    for (const first of ["save", "complete"] as const) {
    test(`${layout} ${native ? "IPC adapter" : "local store"} ${first} keeps moved ranges through reload without double shifting`, async () => {
      const view = await fixture(layout, native);
      const range = (rows: DiffComment[], id: string) => { const row = rows.find((c) => c.id === id); assert.ok(row); return [row.line_number, row.end_line_number]; };
      try {
        await view.insert();
        assert.deepEqual(range(await view.rows(), "local"), [3, 5], "movement is pending before save");
        await view[first]();
        assert.deepEqual(range(await view.rows(), "local"), [4, 6], "persisted range follows editor annotation to lines 4-6");
        await view.save();
        assert.deepEqual(range(await view.rows(), "reply"), [4, 6], "replies at the same anchor follow the range");
        assert.equal(view.anchorLine(), 6, "review hook rebuilds its visible anchor at the saved line");
        await view.complete();
        await view.save();
        assert.deepEqual(range(await view.rows(), "local"), [4, 6], "save plus completion must not shift a range twice");
        await view.remount();
        assert.deepEqual(range(await view.rows(), "local"), [4, 6], "a new hook/store view reloads the persisted range");
        assert.equal(view.anchorLine(), 6);
        for (const id of ["remote", "old", "other"]) assert.deepEqual(range(await view.rows(), id), [3, 5], `${id} comment must not be moved`);
        assert.deepEqual(range(await view.rows(), "file"), [0, null]);
        if (native) assert.ok(view.writes.length > 0, "real commentsApi must emit the scoped absolute-anchor IPC request");
      } finally { await view.close(); }
    });
    }
  }
}
