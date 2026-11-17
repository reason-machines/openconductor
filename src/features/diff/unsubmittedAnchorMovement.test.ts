import * as Pierre from "@pierre/diffs";
import { TextDocument } from "@pierre/diffs/edit";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { LineAnchor, LineRange } from "./FileDiffView.tsx";
import type { useReviewComments } from "./ReviewComments.tsx";
import type { DiffComment } from "./comments.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

// Real review hook + viewer + navigation and Pierre's document/annotation mapper.
// CodeView geometry, chrome and IO are explicit deterministic boundaries, not DOM/native proof.
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const { applyDocumentChangeToLineAnnotations } = await import(new URL("../editor/lineAnnotations.js", import.meta.resolve("@pierre/diffs/edit")).href);
const root = resolve(".");
const product = new Set(["ReviewComments.tsx", "FileDiffView.tsx", "CommentNav.tsx", "nav.ts", "pierre.ts", "comments.ts", "commentStore.ts"].map((name) => resolve(root, "src/features/diff", name)));
const original = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
const full: FileDiff = {
  path: "example.txt", old_path: null, status: "modified", binary: false, additions: 60, deletions: 60,
  hunks: [{ old_start: 1, new_start: 1, old_lines: 60, new_lines: 60, section: "", lines: [
    ...original.trimEnd().split("\n").map((text, i) => ({ kind: "deletion" as const, old_line: i + 1, new_line: null, text: `old ${text}` })),
    ...original.trimEnd().split("\n").map((text, i) => ({ kind: "addition" as const, old_line: null, new_line: i + 1, text })),
  ] }],
};
const draftRange: LineRange = { side: "new", start: 3, line: 5 };
const body = "  unsubmitted draft\nkeep exact spaces  ";
type Review = ReturnType<typeof useReviewComments>;
type Mapped = { lineNumber: number; metadata: LineAnchor; side?: string };

