// Conductor Rebuild — COMPOSER-QUEUE-EDIT-EMPTY-SAVE-135.
// Frozen fixture preparation only. See .qa/queue-edit-empty-135/fixture-freeze/.
// Mount the complete actual Composer -> QueuePanel -> QueueRow. Only the editor,
// preferences/presence/tooltips and unrelated side boundaries are stubbed.
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
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

type State = { name: string; status: queue.SessionStatus; paused: boolean; canSteer: boolean };
type EditorProps = {
  value: string;
  placeholder: string;
  inputRef: { current: ComposerEditorHandle | null };
  onChange(value: string): void;
  onKeyDown(event: unknown): void;
};
type KeyOptions = { metaKey?: boolean; composing?: boolean };
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const STATES: readonly State[] = [
  { name: "working/steer", status: "working", paused: false, canSteer: true },
  { name: "working/no-steer", status: "working", paused: false, canSteer: false },
  { name: "idle/paused", status: "idle", paused: true, canSteer: true },
];
const BLANKS = ["", " ", " \n\t "];
const path = "src/features/chat/Composer.tsx";
const source = process.env.COMPOSER_QUEUE_EDIT_EMPTY_SOURCE_REF
  ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_EDIT_EMPTY_SOURCE_REF}:${path}`], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 })
  : readFileSync(path, "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.deepEqual(javascript.diagnostics?.filter((entry: { category: number }) => entry.category === ts.DiagnosticCategory.Error) ?? [], [], "actual Composer must transpile before mounting");

function EditorBoundary(props: EditorProps) {
  React.useLayoutEffect(() => {
    const handle: ComposerEditorHandle = {
      focus() {}, blur() {}, visible: () => true, focused: () => false, composing: () => false,
      selection: () => ({ text: props.value, start: 0, end: 0 }),
      replaceRange: () => assert.fail("queue edit must not imperatively replace the editor"),
      insertFile: () => assert.fail("queue edit must not insert a file"),
      deleteRange: () => assert.fail("queue edit must not delete a range"),
      newline: () => assert.fail("save keys must not insert a newline"),
    };
    props.inputRef.current = handle;
    return () => { if (props.inputRef.current === handle) props.inputRef.current = null; };
  }, [props.inputRef, props.value]);
  return null;
}
const exports: Partial<Pick<typeof import("./Composer"), "Composer">> = {};
runInNewContext(javascript.outputText, {
  exports,
  CSS: { escape: (value: string) => value },
  requestAnimationFrame(callback: () => void) { callback(); return 1; },
  queueMicrotask(callback: () => void) { callback(); },
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
    if (name === "./SlashMenu.tsx") return { SlashMenu: () => null };
    if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
    if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => assert.fail("queue edit must not stage a long paste") };
    if (name === "./composerPasteFilePaths.ts") return { readClipboardTextFromPlatform: () => assert.fail("queue edit must not read the clipboard") };
    if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
    if (name.endsWith("/useSettings.ts")) return { useSettings: () => ({ settings: null, save: () => assert.fail("queue edit must not save settings"), error: null, reload() {} }) };
    if (name.endsWith("/prefs.ts")) return { withBoolPref: () => assert.fail("queue edit must not change preferences") };
    if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("queue edit must not query a backend") };
    if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CircleDotIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
    throw new Error(`Unexpected Composer dependency: ${name}`);
  },
}, { filename: "actual-Composer.queue-edit-empty.cjs", timeout: 5000 });
assert.ok(exports.Composer, "the complete source must export the actual Composer");

function seed(state: State, attachments: readonly queue.MessageAttachment[] = []): queue.ChatQueue {
  return {
    ...queue.emptyQueue(), status: state.status, paused: state.paused, editingId: "q1", next: 3,
    items: [
      { id: "q1", text: "original first", attachments, createdAt: "2026-11-17T00:00:00Z" },
      { id: "q2", text: "original second", attachments: [], createdAt: "2026-11-17T00:00:01Z" },
    ],
  };
}
function fixture(state: State = STATES[0]!, attachments: readonly queue.MessageAttachment[] = []) {
  const initial = seed(state, attachments);
  const actions: queue.QueueAction[] = [];
  const effects: queue.Effect[] = [];
  let currentQueue = initial;
  let renderer: ReturnType<typeof create>;
  function Host() {
    const [current, setCurrent] = React.useState(initial);
    currentQueue = current;
    const inputRef = React.useRef(null);
    return React.createElement(exports.Composer, {
      draft: "", inputRef, queue: current, canSteer: state.canSteer,
      setDraft: () => assert.fail("queued editing must not overwrite the main draft"),
      onSubmit: () => assert.fail("queued editing must not submit through the provider"),
      onStop: () => assert.fail("queued editing must not stop the agent"),
      onQueue(action: queue.QueueAction) {
        actions.push({ ...action });
        // Actual reducer, with no preemptive blank guard and no mocked result.
        const result = queue.actionStep(current, action);
        if ("queue" in result) {
          effects.push(...result.effects);
          setCurrent(result.queue);
        } else setCurrent(result);
      },
    });
  }
  act(() => { renderer = create(React.createElement(Host)); });
  const editors = (): { props: EditorProps }[] => renderer.root.findAllByType(EditorBoundary)
    .filter((node: { props: EditorProps }) => node.props.placeholder === "Edit queued message");
  const editor = (): EditorProps => {
    const found = editors();
    assert.equal(found.length, 1, "drive the editing-row editor, never the main editor");
    return found[0]!.props;
  };
  const buttons = () => renderer.root.findAllByType("button");
  const button = (label: string) => {
    const found = buttons().filter((node: { props: { children?: unknown } }) => node.props.children === label);
    assert.ok(found.length <= 1, `ambiguous ${label} button`);
    return found[0];
  };
  return {
    initial, actions, effects,
    get queue() { return currentQueue; },
    get draft() { return editors()[0]?.props.value; },
    change(value: string) { act(() => editor().onChange(value)); },
    available(label: string): boolean { const node = button(label); return !!node && !node.props.disabled; },
    present(label: string): boolean { return !!button(label); },
    click(label: string): boolean {
      const node = button(label);
      if (!node || node.props.disabled) return false; // Never invoke a disabled callback.
      act(() => node.props.onClick());
      return true;
    },
    key(key: string, { metaKey = false, composing = false }: KeyOptions = {}) {
      const fields = { key, code: key, shiftKey: false, metaKey, ctrlKey: false, altKey: false };
      const command = key === "Escape" ? "chat.queueEdit.cancel" : metaKey ? "chat.queueEdit.saveAndSteer" : "chat.queueEdit.save";
      assert.ok(effectiveShortcuts(command).some((shortcut) => shortcuts.matchesEvent(shortcut, fields)), "key must match the real default registry");
      let prevented = false;
      act(() => editor().onKeyDown({ ...fields, isComposing: composing,
        preventDefault() { prevented = true; }, stopPropagation() {},
      }));
      return prevented;
    },
    deleteFirst() {
      const row = renderer.root.findByProps({ "data-id": "q1" });
      const node = row.findByProps({ "aria-label": "Delete queued message" });
      assert.notEqual(node.props.disabled, true);
      act(() => node.props.onClick());
    },
    close() { act(() => renderer.unmount()); },
  };
}
type View = ReturnType<typeof fixture>;
function retained(view: View, value: string) {
  assert.deepEqual({ actions: view.actions, effects: view.effects, queue: view.queue, draft: view.draft },
    { actions: [], effects: [], queue: view.initial, draft: value }, "blank edit must remain editable with both items and zero dispatch/effects");
}

// Three decisive RED families. These assertions are expectations, not a claim
// that the unmodified source has run or failed.
for (const state of STATES) for (const [index, blank] of BLANKS.entries()) {
  for (const label of state.status === "working" && state.canSteer ? ["Save", "Save and steer"] : ["Save"]) {
    test(`blank-button ${state.name} blank${index} ${label}`, () => {
      const view = fixture(state);
      try {
        view.change(blank);
        const available = view.available(label);
        const clicked = view.click(label); // Exercise only an actually enabled action.
        assert.deepEqual({ available, clicked, actions: view.actions, effects: view.effects, queue: view.queue, draft: view.draft },
          { available: false, clicked: false, actions: [], effects: [], queue: view.initial, draft: blank });
      } finally { view.close(); }
    });
  }
  test(`blank-save-key ${state.name} blank${index}`, () => {
    const view = fixture(state);
    try { view.change(blank); assert.equal(view.key("Enter"), true); retained(view, blank); }
    finally { view.close(); }
  });
  if (state.status === "working" && state.canSteer) test(`blank-steer-key ${state.name} blank${index}`, () => {
    const view = fixture(state);
    try { view.change(blank); assert.equal(view.key("Enter", { metaKey: true }), true); retained(view, blank); }
    finally { view.close(); }
  });
}

// Nine unchanged-control families from frozen-red-plan.json.
for (const state of STATES) for (const route of ["button", "key"] as const) {
  test(`control/nonblank-save ${state.name} ${route}`, () => {
    const view = fixture(state);
    try {
      view.change("updated first");
      if (route === "button") assert.equal(view.click("Save"), true);
      else assert.equal(view.key("Enter"), true);
      assert.deepEqual(view.actions, [{ kind: "saveEdit", input: { text: "updated first" }, steer: false }]);
      assert.deepEqual(view.effects, []);
      assert.deepEqual(view.queue, { ...view.initial, editingId: null, items: [{ ...view.initial.items[0]!, text: "updated first" }, view.initial.items[1]!] });
    } finally { view.close(); }
  });
}
for (const route of ["button", "key"] as const) {
  test(`control/nonblank-steer ${route}`, () => {
    const view = fixture();
    try {
      view.change("updated first");
      if (route === "button") assert.equal(view.click("Save and steer"), true);
      else assert.equal(view.key("Enter", { metaKey: true }), true);
      assert.deepEqual(view.actions, [{ kind: "saveEdit", input: { text: "updated first" }, steer: true }]);
      assert.deepEqual(view.effects, [{ kind: "steer", text: "updated first", attachments: [] }]);
      assert.deepEqual(view.queue, { ...view.initial, editingId: null, items: [view.initial.items[1]!] });
    } finally { view.close(); }
  });
  test(`control/cancel ${route}`, () => {
    const view = fixture(STATES[0]!, [{ name: "note.txt", text: "attached body" }]);
    try {
      view.change("");
      if (route === "button") assert.equal(view.click("Cancel"), true);
      else assert.equal(view.key("Escape"), true);
      assert.deepEqual(view.actions, [{ kind: "cancelEdit" }]);
      assert.deepEqual(view.effects, []);
      assert.deepEqual(view.queue, { ...view.initial, editingId: null });
    } finally { view.close(); }
  });
}
test("control/explicit-delete after Cancel", () => {
  const view = fixture();
  try {
    assert.equal(view.click("Cancel"), true);
    view.deleteFirst();
    assert.deepEqual(view.actions, [{ kind: "cancelEdit" }, { kind: "delete", id: "q1" }]);
    assert.deepEqual(view.effects, []);
    assert.deepEqual(view.queue, { ...view.initial, editingId: null, items: [view.initial.items[1]!] });
  } finally { view.close(); }
});
for (const value of ["", "updated first"]) for (const metaKey of [false, true]) {
  test(`control/ime ${JSON.stringify(value)} meta=${metaKey}`, () => {
    const view = fixture();
    try { view.change(value); assert.equal(view.key("Enter", { metaKey, composing: true }), false); retained(view, value); }
    finally { view.close(); }
  });
}
test("control/no-steer hides opposite action and ordinary Save still works", () => {
  const view = fixture(STATES[1]!);
  try {
    view.change("updated first");
    assert.equal(view.present("Save and steer"), false);
    assert.equal(view.key("Enter", { metaKey: true }), false);
    retained(view, "updated first");
    assert.equal(view.click("Save"), true);
    assert.deepEqual(view.actions, [{ kind: "saveEdit", input: { text: "updated first" }, steer: false }]);
    assert.deepEqual(view.effects, []);
    assert.deepEqual(view.queue, { ...view.initial, editingId: null, items: [{ ...view.initial.items[0]!, text: "updated first" }, view.initial.items[1]!] });
  } finally { view.close(); }
});
for (const route of ["button", "key"] as const) {
  test(`control/structured-file ${route}`, () => {
    const view = fixture();
    const parts: document.ComposerPart[] = [{ kind: "file", path: "src/main.ts", label: "main.ts", directory: false }];
    const draft = document.writeComposerDraft(parts);
    const expected: userContent.UserPrompt = { text: "@src/main.ts", userContent: { version: 1, parts, attachments: [] } };
    try {
      assert.deepEqual(userContent.submittedUserPrompt(draft), expected);
      view.change(draft);
      if (route === "button") assert.equal(view.click("Save"), true);
      else assert.equal(view.key("Enter"), true);
      assert.deepEqual(view.actions, [{ kind: "saveEdit", input: expected, steer: false }]);
      assert.deepEqual(view.effects, []);
      assert.deepEqual(view.queue, { ...view.initial, editingId: null, items: [{ ...view.initial.items[0]!, ...expected }, view.initial.items[1]!] });
      assert.equal(userContent.queuedUserDraft(view.queue.items[0]!), draft);
    } finally { view.close(); }
  });
}
for (const label of ["Save", "Save and steer"]) for (const [index, blank] of BLANKS.entries()) {
  test(`control/attachment-only-blank blank${index} ${label}`, () => {
    const view = fixture(STATES[0]!, [{ name: "note.txt", text: "attached body" }]);
    try {
      view.change(blank);
      const available = view.available(label);
      const clicked = view.click(label);
      assert.deepEqual({ available, clicked, actions: view.actions, effects: view.effects, queue: view.queue, draft: view.draft },
        { available: false, clicked: false, actions: [], effects: [], queue: view.initial, draft: blank });
    } finally { view.close(); }
  });
}
for (const [index, blank] of BLANKS.entries()) {
  test(`control/direct-reducer-deletion blank${index}`, () => {
    const initial = seed(STATES[0]!);
    const result = queue.saveEdit(initial, userContent.submittedUserPrompt(blank), false);
    assert.deepEqual(result, { queue: { ...initial, editingId: null, items: [initial.items[1]!] }, effects: [] });
    assert.equal(initial.items.length, 2, "the pure reducer must not mutate its input");
  });
}
