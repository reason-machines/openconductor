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
import type { DiffLayout, FileDiff } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const { applyDocumentChangeToLineAnnotations } = await import(new URL("../editor/lineAnnotations.js", import.meta.resolve("@pierre/diffs/edit")).href);
const root = resolve(".");
const product = new Set(["FileDiffView.tsx", "CommentNav.tsx", "nav.ts", "pierre.ts"].map((name) => resolve(root, "src/features/diff", name)));
const original = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
const full: FileDiff = {
  path: "example.txt", old_path: null, status: "modified", binary: false, additions: 60, deletions: 60,
  hunks: [{ old_start: 1, new_start: 1, old_lines: 60, new_lines: 60, section: "", lines: [
    ...original.trimEnd().split("\n").map((text, i) => ({ kind: "deletion" as const, old_line: i + 1, new_line: null, text: `old ${text}` })),
    ...original.trimEnd().split("\n").map((text, i) => ({ kind: "addition" as const, old_line: null, new_line: i + 1, text })),
  ] }],
};

type Mapped = { lineNumber: number; metadata: LineAnchor; side?: string };
async function fixture(layout: DiffLayout, editing = true) {
  const anchors: LineAnchor[] = [
    { side: "new", line: 5, commentIds: ["moving"] },
    { side: "new", line: 30, commentIds: ["later"] },
    ...(layout === "file" ? [] : [{ side: "old" as const, line: 8, commentIds: ["old"] }]),
  ];
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const scrolls: Array<{ lineNumber: number; side?: string; offset: number; align: string; behavior: string }> = [];
  const persisted: unknown[] = [];
  const commands = new Map<string, () => boolean>();
  const listeners = new Set<(top: number, view: unknown) => void>();
  const measured = {
    getTopForItem: () => 0,
    getRenderedItems: () => [{ id: full.path, type: layout === "file" ? "file" : "diff", instance: {
      getLinePosition: (line: number) => ({ top: line * 20, height: 20 }),
    } }],
    getContainerElement: () => ({ scrollTop: 0, clientHeight: 200 }),
    subscribeToScroll: (fn: (top: number, view: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const handle = { getInstance: () => measured, scrollTo: (target: typeof scrolls[number]) => scrolls.push(target) };
  const CodeView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => handle, []);
    return React.createElement("code-view", props);
  });
  const passthrough = ({ children }: { children: unknown }) => children;
  function load(filename: string): Record<string, unknown> {
    assert.ok(product.has(filename), `Unexpected production dependency: ${filename}`);
    const cached = modules.get(filename); if (cached) return cached.exports;
    const module = { exports: {} }; modules.set(filename, module);
    const relative = filename.slice(root.length + 1);
    const source = process.env.DIFF_Q07_REF
      ? execFileSync("git", ["show", `${process.env.DIFF_Q07_REF}:${relative}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const js = ts.transpileModule(source, { fileName: filename, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    function require(name: string): unknown {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@pierre/diffs") return Pierre;
      if (name === "@pierre/diffs/react") return { CodeView, EditProvider: passthrough };
      if (name.endsWith(".css")) return {};
      if (name === "../../backend") return { inTauri: () => false };
      if (name === "@tauri-apps/api/core") return { invoke: () => assert.fail("No IPC in navigation fixture") };
      if (name === "./copyFile.ts") return { copySource: () => null };
      if (name === "./EditInViewer.ts") return { createEditor: () => assert.fail("No DOM editor in fixture") };
      if (name === "./useDiffTheme.ts") return { useDiffTheme: () => "github-dark" };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return {
        useKeybindings: (bound: Record<string, () => boolean>) => {
          React.useEffect(() => { for (const [key, fn] of Object.entries(bound)) commands.set(key, fn); return () => { for (const key of Object.keys(bound)) commands.delete(key); }; });
        },
        useKeybindingOverrides: () => ({ overrides: {} }),
      };
      if (name === "../../keybindings/dispatcher.ts") return { PRIORITY: { HIGH: 10 } };
      if (name === "../../keybindings/overrides.ts") return { effectiveShortcuts: () => [] };
      if (name === "../../keybindings/shortcut.ts") return { glyphs: () => "" };
      if (name === "../../components/ui/Tooltip.tsx") return { Tooltip: passthrough };
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
      console, Map, Set,
      document: { documentElement: { dataset: { theme: "dark" } } },
      MutationObserver: class { observe() {} disconnect() {} },
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { FileDiffView } = load(resolve(root, "src/features/diff/FileDiffView.tsx"));
  let renderer: ReturnType<typeof create>;
  const edit = { current: () => original, onChange: () => {}, onSave: () => assert.fail("No save before navigation"), dirty: true, generation: 0 };
  await act(async () => { renderer = create(React.createElement(FileDiffView, {
    file: full, full, layout, ignoreWhitespace: false, wrapLines: false, viewed: false, onToggleViewed() {}, anchors,
    edit: editing ? edit : undefined, onPersistAnchors: (positions: unknown) => persisted.push(positions),
  })); });
  const code = () => renderer.root.findByType("code-view");
  const next = () => { const fn = commands.get("diff.nextComment"); assert.ok(fn); return fn(); };
  return {
    anchors, scrolls, persisted, next,
    counts: () => {
      const components = renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === "function" && "previousCount" in node.props && "navigate" in node.props);
      assert.equal(components.length, 1); return { previous: components[0].props.previousCount, next: components[0].props.nextCount };
    },
    async moved() {
      const document = new TextDocument(full.path, original);
      const change = document.applyEdits([{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "inserted\n".repeat(20) }]);
      assert.ok(change);
      const mapped = applyDocumentChangeToLineAnnotations(change, code().props.items[0].annotations) as Mapped[];
      assert.equal(mapped.find((a) => a.metadata.commentIds?.[0] === "moving")?.lineNumber, 25);
      await act(async () => code().props.onItemEditChange({ file: { contents: document.getText() }, lineAnnotations: mapped }));
      await this.refresh();
    },
    async removed() {
      const document = new TextDocument(full.path, original);
      const change = document.applyEdits([{ range: { start: { line: 1, character: 0 }, end: { line: 61, character: 0 } }, newText: "" }]);
      assert.ok(change);
      const mapped = applyDocumentChangeToLineAnnotations(change, code().props.items[0].annotations) as Mapped[];
      assert.ok(mapped.every((a) => a.metadata.side === "old"), "real mapper removes deleted additions but preserves deletion-side annotations");
      await act(async () => code().props.onItemEditChange({ file: { contents: document.getText() }, lineAnnotations: mapped }));
      await this.refresh();
    },
    async refresh() { await act(async () => { code().props.options.onPostRender(); for (const fn of listeners) fn(0, measured); }); },
    async close() { await act(async () => renderer.unmount()); assert.equal(listeners.size, 0); },
  };
}

for (const layout of ["unified", "split", "file"] as const) {
  test(`${layout}: unchanged anchors/counts/navigation are stable`, async () => {
    const f = await fixture(layout, false);
    try { assert.deepEqual(f.counts(), { previous: 0, next: 1 }); assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 30); assert.equal(f.persisted.length, 0); }
    finally { await f.close(); }
  });
  test(`${layout}: unsaved mapped anchors drive counts and next target`, async () => {
    const f = await fixture(layout);
    try {
      await f.moved();
      assert.equal(f.anchors[0].line, 5, "persisted metadata is unchanged until save");
      assert.equal(f.persisted.length, 0);
      assert.deepEqual(f.counts(), { previous: 0, next: 2 }, "moved line 25 now falls below the visible band");
      assert.equal(f.next(), true); assert.equal(f.scrolls.at(-1)?.lineNumber, 25, "navigate to live line, not saved line 30");
      assert.equal(f.scrolls.at(-1)?.offset, 56); assert.equal(f.scrolls.at(-1)?.align, "start"); assert.equal(f.scrolls.at(-1)?.behavior, "smooth");
    } finally { await f.close(); }
  });
  test(`${layout}: removed unsaved anchors do not remain navigation targets`, async () => {
    const f = await fixture(layout);
    try { await f.removed(); assert.equal(f.persisted.length, 0); assert.deepEqual(f.counts(), { previous: 0, next: 0 }); assert.equal(f.next(), false); assert.equal(f.scrolls.length, 0); }
    finally { await f.close(); }
  });
}
