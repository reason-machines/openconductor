import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
import { effectiveShortcuts, type Overrides } from "../../keybindings/overrides.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

type Modifiers = Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">>;
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function fixture({ caret = 0, queued = true, editing = false, canSteer = false, overrides = {} }: { caret?: number; queued?: boolean; editing?: boolean; canSteer?: boolean; overrides?: Overrides } = {}) {
  const focused: string[] = [];
  const actions: queue.QueueAction[] = [];
  const queries: string[] = [];
  const selection = { text: "", start: caret, end: caret };
  const handle: ComposerEditorHandle = {
    focus() { focused.push("composer"); }, blur() {}, visible: () => true, focused: () => true,
    composing: () => false, selection: () => selection,
    replaceRange: () => assert.fail("navigation must not replace text"),
    insertFile: () => assert.fail("navigation must not insert files"),
    deleteRange: () => assert.fail("navigation must not delete text"),
    newline: () => assert.fail("navigation must not insert a newline"),
  };
  let editorProps: { onKeyDown(event: unknown): void };
  const EditorBoundary = (props: typeof editorProps) => { editorProps = props; return null; };
  const path = "src/features/chat/Composer.tsx";
  const source = process.env.COMPOSER_QUEUE_FOCUS_SOURCE_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_FOCUS_SOURCE_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./Composer"), "Composer">> = {};
  runInNewContext(javascript, {
    exports, CSS: { escape: (value: string) => value },
    requestAnimationFrame(callback: () => void) { callback(); return 1; },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/Tooltip.tsx")) return { Tooltip: ({ children }: { children: unknown }) => children, ShortcutHint: () => null };
      if (name.endsWith("/usePresence.ts")) return { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) };
      if (name.endsWith("/KeybindingsProvider.tsx")) return { useKeybindingOverrides: () => ({ overrides }), useKeybindings() {} };
      if (name.endsWith("/overrides.ts")) return { effectiveShortcuts };
      if (name.endsWith("/shortcut.ts")) return shortcuts;
      if (name === "./queue.ts") return queue;
      if (name === "./queueKeys.ts") return queueKeys;
      if (name === "./slashCommands.ts") return commands;
      if (name === "./fileMentions.ts") return mentions;
      if (name === "./composerDocument.ts") return document;
      if (name === "./userContent.ts") return userContent;
      if (name === "./ComposerEditor.tsx") return { ComposerEditor: EditorBoundary };
      if (name === "./SlashMenu.tsx") return { SlashMenu: () => null };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("navigation must not search files") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  const items = queued ? ["first", "last"].map((id) => ({ id, text: id, attachments: [], createdAt: "2026-11-11T00:00:00Z" })) : [];
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft: "", setDraft: () => assert.fail("navigation must not overwrite the draft"), inputRef: { current: handle },
      queue: { ...queue.emptyQueue(), status: "working", items, editingId: editing ? "first" : null }, canSteer,
      onSubmit: () => assert.fail("navigation must not submit"), onStop() {}, onQueue(action: queue.QueueAction) { actions.push({ ...action }); },
    }), { createNodeMock(element: { type: string }) {
      if (element.type !== "ol") return null;
      return { querySelector(selector: string) {
        queries.push(selector);
        return { focus() { focused.push(selector); } };
      } };
    } });
  });
  return {
    focused, queries, actions,
    rowKey(id: string, key: string, modifiers: Modifiers = {}, { child = false, composing = false } = {}) {
      const target = {};
      const fields = { key, code: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...modifiers };
      const nativeEvent = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), fields, { isComposing: composing });
      act(() => renderer.root.findByProps({ "data-id": id }).props.onKeyDown({
        ...fields, nativeEvent, target: child ? {} : target, currentTarget: target,
        preventDefault() { nativeEvent.preventDefault(); }, stopPropagation() { nativeEvent.stopPropagation(); },
      }));
      return { prevented: nativeEvent.defaultPrevented, stopped: nativeEvent.cancelBubble };
    },
    key(modifiers: Modifiers = {}) {
      let prevented = false;
      act(() => editorProps.onKeyDown({ key: "ArrowUp", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false,
        isComposing: false, ...modifiers, preventDefault() { prevented = true; }, stopPropagation() {} }));
      return prevented;
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("Ctrl+ArrowUp leaves the Composer's queue focus untouched", () => {
  const view = fixture();
  try {
    assert.equal(view.key({ ctrlKey: true }), false, "modified ArrowUp must not be consumed for queue navigation");
    assert.deepEqual(view.queries, []);
    assert.deepEqual(view.focused, []);
  } finally { view.close(); }
});

test("unmodified ArrowUp at the start focuses the last queued row", () => {
  const view = fixture();
  try {
    assert.equal(view.key(), true);
    assert.deepEqual(view.queries, ['li[data-id="last"]']);
    assert.deepEqual(view.focused, ['li[data-id="last"]']);
  } finally { view.close(); }
});

for (const modifier of ["shiftKey", "metaKey", "altKey"] as const) {
  test(`${modifier}+ArrowUp does not take queue focus`, () => {
    const view = fixture();
    try {
      assert.equal(view.key({ [modifier]: true }), false);
      assert.deepEqual(view.focused, []);
    } finally { view.close(); }
  });
}

for (const [label, options] of [["non-start caret", { caret: 1 }], ["empty queue", { queued: false }]] as const) {
  test(`ArrowUp preserves focus with ${label}`, () => {
    const view = fixture(options);
    try {
      assert.equal(view.key(), false);
      assert.deepEqual(view.focused, []);
    } finally { view.close(); }
  });
}

for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape"]) {
  for (const modifier of ["shiftKey", "metaKey", "ctrlKey", "altKey"] as const) {
    test(`${modifier}+${key} on a queued row leaves navigation unhandled`, () => {
      const view = fixture();
      try {
        assert.deepEqual(view.rowKey("last", key, { [modifier]: true }), { prevented: false, stopped: false });
        assert.deepEqual(view.focused, []);
        assert.deepEqual(view.queries, []);
        assert.deepEqual(view.actions, []);
      } finally { view.close(); }
    });
  }
}

