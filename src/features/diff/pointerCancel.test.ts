import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import type { CodeViewLineSelection } from "@pierre/diffs";
import type { LineRange } from "./pierre.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const inert = () => null;
const CodeView = React.forwardRef((props: object, _ref: unknown) => React.createElement("fixture-code-view", props));
const sourcePath = resolve(process.env.POINTER_CANCEL_SOURCE_ROOT ?? ".", "src/features/diff/FileDiffView.tsx");
const source = readFileSync(sourcePath, "utf8");
const javascript = ts.transpileModule(source, {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const boundaries: Record<string, object> = {
  "../../components/ui/Tooltip.tsx": { Tooltip: inert },
  "../../components/Icons.tsx": { CheckIcon: inert, CopyIcon: inert },
  "@tauri-apps/api/core": { invoke() { throw new Error("Unexpected native IPC"); } },
  "../../backend": { inTauri: () => false },
  "./copyFile.ts": { copySource: () => null },
  "@pierre/diffs": { processFile: () => ({ isPartial: false }) },
  "@pierre/diffs/react": { CodeView, EditProvider: ({ children }: { children: unknown }) => children },
  "./Whitespace": { WhitespaceOnly: inert },
  "../../keybindings/KeybindingsProvider.tsx": { useKeybindingOverrides: () => ({ overrides: {} }) },
  "../../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
  "../../keybindings/shortcut.ts": { matchesEvent: () => false },
  "./EditInViewer.ts": { createEditor: inert },
  "./CommentNav": { CommentNav: inert, useCommentNavigation: () => ({ refresh: inert, previousCount: 0, nextCount: 0 }) },
  "./DiscardDialog": { RevertIcon: inert },
  "./FilePathChip": { FilePathChip: inert },
  "./useDiffTheme.ts": { useDiffTheme: () => ({ dark: "fixture", light: "fixture" }) },
  "./pierre.ts": {
    toPatch: () => "fixture patch",
    fullDiffMeta: () => ({ isPartial: false }),
    codeViewItem: () => ({ id: "fixture.ts", type: "diff", fileDiff: { isPartial: false } }),
    editableCodeViewItem: (item: object) => item,
    selectionOf: (range: LineRange) => ({ start: range.start, end: range.line, side: range.side === "old" ? "deletions" : "additions" }),
    CODE_VIEW_LAYOUT: {},
    EXPANSION_LINE_COUNT: 20,
  },
};
const module = { exports: {} };
const evaluate = runInNewContext(`(function(require, module, exports) { ${javascript}\n})`, {
  document: { documentElement: { dataset: { theme: "dark" } } },
  MutationObserver: class { observe() {} disconnect() {} },
});
evaluate((name: string) => {
  if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
  assert.ok(Object.prototype.hasOwnProperty.call(boundaries, name), `Unexpected dependency: ${name}`);
  return boundaries[name];
}, module, module.exports);
assert.ok("FileDiffView" in module.exports && typeof module.exports.FileDiffView === "function");
const FileDiffView = module.exports.FileDiffView;

function fixture({ commenting = true, editing = false, selected = null }: { commenting?: boolean; editing?: boolean; selected?: LineRange | null } = {}) {
  const comments: LineRange[] = [];
  const writes: string[] = [];
  const props = {
    file: { path: "fixture.ts", status: "modified", binary: false, hunks: [{}] },
    layout: "unified", ignoreWhitespace: false, wrapLines: true, viewed: false, onToggleViewed: inert,
    onLineClick: commenting ? (range: LineRange) => comments.push(range) : undefined,
    selected,
    edit: editing ? { generation: 0, current: () => "fixture", onChange: () => writes.push("change"), onSave: () => writes.push("save") } : undefined,
  };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(FileDiffView, props)); });
  const code = () => renderer.root.findByType("fixture-code-view");
  return {
    code, comments, writes,
    select(selection: CodeViewLineSelection) { act(() => code().props.onSelectedLinesChange(selection)); },
    cancel() {
      const handlers = renderer.root.findAll((node: { type: unknown; props: { onPointerCancelCapture?: unknown } }) => typeof node.type === "string" && typeof node.props.onPointerCancelCapture === "function");
      assert.equal(handlers.length, 1, "comment-enabled code has one capture handler for pointer cancellation");
      act(() => handlers[0].props.onPointerCancelCapture());
    },
    update(next: Partial<typeof props>) { Object.assign(props, next); act(() => renderer.update(React.createElement(FileDiffView, props))); },
    handlers: () => renderer.root.findAll((node: { type: unknown; props: { onPointerCancelCapture?: unknown } }) => typeof node.type === "string" && typeof node.props.onPointerCancelCapture === "function"),
    close() { act(() => renderer.unmount()); },
  };
}

const drag: CodeViewLineSelection = { id: "fixture.ts", range: { start: 2, end: 4, side: "additions" } };

for (const editing of [false, true]) {
  test(`actual ${editing ? "editable" : "read-only text"} diff clears a cancelled comment selection without saving or adding a comment`, () => {
    const view = fixture({ editing });
    try {
      view.select(drag);
      assert.deepEqual(view.code().props.selectedLines, drag);
      view.cancel();
      assert.equal(view.code().props.selectedLines, null);
      assert.deepEqual(view.comments, []);
      assert.deepEqual(view.writes, []);
      view.cancel();
      assert.equal(view.code().props.selectedLines, null);
      view.select(drag);
      assert.deepEqual(view.code().props.selectedLines, drag, "a new drag still updates the controlled selection");
    } finally { view.close(); }
  });
}

test("cancellation does not restore a stale parent range, and a later parent range still controls selection", () => {
  const view = fixture({ selected: { side: "new", start: 2, line: 4 } });
  try {
    assert.equal(view.code().props.selectedLines.id, drag.id);
    assert.deepEqual(view.code().props.selectedLines.range, drag.range);
    view.cancel();
    assert.equal(view.code().props.selectedLines, null);
    view.update({ wrapLines: false });
    assert.equal(view.code().props.selectedLines, null, "an unrelated render must not restore the cancelled range");
    view.update({ selected: { side: "old", start: 6, line: 8 } });
    assert.equal(view.code().props.selectedLines.id, "fixture.ts");
    assert.deepEqual(view.code().props.selectedLines.range, { start: 6, end: 8, side: "deletions" });
  } finally { view.close(); }
});

test("comment-disabled code has no cancellation handler, including after commenting is turned off", () => {
  const view = fixture({ commenting: false });
  try {
    assert.equal(view.code().props.options.enableLineSelection, false);
    assert.equal(view.handlers().length, 0);
    view.update({ onLineClick: (range: LineRange) => view.comments.push(range) });
    assert.equal(view.code().props.options.enableLineSelection, true);
    view.select(drag);
    view.cancel();
    assert.equal(view.code().props.selectedLines, null);
    view.update({ onLineClick: undefined });
    assert.equal(view.code().props.options.enableLineSelection, false);
    assert.equal(view.handlers().length, 0);
  } finally { view.close(); }
});
