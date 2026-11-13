import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Editor, type EditorOptions } from "@tiptap/core";
import * as document from "./composerDocument.ts";
import * as schema from "./composerSchema.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

type KeyFields = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "keyCode">;
type Key = Event & KeyFields;
type Handler = (view: unknown, event: Key) => boolean;
type BoundaryOptions = Pick<EditorOptions, "content" | "extensions"> & { editorProps: { handleKeyDown: Handler } };
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const path = "src/features/chat/ComposerEditor.tsx";
const source = process.env.COMPOSER_RESERVED_SPACE_SOURCE_REF
  ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_RESERVED_SPACE_SOURCE_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(new URL("./ComposerEditor.tsx", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture(onKeyDown?: (event: Key) => void) {
  const forwarded: Key[] = [];
  const changes: string[] = [];
  let handler: Handler | undefined;
  let core: Editor | undefined;
  class EditorBoundary {
    view = { composing: false, dom: { dataset: {} } };
    constructor(options: BoundaryOptions) {
      core = new Editor({ element: null, content: options.content, extensions: options.extensions });
      handler = options.editorProps.handleKeyDown;
    }
    get state() { assert.ok(core); return core.state; }
    get isEmpty() { assert.ok(core); return core.isEmpty; }
    destroy() { core?.destroy(); }
  }
  const exports: Partial<Pick<typeof import("./ComposerEditor"), "ComposerEditor">> = {};
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "@tiptap/core") return { Editor: EditorBoundary };
      if (["react", "react/jsx-runtime", "@tiptap/extension-document", "@tiptap/extension-paragraph", "@tiptap/extension-text",
        "@tiptap/extension-hard-break", "@tiptap/extensions", "@tiptap/pm/state", "@tiptap/pm/history"].includes(name)) return dependencies(name);
      if (name === "./composerDocument.ts") return document;
      if (name === "./composerSchema.ts") return schema;
      throw new Error(`Unexpected ComposerEditor dependency: ${name}`);
    },
  });
  assert.ok(exports.ComposerEditor);
  const inputRef: { current: ComposerEditorHandle | null } = { current: null };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.ComposerEditor, {
      value: "keep draft", inputRef, placeholder: "Message",
      onChange: (value: string) => changes.push(value),
      onSelection() {}, onFocus() {}, onBlur() {}, onPasteFiles: () => false,
      onKeyDown: (event: Key) => { forwarded.push(event); onKeyDown?.(event); },
    }), { createNodeMock: () => ({}) });
  });
  assert.ok(handler, "mount must install the actual adapter key handler");
  assert.ok(inputRef.current, "mount must publish the production editor handle");
  const dispatch = handler;
  return {
    forwarded, changes,
    key(fields: Partial<KeyFields> = {}) {
      const event = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), {
        key: " ", code: "Space", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
        isComposing: false, keyCode: 32, ...fields,
      });
      let handled = false;
      act(() => { handled = dispatch(undefined, event); });
      assert.ok(core);
      assert.equal(document.writeComposerDraft(schema.partsFrom(core.state.doc)), "keep draft");
      assert.deepEqual(changes, [], "key handling must not replace or emit the draft");
      return { event, handled };
    },
    close() { act(() => renderer.unmount()); assert.equal(inputRef.current, null); },
  };
}

const reserved: [string, Partial<KeyFields>][] = [
  ["Ctrl+Space", {}],
  ["logical space with another physical code", { code: "Other" }],
  ["physical Space with another logical key", { key: "Unidentified" }],
  ["Ctrl+Shift+Space", { shiftKey: true }],
  ["Ctrl+Alt+Space", { altKey: true }],
  ["Ctrl+Shift+Alt+Space", { shiftKey: true, altKey: true }],
];
for (const [label, fields] of reserved) {
  test(`${label} is handled before the Composer command callback`, () => {
    const view = fixture();
    try {
      const { event, handled } = view.key(fields);
      assert.equal(handled, true, "the editor must consume the reserved chord");
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.cancelBubble, true, "the chord must not reach ancestor shortcuts");
      assert.deepEqual(view.forwarded, [], "the parent must not dispatch a send, queue edit or suggestion command");
    } finally { view.close(); }
  });
}

const controls: [string, Partial<KeyFields>][] = [
  ["plain Space", { ctrlKey: false }],
  ["Meta+Space", { ctrlKey: false, metaKey: true }],
  ["Ctrl+Meta+Space", { metaKey: true }],
  ["Ctrl+Shift+Meta+Space", { metaKey: true, shiftKey: true }],
  ["Ctrl+another key", { key: "a", code: "KeyA", keyCode: 65 }],
];
for (const [label, fields] of controls) {
  test(`${label} still reaches the Composer command callback once`, () => {
    const view = fixture();
    try {
      const { event, handled } = view.key(fields);
      assert.equal(handled, false);
      assert.equal(event.defaultPrevented, false);
      assert.equal(event.cancelBubble, false);
      assert.deepEqual(view.forwarded, [event]);
    } finally { view.close(); }
  });
}

test("an allowed chord retains the parent callback's handled result", () => {
  const view = fixture((event) => event.preventDefault());
  try {
    const { event, handled } = view.key({ metaKey: true });
    assert.equal(handled, true);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.cancelBubble, false);
    assert.deepEqual(view.forwarded, [event]);
  } finally { view.close(); }
});
