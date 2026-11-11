import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Editor, type EditorOptions } from "@tiptap/core";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { ReactElement } from "react";
import * as document from "../chat/composerDocument.ts";
import * as schema from "../chat/composerSchema.ts";
import type { ComposerEditorHandle } from "../chat/ComposerEditor.tsx";

const deps = createRequire(import.meta.url);
const React: typeof import("react") = deps("react");
const renderer = deps("react-test-renderer");
const act: (run: () => void) => void = renderer.act;
const create: (element: ReactElement, options: { createNodeMock(): object }) => { unmount(): void } = renderer.create;
const ts: typeof import("typescript") = deps("typescript");
const source = readFileSync("src/features/chat/ComposerEditor.tsx", "utf8");
const workspaceSource = readFileSync("src/components/WorkspaceView.tsx", "utf8");
const javascript = (text: string) => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function editorFixture(parts: document.ComposerPart[] = [{ kind: "text", text: "keep this draft" }]) {
  let core: Editor | undefined;
  let state: EditorState | undefined;
  let focusCount = 0;
  const changes: string[] = [];
  const view = {
    composing: false,
    dom: { dataset: {} },
    focus() { focusCount++; },
    dispatch(transaction: Transaction) { assert.ok(state); state = state.apply(transaction); },
  };
  class EditorBoundary {
    view = view;
    constructor(options: Pick<EditorOptions, "content" | "extensions">) {
      core = new Editor({ element: null, content: options.content, extensions: options.extensions });
      state = core.state;
    }
    get state() { assert.ok(state); return state; }
    get isEmpty() { assert.ok(core); return core.isEmpty; }
    destroy() { core?.destroy(); }
  }
  const exports: Partial<Pick<typeof import("../chat/ComposerEditor"), "ComposerEditor">> = {};
  runInNewContext(javascript(source), {
    exports,
    require(name: string) {
      if (name === "@tiptap/core") return { Editor: EditorBoundary };
      if (["react", "react/jsx-runtime", "@tiptap/extension-document", "@tiptap/extension-paragraph", "@tiptap/extension-text",
        "@tiptap/extension-hard-break", "@tiptap/extensions", "@tiptap/pm/state", "@tiptap/pm/history"].includes(name)) return deps(name);
      if (name === "./composerDocument.ts") return document;
      if (name === "./composerSchema.ts") return schema;
      throw new Error(`Unexpected editor boundary: ${name}`);
    },
  });
  const ComposerEditor = exports.ComposerEditor;
  assert.ok(ComposerEditor);
  const inputRef: { current: ComposerEditorHandle | null } = { current: null };
  let mounted: ReturnType<typeof create>;
  act(() => {
    mounted = create(React.createElement(ComposerEditor, {
      value: document.writeComposerDraft(parts), inputRef, placeholder: "Message",
      onChange: (value: string) => changes.push(value), onSelection() {}, onFocus() {}, onBlur() {},
      onPasteFiles: () => false, onKeyDown() {},
    }), { createNodeMock: () => ({}) });
  });
  assert.ok(inputRef.current, "actual mounted ComposerEditor publishes its handle");
  const handle = inputRef.current;
  const read = () => { assert.ok(state); return state; };
  return {
    handle, inputRef, changes,
    state: read,
    focusCount: () => focusCount,
    select(from: number, to = from) { state = read().apply(read().tr.setSelection(TextSelection.create(read().doc, from, to))); },
    close() { act(() => mounted.unmount()); assert.equal(inputRef.current, null); },
  };
}

function actualBridge(inputRef: { current: ComposerEditorHandle | null }) {
  const parsed = ts.createSourceFile("WorkspaceView.tsx", workspaceSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let assignment: string | undefined;
  const visit = (node: import("typescript").Node) => {
    if (ts.isBinaryExpression(node) && node.left.getText(parsed) === "bridge.current" && ts.isObjectLiteralExpression(node.right)) assignment = node.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(assignment, "actual ChatPanel bridge assignment exists");
  const unexpected = () => assert.fail("focus must not insert text, mutate draft or attachments, send or fork");
  const bridge: { focusAtEnd?: () => void } = runInNewContext(javascript(`const bridge = { current: null }; ${assignment}; bridge.current;`), {
    inputRef, setDraft: unexpected, appendComposerText: unexpected, setAttachments: unexpected,
    addAttachment: unexpected, submit: unexpected, forkToTab: unexpected, forking: false,
  });
  return bridge;
}

test("ordinary actual-editor focus keeps the existing selection and draft unchanged", () => {
  const f = editorFixture();
  try {
    f.select(2, 5);
    const before = f.state().doc.toJSON();
    f.handle.focus();
    assert.equal(f.state().selection.from, 2); assert.equal(f.state().selection.to, 5);
    assert.equal(f.focusCount(), 1); assert.deepEqual(f.state().doc.toJSON(), before);
    assert.deepEqual(f.changes, []);
  } finally { f.close(); }
});

test("explicit actual-editor end focus collapses at the end without replacing rich content", () => {
  const f = editorFixture([
    { kind: "text", text: "keep " }, { kind: "file", path: "src/one.ts", label: "one.ts", directory: false },
    { kind: "text", text: " trailing spaces  " },
  ]);
  try {
    f.select(2, 4);
    const before = f.state().doc.toJSON();
    Reflect.apply(f.handle.focus, f.handle, ["end"]);
    const end = TextSelection.atEnd(f.state().doc);
    assert.equal(f.state().selection.from, end.from);
    assert.equal(f.state().selection.to, end.to);
    assert.equal(f.focusCount(), 1); assert.deepEqual(f.state().doc.toJSON(), before);
    assert.deepEqual(f.changes, []);
  } finally { f.close(); }
});

test("explicit end focus handles an empty actual-editor document", () => {
  const f = editorFixture([{ kind: "text", text: "" }]);
  try {
    Reflect.apply(f.handle.focus, f.handle, ["end"]);
    assert.equal(f.state().selection.from, TextSelection.atEnd(f.state().doc).from);
    assert.equal(f.focusCount(), 1); assert.deepEqual(f.changes, []);
  } finally { f.close(); }
});

test("actual ChatPanel focus-at-end bridge uses the mounted editor without draft or attachment mutation", () => {
  const f = editorFixture();
  try {
    f.select(2, 5);
    const before = f.state().doc.toJSON();
    const bridge = actualBridge(f.inputRef);
    assert.equal(typeof bridge.focusAtEnd, "function", "ChatPanel exposes explicit focus-at-end");
    assert.ok(bridge.focusAtEnd); bridge.focusAtEnd();
    assert.equal(f.state().selection.from, TextSelection.atEnd(f.state().doc).from);
    assert.equal(f.state().selection.to, f.state().selection.from);
    assert.deepEqual(f.state().doc.toJSON(), before); assert.deepEqual(f.changes, []);
    assert.equal(f.focusCount(), 1);
  } finally { f.close(); }
});

test("actual focus-at-end bridge is safe after editor unmount", () => {
  const f = editorFixture();
  const bridge = actualBridge(f.inputRef);
  f.close();
  assert.equal(typeof bridge.focusAtEnd, "function");
  assert.ok(bridge.focusAtEnd); assert.doesNotThrow(() => bridge.focusAtEnd?.());
  assert.equal(f.focusCount(), 0);
});
