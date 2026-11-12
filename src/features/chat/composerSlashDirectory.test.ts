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
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
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
  return process.env.COMPOSER_SLASH_DIRECTORY_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_SLASH_DIRECTORY_REF}:${path}`], { encoding: "utf8" })
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
const directory = commands.BUILTIN_COMMANDS.find((command) => command.name === commands.ADD_DIR);
assert.ok(directory);
const file: document.ComposerPart = { kind: "file", path: "src/example.ts", label: "example.ts", directory: false };

function fixture(parts: document.ComposerPart[], options: { command?: commands.SlashCommand; capability?: boolean } = {}) {
  const command = options.command ?? directory;
  const draft = document.writeComposerDraft(parts);
  const editor = new Editor({
    element: null,
    extensions: [Document, Paragraph, Text, HardBreak, schema.FileAtom, focusWithoutDOM],
    content: schema.composerContent(draft), enableInputRules: false, enablePasteRules: false,
  });
  editor.commands.setTextSelection(schema.linearDocument(editor.state.doc).positions[4]);
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
  const attachment = React.createElement("span", { "data-testid": "retained-attachment" }, "keep.txt");
  let linkCalls = 0;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft, setDraft: () => assert.fail("selection must not overwrite or clear the stored draft"), inputRef,
      attachments: attachment, hasAttachments: true,
      queue: { status: "idle", items: [], editingId: null, paused: false }, canSteer: false,
      slashCommands: [command], onSubmit: () => assert.fail("selection must not send a prompt or attachments"),
      onCommand: () => assert.fail("selection must not use the submit command path"),
      onLinkWorkspaces: options.capability === false ? undefined : () => { linkCalls++; },
      onStop() {}, onQueue() {},
    }));
  });
  act(() => { editorProps.onFocus(); editorProps.onSelection(handle.selection()); });
  assert.equal(renderer.root.findAllByType(MenuBoundary).length, 1, "live slash query reaches the menu");
  const attachedNode = renderer.root.findByProps({ "data-testid": "retained-attachment" });
  return {
    editor, handle,
    snapshot: () => schema.partsFrom(editor.state.doc),
    linkCalls: () => linkCalls,
    attachmentPreserved: () => assert.equal(renderer.root.findByProps({ "data-testid": "retained-attachment" }), attachedNode),
    pick() { act(() => renderer.root.findByType(MenuBoundary).props.onPick(command)); },
    key(key: string) {
      let prevented = false;
      act(() => editorProps.onKeyDown({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, preventDefault() { prevented = true; } }));
      assert.ok(prevented, "menu owns the selection key");
    },
    close() { act(() => renderer.unmount()); editor.destroy(); },
  };
}

for (const action of ["Enter", "Tab", "menu choice"]) {
  test(`built-in /add-dir ${action} opens the existing directory picker without sending`, () => {
    const view = fixture([{ kind: "text", text: "/add" }]);
    try {
      if (action === "menu choice") view.pick(); else view.key(action);
      assert.equal(view.linkCalls(), 1);
      assert.deepEqual(view.snapshot(), []);
      view.attachmentPreserved();
    } finally { view.close(); }
  });
}

test("directory selection preserves suffix text and attachments", () => {
  const view = fixture([{ kind: "text", text: "/add keep\n你好" }]);
  try {
    view.pick();
    assert.equal(view.linkCalls(), 1);
    const expected = view.editor.schema.nodeFromJSON(schema.composerContent(document.writeComposerDraft([{ kind: "text", text: " keep\n你好" }])));
    assert.deepEqual(view.editor.getJSON(), expected.toJSON());
    assert.equal(schema.linearDocument(view.editor.state.doc).text, " keep\n你好");
    view.attachmentPreserved();
  } finally { view.close(); }
});

test("directory selection retains adjacent file node identity and complete attributes", () => {
  const view = fixture([{ kind: "text", text: "/add" }, file, { kind: "text", text: " tail" }]);
  try {
    const nodes: ProseMirrorNode[] = [];
    view.editor.state.doc.descendants((node) => { if (node.type.name === "fileMention") nodes.push(node); });
    view.pick();
    assert.equal(view.linkCalls(), 1);
    assert.deepEqual(view.snapshot(), [file, { kind: "text", text: " tail" }]);
    const remaining: ProseMirrorNode[] = [];
    view.editor.state.doc.descendants((node) => { if (node.type.name === "fileMention") remaining.push(node); });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0], nodes[0]);
    assert.equal(view.editor.state.selection.from, 1);
    view.attachmentPreserved();
  } finally { view.close(); }
});

for (const command of [
  { ...directory, effect: "agent" },
  { ...directory, effect: "skill", insert: "$add-dir" },
] satisfies commands.SlashCommand[]) {
  test(`${command.effect} keeps ordinary bounded insertion rather than opening directories`, () => {
    const view = fixture([{ kind: "text", text: "/add" }, file], { command });
    try {
      view.pick();
      assert.equal(view.linkCalls(), 0);
      assert.deepEqual(view.snapshot(), [{ kind: "text", text: `${command.insert ?? `/${command.name}`} ` }, file]);
      view.attachmentPreserved();
    } finally { view.close(); }
  });
}

test("Plan and Fast selection remain bounded text insertion, not immediate actions", () => {
  for (const command of [
    { ...directory, name: "plan", effect: "toggle_plan_mode" },
    { ...directory, name: "fast", effect: "toggle_fast_mode" },
  ] satisfies commands.SlashCommand[]) {
    const view = fixture([{ kind: "text", text: `/${command.name.slice(0, 3)}` }, file], { command });
    try {
      view.pick();
      assert.equal(view.linkCalls(), 0);
      assert.deepEqual(view.snapshot(), [{ kind: "text", text: `/${command.name} ` }, file]);
      view.attachmentPreserved();
    } finally { view.close(); }
  }
});

test("stale, nonempty and composing live selections cannot edit or open directories", () => {
  for (const selection of [{ from: 1, to: 5 }, { from: 1, to: 1 }, null]) {
    const view = fixture([{ kind: "text", text: "/add" }, file]);
    try {
      const before = view.editor.getJSON();
      if (selection) view.editor.commands.setTextSelection(selection);
      else view.handle.composing = () => true;
      view.pick();
      assert.equal(view.linkCalls(), 0);
      assert.deepEqual(view.editor.getJSON(), before);
    } finally { view.close(); }
  }
});

test("missing directory capability preserves ordinary text completion", () => {
  const view = fixture([{ kind: "text", text: "/add" }, file], { capability: false });
  try {
    view.pick();
    assert.equal(view.linkCalls(), 0);
    assert.deepEqual(view.snapshot(), [{ kind: "text", text: "/add-dir " }, file]);
    view.attachmentPreserved();
  } finally { view.close(); }
});
