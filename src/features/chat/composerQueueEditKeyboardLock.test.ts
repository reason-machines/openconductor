// Conductor Rebuild — COMPOSER-QUEUE-EDIT-KEYBOARD-LOCK-135.
// Permanent regression port; frozen original RED/GREEN fixture is retained in evidence.
// Enter edit through actual visible button + real reducer; never seed editingId.
// Full actual Composer + queue reducers; DOM/editor ports are explicit boundaries.
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

type EditorProps = {
  value: string;
  placeholder: string;
  inputRef: { current: ComposerEditorHandle | null };
  onChange(value: string): void;
  onKeyDown(event: KeyboardEvent): void;
  onFocus(): void;
  onBlur(): void;
};
type FocusCall = { target: string; position?: string };
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const FocusPort = React.createContext(null);
const OverridesPort = React.createContext({});
const path = "src/features/chat/Composer.tsx";
const source = process.env.COMPOSER_QUEUE_EDIT_KEYBOARD_LOCK_SOURCE_REF
  ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_EDIT_KEYBOARD_LOCK_SOURCE_REF}:${path}`], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 })
  : readFileSync(path, "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.deepEqual(javascript.diagnostics?.filter((entry: { category: number }) => entry.category === ts.DiagnosticCategory.Error) ?? [], [], "complete actual Composer must transpile before mounting");
function EditorBoundary(props: EditorProps) {
  const focused: FocusCall[] = React.useContext(FocusPort);
  const latest = React.useRef(props);
  latest.current = props;
  React.useLayoutEffect(() => {
    const target = props.placeholder === "Edit queued message" ? "edit" : "composer";
    const handle: ComposerEditorHandle = {
      focus(position) { focused.push({ target, position }); },
      blur() {}, visible: () => true, focused: () => false, composing: () => false,
      selection: () => ({ text: latest.current.value, start: 0, end: 0 }),
      replaceRange: () => assert.fail("queued edit actions must not replace main editor text"),
      insertFile: () => assert.fail("queued edit actions must not insert files"),
      deleteRange: () => assert.fail("queued edit actions must not delete main editor text"),
      newline: () => assert.fail("queued edit actions must not insert a main-editor newline"),
    };
    props.inputRef.current = handle;
    return () => { if (props.inputRef.current === handle) props.inputRef.current = null; };
  }, [props.inputRef]);
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
    if (name.endsWith("/KeybindingsProvider.tsx")) return { useKeybindingOverrides: () => ({ overrides: React.useContext(OverridesPort) }), useKeybindings() {} };
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
    if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => assert.fail("queued edit actions must not stage a paste") };
    if (name === "./composerPasteFilePaths.ts") return { readClipboardTextFromPlatform: () => assert.fail("queued edit actions must not read the clipboard") };
    if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
    if (name.endsWith("/useSettings.ts")) return { useSettings: () => ({ settings: null, save: () => assert.fail("queued edit actions must not save settings"), error: null, reload() {} }) };
    if (name.endsWith("/prefs.ts")) return { withBoolPref: () => assert.fail("queued edit actions must not change preferences") };
    if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("queued edit actions must not query a backend") };
    if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CircleDotIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
    throw new Error(`Unexpected Composer dependency: ${name}`);
  },
}, { filename: "actual-Composer.queue-edit-keyboard-lock.cjs", timeout: 5000 });
assert.ok(exports.Composer, "mount the complete actual exported Composer");

function seed(count = 3): queue.ChatQueue {
  let current = queue.turnStarted(queue.emptyQueue());
  for (let i = 1; i <= count; i++) {
    const result = queue.submit(current, { text: `message ${i}` }, "queue", new Date(`2026-11-17T00:00:0${i}Z`), i === 2 ? [{ name: "note.txt", text: "retained attachment" }] : []);
    assert.deepEqual(result.effects, [], "ordinary active turn keeps seed messages queued");
    current = result.queue;
  }
  return current;
}
function fixture(initial = seed(), overrides: Overrides = {}) {
  let currentQueue = initial;
  let sessionId = "session-a";
  let update: (next: { sessionId: string; queue: queue.ChatQueue }) => void;
  let renderer: ReturnType<typeof create>;
  const actions: queue.QueueAction[] = [];
  const effects: queue.Effect[] = [];
  const focused: FocusCall[] = [];
  const queries: string[] = [];
  function apply(result: queue.ChatQueue | queue.QueueStep) {
    if ("queue" in result) { effects.push(...result.effects); update({ sessionId, queue: result.queue }); }
    else update({ sessionId, queue: result });
  }
  function Host() {
    const [model, setModel] = React.useState({ sessionId: "session-a", queue: initial });
    currentQueue = model.queue;
    sessionId = model.sessionId;
    update = setModel;
    const inputRef = React.useRef(null);
    // WorkspaceView uses Composer key={chatId}; the host mirrors that boundary.
    return React.createElement(OverridesPort.Provider, { value: overrides }, React.createElement(FocusPort.Provider, { value: focused }, React.createElement(exports.Composer, {
      key: model.sessionId, draft: "", inputRef, queue: model.queue, canSteer: true,
      setDraft: () => assert.fail("queued actions must not overwrite the main draft"),
      onSubmit: () => assert.fail("queued actions must not submit through a provider"),
      onStop: () => assert.fail("queued actions must not stop the agent"),
      onQueue(action: queue.QueueAction) { actions.push({ ...action }); apply(queue.actionStep(model.queue, action)); },
    })));
  }
  act(() => { renderer = create(React.createElement(Host), { createNodeMock(element: { type: string; props: Record<string, unknown> }) {
    if (element.type !== "ol" || element.props["aria-label"] !== "Queued messages") return null;
    return { querySelector(selector: string) {
      queries.push(selector);
      const match = /^li\[data-id="([^"]+)"\]$/.exec(selector);
      assert.ok(match, "focus must use the existing exact-row selector");
      const id = match[1]!;
      const rows = renderer.root.findAllByType("li").filter((node: { props: Record<string, unknown> }) => node.props["data-id"] === id);
      assert.ok(rows.length <= 1, "host DOM focus port cannot invent duplicate rows");
      if (rows.length === 0) return null;
      return { focus() { focused.push({ target: id }); } };
    } };
  } }); });
  const buttons = () => renderer.root.findAllByType("button");
  const button = (label: string) => {
    const found = buttons().filter((node: { props: { children?: unknown } }) => node.props.children === label);
    assert.ok(found.length <= 1, `ambiguous ${label} button`);
    return found[0];
  };
  const edit = () => {
    const editors = renderer.root.findAllByType(EditorBoundary).filter((node: { props: EditorProps }) => node.props.placeholder === "Edit queued message");
    assert.equal(editors.length, 1, "actual QueueRow must mount one editor");
    return editors[0];
  };
  return {
    initial, actions, effects, focused, queries,
    get editValue() { return edit().props.value; },
    focusRow(id: string) {
      const row = renderer.root.findByProps({ "data-id": id });
      assert.equal(row.props.tabIndex, 0, "focus only an actually rendered focusable row");
      const editors = renderer.root.findAllByType(EditorBoundary).filter((node: { props: EditorProps }) => node.props.placeholder === "Edit queued message");
      assert.ok(editors.length <= 1);
      // DOM/editor focus is an explicit port, not physical Tab evidence. Invoke the
      // actual queued-editor blur prop and observed DOM focus handlers, not a fake save/cancel.
      const target = {};
      act(() => {
        editors[0]?.props.onBlur();
        for (let node = row; node; node = node.parent) {
          if (typeof node.type === "string" && typeof node.props.onFocus === "function") node.props.onFocus({ target, currentTarget: target });
        }
        focused.push({ target: id });
      });
    },
    rowKey(id: string, key: string, modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {}, { child = false, composing = false } = {}) {
      const row = renderer.root.findByProps({ "data-id": id });
      assert.equal(row.props.tabIndex, 0);
      const target = {};
      const fields = { key, code: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...modifiers };
      const nativeEvent = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), fields, { isComposing: composing });
      act(() => row.props.onKeyDown({ ...fields, nativeEvent, target: child ? {} : target, currentTarget: target,
        preventDefault() { nativeEvent.preventDefault(); }, stopPropagation() { nativeEvent.stopPropagation(); } }));
      return { prevented: nativeEvent.defaultPrevented, stopped: nativeEvent.cancelBubble };
    },
    get queue() { return currentQueue; },
    rowFocus() { return focused.filter((call) => call.target !== "edit" && call.target !== "composer"); },
    entryFocus() { return focused.filter((call) => call.target === "edit"); },
    rows(): string[] { return renderer.root.findAllByType("li").filter((node: { props: Record<string, unknown> }) => typeof node.props["data-id"] === "string").map((node: { props: Record<string, string> }) => node.props["data-id"]); },
    present(label: string): boolean { return !!button(label); },
    available(label: string): boolean { const node = button(label); return !!node && !node.props.disabled; },
    click(label: string) {
      const node = button(label);
      assert.ok(node, `${label} must actually be rendered`);
      assert.notEqual(node.props.disabled, true, "never invoke a disabled callback");
      act(() => node.props.onClick());
    },
    enter(id: string) {
      const row = renderer.root.findByProps({ "data-id": id });
      const node = row.findAllByType("button").find((node: { props: { children?: unknown } }) => node.props.children === "Edit");
      assert.ok(node, "actual visible Edit action is required");
      assert.notEqual(node.props.disabled, true);
      act(() => node.props.onClick());
      assert.equal(currentQueue.editingId, id);
    },
    change(value: string) { const node = edit(); act(() => node.props.onChange(value)); },
    key(key: string, metaKey = false) {
      const node = edit();
      const event = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key, code: key, isComposing: false, shiftKey: false, metaKey, ctrlKey: false, altKey: false });
      act(() => node.props.onKeyDown(event));
      return { prevented: event.defaultPrevented, stopped: event.cancelBubble };
    },
    transition(reduce: (current: queue.ChatQueue) => queue.ChatQueue | queue.QueueStep) { act(() => apply(reduce(currentQueue))); },
    switchSession(next: queue.ChatQueue) { act(() => update({ sessionId: "session-b", queue: next })); },
    rerender() { act(() => renderer.update(React.createElement(Host))); },
    close() { act(() => renderer.unmount()); },
  };
}
type View = ReturnType<typeof fixture>;

const unhandled = { prevented: false, stopped: false };
const handled = { prevented: true, stopped: true };
const unsaved = "unsaved edit A, not committed";
const rowKeys = ["e", "Backspace", "Enter", "ArrowDown", "ArrowUp", "Home", "End", "Escape"] as const;
const queueCommands = ["chat.queue.editMessage", "chat.queue.deleteMessage", "chat.queue.steerMessage"] as const;
function ordinaryEditThenFocusB(view: View) {
  assert.equal(view.queue.editingId, null, "target setup must start with no edit");
  view.enter("q1"); // actual rendered Edit button -> actual actionStep -> actual beginEdit
  view.change(unsaved); // actual queued editor onChange, not a seeded state override
  assert.equal(view.editValue, unsaved);
  const snapshot = JSON.parse(JSON.stringify(view.queue));
  view.focusRow("q2"); // actual queued-editor blur prop + rendered row focus port
  assert.equal(view.queue.editingId, "q1", "ordinary focus B must not cancel/finish A");
  assert.equal(view.editValue, unsaved, "ordinary focus B must retain unsaved A draft");
  assert.deepEqual(view.queue, snapshot);
  assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }]);
  assert.deepEqual(view.effects, []);
  view.focused.length = 0;
  view.queries.length = 0;
  return snapshot;
}
function retainsActiveEdit(view: View, before: queue.ChatQueue) {
  assert.deepEqual(view.queue, before, "row key must not mutate queue or active edit");
  assert.equal(view.editValue, unsaved, "row key must preserve unsaved A draft");
  assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }]);
  assert.deepEqual(view.effects, []);
  assert.deepEqual(view.focused, []);
  assert.deepEqual(view.queries, []);
}
for (const key of rowKeys) {
  test(`active-edit/nonediting-row/${key}`, () => {
    const view = fixture();
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", key), unhandled, "active edit globally leaves row commands/navigation unhandled");
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const command of queueCommands) {
  test(`active-edit/remapped/${command}`, () => {
    const view = fixture(seed(), { [command]: [{ key: { kind: "logical", value: "ArrowUp" }, modifiers: ["ctrl"] }] });
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", "ArrowUp", { ctrlKey: true }), unhandled);
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const key of rowKeys) {
  test(`control/no-edit/${key}`, () => {
    const view = fixture();
    try {
      view.focusRow("q2"); view.focused.length = 0;
      assert.deepEqual(view.rowKey("q2", key), handled);
      if (key === "e") {
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]);
        assert.deepEqual(view.queue, { ...view.initial, editingId: "q2" });
        assert.deepEqual(view.effects, []);
        assert.deepEqual(view.focused.map((call) => call.target), ["edit"]);
      } else if (key === "Backspace" || key === "Enter") {
        assert.deepEqual(view.actions, [{ kind: key === "Backspace" ? "delete" : "steer", id: "q2" }]);
        assert.deepEqual(view.queue, { ...view.initial, items: [view.initial.items[0]!, view.initial.items[2]!] });
        assert.deepEqual(view.effects, key === "Backspace" ? [] : [{ kind: "steer", text: "message 2", attachments: view.initial.items[1]!.attachments }]);
        assert.deepEqual(view.focused.map((call) => call.target), ["q3"]);
      } else {
        const destination = key === "ArrowDown" || key === "End" ? "q3" : key === "Escape" ? "composer" : "q1";
        assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
        assert.deepEqual(view.queue, view.initial);
        assert.deepEqual(view.focused.map((call) => call.target), [destination]);
      }
    } finally { view.close(); }
  });
}
for (const [name, key, options] of [
  ["IME event ignored", "e", { composing: true }],
  ["child-target event ignored", "e", { child: true }],
  ["unknown key ignored", "x", {}],
] as const) {
  test(`control/${name}`, () => {
    const view = fixture();
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", key, {}, options), unhandled);
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const [name, key, metaKey] of [
  ["Cancel", "Escape", false], ["Save", "Enter", false], ["Save-and-steer", "Enter", true],
] as const) {
  test(`control/edit editor ${name} preserved`, () => {
    const view = fixture();
    try {
      view.enter("q1"); view.change(unsaved); view.focused.length = 0;
      assert.equal(view.key(key, metaKey).prevented, true, "actual edit-editor keyboard callback stays enabled");
      assert.equal(view.queue.editingId, null);
      if (name === "Cancel") {
        assert.deepEqual(view.queue, view.initial);
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }, { kind: "cancelEdit" }]);
        assert.deepEqual(view.effects, []);
      } else {
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }, { kind: "saveEdit", input: { text: unsaved }, steer: metaKey }]);
        assert.deepEqual(view.queue, { ...view.initial, items: metaKey ? view.initial.items.slice(1) : [{ ...view.initial.items[0]!, text: unsaved }, ...view.initial.items.slice(1)] });
        assert.deepEqual(view.effects, metaKey ? [{ kind: "steer", text: unsaved, attachments: [] }] : []);
      }
      assert.deepEqual(view.focused.map((call) => call.target), name === "Save-and-steer" ? [] : ["q1"]);
    } finally { view.close(); }
  });
}
test("control/session remount has no leaked edit lock", () => {
  const view = fixture();
  try {
    ordinaryEditThenFocusB(view);
    view.switchSession(seed()); // actual keyed Composer remount; second session has no active edit
    assert.equal(view.queue.editingId, null);
    view.focusRow("q2"); view.actions.length = 0; view.effects.length = 0; view.focused.length = 0;
    assert.deepEqual(view.rowKey("q2", "e"), handled);
    assert.equal(view.queue.editingId, "q2");
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]);
    assert.deepEqual(view.effects, []);
    assert.deepEqual(view.focused.map((call) => call.target), ["edit"]);
  } finally { view.close(); }
});