for (const [key, destination] of [
  ["ArrowDown", "composer"], ["ArrowUp", 'li[data-id="first"]'], ["Home", 'li[data-id="first"]'],
  ["End", 'li[data-id="last"]'], ["Escape", "composer"],
] as const) {
  test(`plain ${key} on a queued row keeps its navigation destination`, () => {
    const view = fixture();
    try {
      assert.deepEqual(view.rowKey("last", key), { prevented: true, stopped: true });
      assert.deepEqual(view.focused, [destination]);
      assert.deepEqual(view.actions, []);
    } finally { view.close(); }
  });
}

for (const [command, action] of [
  ["chat.queue.editMessage", "edit"], ["chat.queue.deleteMessage", "delete"], ["chat.queue.steerMessage", "steer"],
] as const) {
  test(`configured Ctrl+ArrowUp still dispatches ${command} before raw navigation`, () => {
    const view = fixture({ canSteer: true, overrides: { [command]: [{ key: { kind: "logical", value: "ArrowUp" }, modifiers: ["ctrl"] }] } });
    try {
      assert.deepEqual(view.rowKey("last", "ArrowUp", { ctrlKey: true }), { prevented: true, stopped: true });
      assert.deepEqual(view.actions, [{ kind: action, id: "last" }]);
      assert.deepEqual(view.focused, action === "edit" ? [] : ['li[data-id="first"]']);
    } finally { view.close(); }
  });
}

test("an unavailable modified steer shortcut remains unhandled", () => {
  const view = fixture({ canSteer: false, overrides: { "chat.queue.steerMessage": [{ key: { kind: "logical", value: "ArrowUp" }, modifiers: ["ctrl"] }] } });
  try {
    assert.deepEqual(view.rowKey("last", "ArrowUp", { ctrlKey: true }), { prevented: false, stopped: false });
    assert.deepEqual(view.actions, []);
    assert.deepEqual(view.focused, []);
  } finally { view.close(); }
});

for (const [label, options] of [["child target", { child: true }], ["composition", { composing: true }]] as const) {
  test(`row navigation ignores a ${label} event`, () => {
    const view = fixture();
    try {
      assert.deepEqual(view.rowKey("last", "ArrowUp", {}, options), { prevented: false, stopped: false });
      assert.deepEqual(view.actions, []);
      assert.deepEqual(view.focused, []);
    } finally { view.close(); }
  });
}