async function fixture(layout: DiffLayout, { editing = true, shared = false, later = true } = {}) {
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const storage = new Map<string, string>();
  const kv = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const writes: string[] = [];
  const saves: string[] = [];
  const scrolls: Array<{ lineNumber: number; side?: string }> = [];
  const commands = new Map<string, () => boolean>();
  const listeners = new Set<(top: number, view: unknown) => void>();
  let scrollTop = 0;
  const measured = {
    getTopForItem: () => 0,
    getRenderedItems: () => [{ id: full.path, type: layout === "file" ? "file" : "diff", instance: { getLinePosition: (line: number) => ({ top: line * 20, height: 20 }) } }],
    getContainerElement: () => ({ scrollTop, clientHeight: 200 }),
    subscribeToScroll: (fn: (top: number, view: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const document = new TextDocument(full.path, original);
  const CodeView = React.forwardRef((props: { items: Array<{ annotations: Mapped[] }>; renderAnnotation: (annotation: Mapped) => unknown }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ getInstance: () => measured, scrollTo: (target: typeof scrolls[number]) => scrolls.push(target), getEditor: () => ({ getFile: () => ({ contents: document.getText() }) }) }), []);
    return React.createElement("code-view", props, props.items[0].annotations.map((annotation, i) => React.createElement("annotation", { key: i }, props.renderAnnotation(annotation))));
  });
  const passthrough = ({ children }: { children: unknown }) => children;
  let store: { list: () => Promise<DiffComment[]>; add: (comment: DiffComment) => Promise<void>; updateAnchors: (updates: unknown[]) => Promise<void> };
  function load(filename: string): Record<string, unknown> {
    assert.ok(product.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename); if (cached) return cached.exports;
    const module = { exports: {} }; modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_UNSUBMITTED_REF
      ? execFileSync("git", ["show", `${process.env.DIFF_UNSUBMITTED_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const js = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return { CodeView, EditProvider: passthrough };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => false, openUrl: () => assert.fail("No external links") };
      if (name === "@tauri-apps/api/core") return { invoke: () => assert.fail("No IPC") };
      if (name === "./commentsApi.ts") return { commentStoreFor: () => store };
      if (name === "./copyFile.ts") return { copySource: () => null };
      if (name === "./EditInViewer.ts") return { createEditor: () => assert.fail("No DOM editor") };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "github-dark" };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return {
        useKeybindings: (bound: Record<string, () => boolean>, priority = 0) => {
          // Only the real high-priority in-file navigation overrides cross-file stepping.
          React.useEffect(() => { if (!priority) return; for (const [key, fn] of Object.entries(bound)) commands.set(key, fn); return () => { for (const key of Object.keys(bound)) commands.delete(key); }; });
        },
        useKeybindingOverrides: () => ({ overrides: {} }),
      };
      if (name === "../../keybindings/dispatcher.ts") return { PRIORITY: { HIGH: 10 } };
      if (name === "../../keybindings/overrides.ts") return { effectiveShortcuts: (id: string) => id === "editor.saveFile" ? [{}] : [] };
      if (name === "../../keybindings/shortcut.ts") return { glyphs: () => "" };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: passthrough };
      if (name === "../../components/DialogFrame") return { DialogFrame: () => null };
      if (name === "../../components/Icons.tsx") return { CheckIcon: () => null, CopyIcon: () => null };
      if (name === "./Whitespace") return { WhitespaceOnly: () => null };
      if (name === "./DiscardDialog") return { RevertIcon: () => null };
      if (name === "./FilePathChip") return { FilePathChip: () => null };
      if (name === "./commentMarkdown.ts") return { CommentMarkdown: () => null };
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => product.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`); return load(resolved);
    }
    runInNewContext(`(function(require,module,exports){\n${js}\n})`, {
      console, Map, Set, crypto: { randomUUID }, localStorage: kv,
      document: { documentElement: { dataset: { theme: "dark" } } },
      MutationObserver: class { observe() {} disconnect() {} },
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const stores = load(resolve(root, "src/features/diff/commentStore.ts"));
  const comments = load(resolve(root, "src/features/diff/comments.ts"));
  assert.ok(typeof stores.localCommentStore === "function" && typeof comments.newLocalComment === "function");
  const local = stores.localCommentStore(kv, "workspace");
  store = { ...local,
    add: async (comment: DiffComment) => { writes.push("add"); await local.add(comment); },
    updateAnchors: async (updates: unknown[]) => { writes.push("anchors"); await local.updateAnchors(updates); },
  };
  const newLocalComment = comments.newLocalComment;
  const seed = (id: string, line: number) => newLocalComment({ id, workspaceId: "workspace", filePath: full.path, side: "new", start: line, end: line, body: id, now: 1 });
  if (later) await local.add(seed("later", 30));
  if (shared) await local.add(seed("shared", 5));
  const { FileDiffView } = load(resolve(root, "src/features/diff/FileDiffView.tsx"));
  const { useReviewComments: hook } = load(resolve(root, "src/features/diff/ReviewComments.tsx"));
  assert.ok(typeof hook === "function");
  const useReview = hook as typeof useReviewComments;
  let review: Review;
  const chat = { insert() { assert.fail("No chat insertion"); }, send() { assert.fail("No send"); }, attach() { assert.fail("No handoff"); } };
  function Harness() {
    review = useReview("workspace", chat);
    return React.createElement(FileDiffView, {
      file: full, full, layout, ignoreWhitespace: false, wrapLines: false, viewed: false, onToggleViewed() {},
      anchors: review.anchors(full), annotations: (anchor: LineAnchor) => review.annotations(full, anchor),
      onPersistAnchors: (positions: ReadonlyMap<string, number | null>) => review.persistAnchors(full, positions),
      edit: editing ? { current: () => document.getText(), onChange() {}, onSave: (contents: string) => saves.push(contents), dirty: true, generation: 0 } : undefined,
    });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const code = () => renderer.root.findByType("code-view");
  const inputs = () => renderer.root.findAllByType("textarea");
  const input = () => { assert.equal(inputs().length, 1); return inputs()[0]; };
  const action = (label: string) => { const button = renderer.root.findAllByType("button").find((b: { props: { children: unknown } }) => b.props.children === label); assert.ok(button, `Missing ${label}`); return button; };
  let live: Mapped[] | undefined;
  const edit = async (range: { start: { line: number; character: number }; end: { line: number; character: number } }, newText: string) => {
    const change = document.applyEdits([{ range, newText }]); assert.ok(change);
    live = applyDocumentChangeToLineAnnotations(change, live ?? code().props.items[0].annotations) as Mapped[];
    assert.ok(code().props.onItemEditChange, "Real viewer must enable editing");
    await act(async () => code().props.onItemEditChange({ file: { contents: document.getText() }, lineAnnotations: live }));
  };
  return {
    writes, saves, scrolls, rows: () => local.list(), anchors: () => review.anchors(full),
    value: () => input().props.value,
    async open() { await act(async () => review.onLineClick(full, draftRange)); },
    async body(value = body) { await act(async () => input().props.onChange({ target: { value } })); },
    async cancel() { await act(async () => action("Cancel").props.onClick()); },
    async submit() { await act(async () => action("Comment").props.onClick()); },
    counts: () => {
      const nav = renderer.root.findAll((n: { type: unknown; props: Record<string, unknown> }) => typeof n.type === "function" && "previousCount" in n.props && "navigate" in n.props);
      assert.equal(nav.length, 1); return { previous: nav[0].props.previousCount, next: nav[0].props.nextCount };
    },
    next() { const fn = commands.get("diff.nextComment"); assert.ok(fn); return fn(); },
    async insert() { await edit({ start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, "inserted\n".repeat(20)); },
    async undoInsert() { await edit({ start: { line: 1, character: 0 }, end: { line: 21, character: 0 } }, ""); },
    async remove() { await edit({ start: { line: 1, character: 0 }, end: { line: 61, character: 0 } }, ""); },
    async refresh(top = scrollTop) { scrollTop = top; await act(async () => { code().props.options.onPostRender(); for (const fn of listeners) fn(top, measured); }); },
    async complete() { await act(async () => assert.equal(code().props.onItemEditComplete({ lineAnnotations: live }), "accept")); },
    async close() { await act(async () => renderer.unmount()); assert.equal(listeners.size, 0); },
  };
}

for (const layout of ["unified", "split", "file"] as const) {
  test(`${layout}: unchanged draft body and original navigation are stable`, async () => {
    const f = await fixture(layout); try {
      await f.open(); await f.body(); await f.refresh();
      assert.equal(f.value(), body); assert.deepEqual(f.counts(), { previous: 0, next: 1 });
      assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 30); assert.deepEqual(f.writes, []);
    } finally { await f.close(); }
  });
  test(`${layout}: unsubmitted draft follows live movement before save`, async () => {
    const f = await fixture(layout); try {
      await f.open(); await f.body(); await f.insert(); await f.refresh();
      assert.equal(f.value(), body); assert.deepEqual(f.writes, []); assert.deepEqual(f.saves, []);
      assert.deepEqual(f.counts(), { previous: 0, next: 2 }); assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 25);
    } finally { await f.close(); }
  });
  test(`${layout}: deleted unsubmitted draft is not a live navigation target`, async () => {
    const f = await fixture(layout, { later: false }); try {
      await f.open(); await f.body(); await f.remove(); await f.refresh(500);
      assert.deepEqual(f.writes, []); assert.deepEqual(f.counts(), { previous: 0, next: 0 }); assert.equal(f.next(), false);
    } finally { await f.close(); }
  });
  test(`${layout}: Undo restores original draft navigation without persistence`, async () => {
    const f = await fixture(layout); try {
      await f.open(); await f.body(); await f.insert(); await f.undoInsert(); await f.refresh();
      assert.equal(f.value(), body); assert.deepEqual(f.counts(), { previous: 0, next: 1 }); assert.equal(f.next(), true);
      assert.equal(f.scrolls.at(-1)?.lineNumber, 30); assert.deepEqual(f.writes, []);
    } finally { await f.close(); }
  });
  test(`${layout}: completion shifts unsubmitted range once and preserves shared stored thread`, async () => {
    const f = await fixture(layout, { shared: true }); try {
      await f.open(); await f.body(); await f.insert();
      await f.complete(); await f.refresh();
      assert.equal(f.value(), body); assert.equal(f.anchors().filter((a) => a.side === "new").length, 2, "draft must remain grouped with its shared-line thread");
      assert.equal(f.anchors().find((a) => a.commentIds?.includes("shared"))?.line, 25);
      await f.submit();
      const row = (await f.rows()).find((r: DiffComment) => r.body === body.trim()); assert.ok(row);
      assert.equal(row.line_number, 23); assert.equal(row.end_line_number, 25);
      await f.complete();
      const again = (await f.rows()).find((r: DiffComment) => r.id === row.id); assert.equal(again.line_number, 23); assert.equal(again.end_line_number, 25);
    } finally { await f.close(); }
  });
  test(`${layout}: submit transfers the live draft target without resetting movement`, async () => {
    const f = await fixture(layout); try {
      await f.open(); await f.body(); await f.insert(); await f.submit(); await f.refresh();
      assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 25, "submitting must not replace the live mapping identity");
      assert.deepEqual(f.writes, ["add"]);
      await f.complete(); const row = (await f.rows()).find((r: DiffComment) => r.body === body.trim()); assert.ok(row);
      assert.equal(row.line_number, 23); assert.equal(row.end_line_number, 25);
    } finally { await f.close(); }
  });
  test(`${layout}: cancel and new UUID do not inherit a removed draft's movement`, async () => {
    const f = await fixture(layout); try {
      await f.open(); await f.insert(); await f.cancel(); await f.open(); await f.body(); await f.refresh();
      assert.equal(f.value(), body); assert.deepEqual(f.counts(), { previous: 0, next: 1 }); assert.deepEqual(f.writes, []);
    } finally { await f.close(); }
  });
  test(`${layout}: read-only original-anchor controls stay unchanged`, async () => {
    const f = await fixture(layout, { editing: false }); try {
      await f.open(); await f.body(); await f.refresh(); assert.deepEqual(f.counts(), { previous: 0, next: 1 });
      assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 30); assert.deepEqual(f.writes, []);
    } finally { await f.close(); }
  });
}
