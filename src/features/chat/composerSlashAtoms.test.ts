import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { Editor, Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { closeHistory } from "@tiptap/pm/history";
import * as queue from "./queue.ts";
import * as queueKeys from "./queueKeys.ts";
import * as commands from "./slashCommands.ts";
import * as mentions from "./fileMentions.ts";
import * as document from "./composerDocument.ts";
import * as userContent from "./userContent.ts";
import * as schema from "./composerSchema.ts";
import * as shortcuts from "../../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
function source(name: string) {
  const path = `src/features/chat/${name}`;
  return process.env.COMPOSER_SLASH_SOURCE_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_SLASH_SOURCE_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}
function javascript(text: string) {
  return ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const focusWithoutDOM = Extension.create({
  name: "headlessFocus",
  addCommands() { return { focus: () => () => true }; },
});
const review: commands.SlashCommand = { name: "review", description: "Review changes", argumentHint: "", effect: "agent", supportedAgents: ["codex"] };
const file: document.ComposerPart = { kind: "file", path: "src/example.ts", label: "example.ts", directory: false };

function fixture(parts: document.ComposerPart[], caret = 3) {
  const draft = document.writeComposerDraft(parts);
  const editor = new Editor({
    element: null,
    extensions: [Document, Paragraph, Text, HardBreak, schema.FileAtom, focusWithoutDOM],
    content: schema.composerContent(draft),
    enableInputRules: false, enablePasteRules: false,
  });
  editor.commands.setTextSelection(schema.linearDocument(editor.state.doc).positions[caret]);
  const adapter = source("ComposerEditor.tsx");
  const snapshotStart = adapter.indexOf("function snapshot(");
  const snapshotEnd = adapter.indexOf("\nexport function ComposerEditor", snapshotStart);
  const handleStart = adapter.indexOf("    const handle: ComposerEditorHandle = ");
  const handleEnd = adapter.indexOf("\n    Object.assign(current.current.inputRef", handleStart);
  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart && handleStart >= 0 && handleEnd > handleStart);
  const handle: ComposerEditorHandle = runInNewContext(javascript(`${adapter.slice(snapshotStart, snapshotEnd)}\n${adapter.slice(handleStart, handleEnd)}\nhandle;`), {
    editor, linearDocument: schema.linearDocument, inlineContent: schema.inlineContent, closeHistory,
  });
  const inputRef = { current: handle };
  let editorProps: { onSelection(value: ReturnType<ComposerEditorHandle["selection"]>): void; onFocus(): void; onKeyDown(event: unknown): void };
  const EditorBoundary = (props: typeof editorProps) => { editorProps = props; return null; };
  const MenuBoundary = () => null;
  const exports: Partial<Pick<typeof import("./Composer"), "Composer">> = {};
  runInNewContext(javascript(source("Composer.tsx")), {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/Tooltip.tsx")) return { Tooltip: ({ children }: { children: unknown }) => children, ShortcutHint: () => null };
      if (name.endsWith("/usePresence.ts")) return { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) };
      if (name.endsWith("/KeybindingsProvider.tsx")) return { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings() {} };
      if (name.endsWith("/overrides.ts")) return { effectiveShortcuts };
      if (name.endsWith("/shortcut.ts")) return shortcuts;
      if (name === "./queue.ts") return queue;
      if (name === "./queueKeys.ts") return queueKeys;
      if (name === "./slashCommands.ts") return commands;
      if (name === "./fileMentions.ts") return mentions;
      if (name === "./composerDocument.ts") return document;
      if (name === "./userContent.ts") return userContent;
      if (name === "./ComposerEditor.tsx") return { ComposerEditor: EditorBoundary };
      if (name === "./SlashMenu.tsx") return { SlashMenu: MenuBoundary };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("no file search in slash completion") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft, setDraft: () => assert.fail("completion must edit the live document, not overwrite the stored draft"), inputRef,
      queue: { status: "idle", items: [], editingId: null, paused: false }, canSteer: false,
      slashCommands: [review], onSubmit: () => assert.fail("picking must not submit"), onStop() {}, onQueue() {},
    }));
  });
  act(() => { editorProps.onFocus(); editorProps.onSelection(handle.selection()); });
  assert.equal(renderer.root.findAllByType(MenuBoundary).length, 1, "live selection must reach the slash menu");
  return {
    editor,
    snapshot: () => schema.partsFrom(editor.state.doc),
    pick(command = review) { act(() => renderer.root.findByType(MenuBoundary).props.onPick(command)); },
    key(key: string) {
      let prevented = false;
      act(() => editorProps.onKeyDown({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, preventDefault() { prevented = true; } }));
      assert.ok(prevented);
    },
    close() { act(() => renderer.unmount()); editor.destroy(); },
  };
}

for (const suffix of [[file, { kind: "text", text: " keep suffix" }], [{ kind: "text", text: " " }, file, { kind: "text", text: "\n📄 keep suffix" }], [file, { ...file, path: "src/other.ts", label: "other.ts" }]] satisfies document.ComposerPart[][]) {
  test(`mounted slash choice preserves ${JSON.stringify(suffix)} through the actual adapter command`, () => {
    const view = fixture([{ kind: "text", text: "/re" }, ...suffix]);
    try {
      view.pick();
      const expected = schema.composerContent(document.writeComposerDraft([{ kind: "text", text: "/review " }, ...suffix]));
      assert.deepEqual(view.editor.getJSON(), expected);
      assert.equal(schema.linearDocument(view.editor.state.doc).text.includes("\ufffc"), true);
      assert.equal(view.editor.state.selection.empty, true);
      assert.equal(view.editor.state.selection.from, 9, "caret follows insertion, not the file suffix");
    } finally { view.close(); }
  });
}

for (const key of ["Enter", "Tab"]) {
  test(`mounted ${key} picks the same bounded completion without flattening an atom`, () => {
    const view = fixture([{ kind: "text", text: "/re" }, file]);
    try { view.key(key); assert.deepEqual(view.snapshot(), [{ kind: "text", text: "/review " }, file]); }
    finally { view.close(); }
  });
}

test("plain-text completion replaces only text before the caret", () => {
  const view = fixture([{ kind: "text", text: "/re rest" }]);
  try { view.pick(); assert.deepEqual(view.snapshot(), [{ kind: "text", text: "/review  rest" }]); }
  finally { view.close(); }
});

test("agent-specific insert text preserves the suffix file identity", () => {
  const view = fixture([{ kind: "text", text: "/re" }, file]);
  try { view.pick({ ...review, effect: "skill", insert: "$review" }); assert.deepEqual(view.snapshot(), [{ kind: "text", text: "$review " }, file]); }
  finally { view.close(); }
});

test("stale query or nonempty selection cannot replace a mixed draft", () => {
  for (const selection of [{ from: 1, to: 4 }, { from: 1, to: 1 }]) {
    const view = fixture([{ kind: "text", text: "/re" }, file]);
    try {
      const before = view.editor.getJSON();
      view.editor.commands.setTextSelection(selection);
      view.pick();
      assert.deepEqual(view.editor.getJSON(), before);
    } finally { view.close(); }
  }
});