// --- Queue-edit entry focus (QUEUE-EDIT-CARET-END-135-01) ---
// Fixture variant that tracks focus("end") calls on the queue-edit editor.
// queueMicrotask is stubbed synchronously so the focus call is observable within act().
function editFocusFixture(initialEditingId: string | null = null) {
  const editFocused: (string | undefined)[] = [];
  const path = "src/features/chat/Composer.tsx";
  const source = process.env.COMPOSER_QUEUE_FOCUS_SOURCE_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_FOCUS_SOURCE_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./Composer"), "Composer">> = {};
  const { useLayoutEffect: useLE } = React as typeof import("react");
  const TrackingEditor = (props: { inputRef: { current: ComposerEditorHandle | null }; placeholder: string; [k: string]: unknown }) => {
    useLE(() => {
      const handle: ComposerEditorHandle = {
        focus(position) { editFocused.push(position); },
        blur() {}, visible: () => true, focused: () => false, composing: () => false,
        selection: () => ({ text: "", start: 0, end: 0 }),
        replaceRange: () => false, insertFile: () => {}, deleteRange: () => false, newline: () => {},
        atTop: () => true,
      };
      props.inputRef.current = handle;
      return () => { props.inputRef.current = null; };
    }, []);
    return null;
  };
  const mainHandle: ComposerEditorHandle = {
    focus() {}, blur() {}, visible: () => true, focused: () => true, composing: () => false,
    selection: () => ({ text: "", start: 0, end: 0 }),
    replaceRange: () => false, insertFile: () => {}, deleteRange: () => false, newline: () => {},
    atTop: () => true,
  };
  runInNewContext(javascript, {
    exports, CSS: { escape: (v: string) => v },
    requestAnimationFrame(cb: () => void) { cb(); return 1; },
    queueMicrotask(cb: () => void) { cb(); },
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
      if (name === "./ComposerEditor.tsx") return { ComposerEditor: TrackingEditor };
      if (name === "./SlashMenu.tsx") return { SlashMenu: () => null };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => null };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((k) => [k, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  const items = ["first", "last"].map((id) => ({ id, text: id, attachments: [], createdAt: "2026-11-11T00:00:00Z" }));
  let renderer: ReturnType<typeof create>;
  function mkProps(editingId: string | null) {
    return React.createElement(exports.Composer, {
      draft: "", setDraft: () => {}, inputRef: { current: mainHandle },
      queue: { ...queue.emptyQueue(), status: "working", items, editingId }, canSteer: false,
      onSubmit: () => {}, onStop() {}, onQueue() {},
    });
  }
  act(() => { renderer = create(mkProps(initialEditingId)); });
  return {
    editFocused,
    setEditing(editingId: string | null) { act(() => { renderer.update(mkProps(editingId)); }); },
    close() { act(() => renderer.unmount()); },
  };
}

test("entering edit mode calls focus(end) on the queue-edit editor", () => {
  const f = editFocusFixture();
  try {
    assert.deepEqual(f.editFocused, [], "no focus before entering edit");
    f.setEditing("first");
    assert.deepEqual(f.editFocused, ["end"], "must call focus(\"end\") on edit entry");
  } finally { f.close(); }
});

test("re-entering edit mode after cancel still calls focus(end)", () => {
  const f = editFocusFixture();
  try {
    f.setEditing("first");
    f.setEditing(null);
    f.editFocused.length = 0;
    f.setEditing("first");
    assert.deepEqual(f.editFocused, ["end"], "must call focus(\"end\") on re-entry");
  } finally { f.close(); }
});

test("switching to a different queued row calls focus(end) for that row", () => {
  const f = editFocusFixture();
  try {
    f.setEditing("first");
    f.editFocused.length = 0;
    f.setEditing("last");
    assert.deepEqual(f.editFocused, ["end"], "switching rows must call focus(\"end\")");
  } finally { f.close(); }
});

test("leaving edit mode does not call focus on the edit editor", () => {
  const f = editFocusFixture("first");
  try {
    f.editFocused.length = 0;
    f.setEditing(null);
    assert.deepEqual(f.editFocused, [], "leaving edit must not focus the edit editor");
  } finally { f.close(); }
});

test("starting in edit mode calls focus(end) on mount", () => {
  const f = editFocusFixture("first");
  try {
    assert.deepEqual(f.editFocused, ["end"], "initial edit mode must call focus(\"end\")");
  } finally { f.close(); }
});
