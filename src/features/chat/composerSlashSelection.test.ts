import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as queue from "./queue.ts";
import * as queueKeys from "./queueKeys.ts";
import * as commands from "./slashCommands.ts";
import * as mentions from "./fileMentions.ts";
import * as document from "./composerDocument.ts";
import * as userContent from "./userContent.ts";
import * as shortcuts from "../../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import type { Composer, ComposerProps } from "./Composer.tsx";
import type { ComposerEditorHandle, ComposerSelection } from "./ComposerEditor.tsx";
import type { SlashMenuProps } from "./SlashMenu.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const slashCommands: commands.SlashCommand[] = ["alpha", "alpine"].map((name) => ({
  name, description: name, argumentHint: "", effect: "agent", supportedAgents: ["codex"],
}));
type EditorCallbacks = {
  onKeyDown(event: unknown): void;
  onChange(value: string): void;
  onFocus(): void;
  onBlur(): void;
  onSelection(selection: ComposerSelection): void;
};

function fixture(initial = "/al", initialCaret = initial.length) {
  let selection: ComposerSelection = { text: initial, start: initialCaret, end: initialCaret };
  const replacements: { range: { start: number; end: number }; text: string }[] = [];
  const submitted: userContent.UserPrompt[] = [];
  const drafts: string[] = [];
  let editorProps: EditorCallbacks | undefined;
  const handle: ComposerEditorHandle = {
    focus() {}, blur() {}, visible: () => true, focused: () => true, composing: () => false,
    selection: () => selection,
    replaceRange(range, text) { replacements.push({ range, text }); return true; },
    insertFile: () => assert.fail("slash query selection must not insert file atoms"),
    deleteRange: () => assert.fail("ordinary slash selection must not delete a trigger separately"),
    newline: () => assert.fail("slash menu selection must not insert a newline"),
  };
  const EditorBoundary = (props: EditorCallbacks) => { editorProps = props; return null; };
  const SlashBoundary = (props: SlashMenuProps) => React.createElement("slash-selection-probe", {
    focused: props.focused, labels: props.matches.map((match) => match.command.name),
  });
  const exports: { Composer?: typeof Composer } = {};
  const source = readFileSync("src/features/chat/Composer.tsx", "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/Tooltip.tsx")) return { Tooltip: ({ children }: { children: unknown }) => children, ShortcutHint: () => null };
      if (name.endsWith("/usePresence.ts")) return { usePresence: (visible: boolean) => ({ mounted: visible, attrs: {} }) };
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
      if (name === "./SlashMenu.tsx") return { SlashMenu: SlashBoundary };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => assert.fail("slash-only fixture must not open mention menu") };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("slash selection must not request files") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  const Component = exports.Composer;
  const props: ComposerProps = {
    draft: initial, setDraft: (value) => { drafts.push(value); }, inputRef: { current: handle },
    queue: queue.emptyQueue(), canSteer: false, slashCommands,
    onSubmit: (input) => { submitted.push(input); },
    onStop: () => assert.fail("slash selection must not stop an agent"),
    onQueue: () => assert.fail("slash selection must not change queued messages"),
  };
  let renderer: ReturnType<typeof create>;
  try {
    act(() => { renderer = create(React.createElement(Component, props)); });
    act(() => {
      assert.ok(editorProps);
      editorProps.onFocus();
      editorProps.onSelection(selection);
    });
  } catch (error) {
    if (renderer) act(() => renderer.unmount());
    throw error;
  }
  function menu(): { focused: number; labels: string[] } | null {
    const menus = renderer.root.findAllByType("slash-selection-probe");
    assert.ok(menus.length <= 1);
    return menus[0]?.props ?? null;
  }
  try {
    assert.equal(menu()?.labels.length, 2, "fixture must open two real slash matches");
    assert.equal(menu()?.focused, 0);
  } catch (error) {
    act(() => renderer.unmount());
    throw error;
  }
  return {
    menu, replacements, submitted, drafts,
    caret(position: number) {
      selection = { ...selection, start: position, end: position };
      act(() => { assert.ok(editorProps); editorProps.onSelection(selection); });
    },
    type(text: string) {
      selection = { text, start: text.length, end: text.length };
      props.draft = text;
      act(() => {
        assert.ok(editorProps);
        editorProps.onChange(text);
        renderer.update(React.createElement(Component, props));
        editorProps.onSelection(selection);
      });
    },
    blur() { act(() => { assert.ok(editorProps); editorProps.onBlur(); }); },
    focus() { act(() => { assert.ok(editorProps); editorProps.onFocus(); }); },
    rerender() { act(() => renderer.update(React.createElement(Component, { ...props, placeholder: "Same query" }))); },
    key(key: string) {
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperties(event, Object.fromEntries(Object.entries({
        key, code: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false,
      }).map(([name, value]) => [name, { value }])));
      act(() => { assert.ok(editorProps); editorProps.onKeyDown(event); });
      return { prevented: event.defaultPrevented, stopped: event.cancelBubble };
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const [label, before, after] of [
  ["shortening", 3, 2],
  ["lengthening", 2, 3],
  ["emptying", 3, 1],
] as const) {
  test(`caret-only slash query ${label} selects the first result instead of retaining a prior row`, () => {
    const view = fixture("/al", before);
    try {
      assert.deepEqual(view.key("ArrowDown"), { prevented: true, stopped: true });
      assert.equal(view.menu()?.focused, 1);
      view.caret(after);
      assert.equal(view.menu()?.labels.length, 2);
      assert.equal(view.menu()?.focused, 0, "a changed slash query must select its first result");
      assert.deepEqual(view.replacements, []);
      assert.deepEqual(view.submitted, []);
      assert.deepEqual(view.drafts, []);
    } finally { view.close(); }
  });
}

for (const key of ["Enter", "Tab"]) {
  test(`slash ${key} immediately after a query change picks the first displayed command`, () => {
    const view = fixture();
    try {
      view.key("ArrowDown");
      assert.equal(view.menu()?.focused, 1);
      view.caret(2);
      const first = view.menu()?.labels[0];
      assert.ok(first);
      assert.deepEqual(view.key(key), { prevented: true, stopped: true });
      assert.deepEqual(view.replacements, [{ range: { start: 0, end: 2, query: "a" }, text: `/${first} ` }]);
      assert.deepEqual(view.submitted, []);
      assert.deepEqual(view.drafts, []);
    } finally { view.close(); }
  });
}

test("leaving the slash trigger and reopening the same query starts at the first result", () => {
  const view = fixture("/al tail", 3);
  try {
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.caret(8);
    assert.equal(view.menu(), null);
    view.caret(3);
    assert.equal(view.menu()?.focused, 0);
  } finally { view.close(); }
});

test("OpenConductor lifecycle policy resets slash selection on blur and refocus", () => {
  const view = fixture("/a");
  try {
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.blur();
    assert.equal(view.menu(), null);
    view.focus();
    assert.equal(view.menu()?.focused, 0);
  } finally { view.close(); }
});

test("same-query selection notifications preserve the selected row", () => {
  const view = fixture("/a");
  try {
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.caret(2);
    assert.equal(view.menu()?.focused, 1);
  } finally { view.close(); }
});

test("a parent rerender without a query change preserves the selected row", () => {
  const view = fixture("/a");
  try {
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.rerender();
    assert.equal(view.menu()?.focused, 1);
  } finally { view.close(); }
});

test("unchanged-query navigation still wraps in both directions", () => {
  const view = fixture("/a");
  try {
    assert.deepEqual(view.key("ArrowUp"), { prevented: true, stopped: true });
    assert.equal(view.menu()?.focused, 1);
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 0);
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 0);
    assert.deepEqual(view.replacements, []);
    assert.deepEqual(view.submitted, []);
  } finally { view.close(); }
});


test("ordinary typing already selects the first result through the existing change callback", () => {
  const view = fixture("/al");
  try {
    view.key("ArrowDown");
    assert.equal(view.menu()?.focused, 1);
    view.type("/a");
    assert.equal(view.menu()?.focused, 0);
    assert.deepEqual(view.drafts, ["/a"]);
    assert.deepEqual(view.replacements, []);
    assert.deepEqual(view.submitted, []);
  } finally { view.close(); }
});
