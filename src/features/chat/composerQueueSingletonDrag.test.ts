// Conductor Rebuild — COMPOSER-QUEUE-SINGLETON-DRAG-135.
// Permanent regression port; unchanged frozen RED/GREEN is retained in evidence.
// Actual Composer/QueuePanel/QueueRow; drag payload and focus ports are unit boundaries, not native evidence.
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

type EditorProps = {
  value: string;
  placeholder: string;
  inputRef: { current: ComposerEditorHandle | null };
  onChange(value: string): void;
  onKeyDown(event: KeyboardEvent): void;
};
type FocusCall = { target: string; position?: string };
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const FocusPort = React.createContext(null);
const path = "src/features/chat/Composer.tsx";
const source = process.env.COMPOSER_QUEUE_SINGLETON_DRAG_SOURCE_REF
  ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_SINGLETON_DRAG_SOURCE_REF}:${path}`], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 })
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
const exports: Partial<Pick<typeof import("./Composer.tsx"), "Composer">> = {};
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
    if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => assert.fail("queued edit actions must not stage a paste") };
    if (name === "./composerPasteFilePaths.ts") return { readClipboardTextFromPlatform: () => assert.fail("queued edit actions must not read the clipboard") };
    if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
    if (name.endsWith("/useSettings.ts")) return { useSettings: () => ({ settings: null, save: () => assert.fail("queued edit actions must not save settings"), error: null, reload() {} }) };
    if (name.endsWith("/prefs.ts")) return { withBoolPref: () => assert.fail("queued edit actions must not change preferences") };
    if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("queued edit actions must not query a backend") };
    if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CircleDotIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
    throw new Error(`Unexpected Composer dependency: ${name}`);
  },
}, { filename: "actual-Composer.queue-singleton-drag.cjs", timeout: 5000 });
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
function dragPort() {
  const data: [string, string][] = [];
  const transfer = { effectAllowed: "uninitialized", setData(kind: string, value: string) { data.push([kind, value]); } };
  const event = { dataTransfer: transfer, prevented: 0, preventDefault() { this.prevented++; } };
  return { data, transfer, event, get prevented() { return event.prevented; } };
}
function fixture(initial = seed()) {
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
    return React.createElement(FocusPort.Provider, { value: focused }, React.createElement(exports.Composer, {
      key: model.sessionId, draft: "", inputRef, queue: model.queue, canSteer: true,
      setDraft: () => assert.fail("queued actions must not overwrite the main draft"),
      onSubmit: () => assert.fail("queued actions must not submit through a provider"),
      onStop: () => assert.fail("queued actions must not stop the agent"),
      onQueue(action: queue.QueueAction) { actions.push({ ...action }); apply(queue.actionStep(model.queue, action)); },
    }));
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
  const row = (id: string) => renderer.root.findByProps({ "data-id": id });
  return {
    row,
    listCount() { return renderer.root.findAllByType("ol").filter((node: { props: Record<string, unknown> }) => node.props["aria-label"] === "Queued messages").length; },
    editingRows() { return renderer.root.findAllByType("li").filter((node: { props: { className?: string } }) => node.props.className?.includes("is-editing")); },
    dragging(id: string) { return row(id).props.className.includes(" is-dragging"); },
    start(id: string) {
      const node = row(id); assert.equal(node.props.draggable, true, "never invoke a disabled dragstart callback");
      const port = dragPort(); act(() => node.props.onDragStart(port.event)); return port;
    },
    over(id: string) { const port = dragPort(); act(() => row(id).props.onDragOver(port.event)); return port; },
    drop(id: string) { const port = dragPort(); act(() => row(id).props.onDrop(port.event)); return port; },
    end(id: string) { act(() => row(id).props.onDragEnd()); },
    rowClick(id: string, label: string) {
      const node = row(id).findAllByType("button").find((node: { props: { children?: unknown } }) => node.props.children === label);
      assert.ok(node, `${label} must be rendered in the actual row`); assert.notEqual(node.props.disabled, true);
      act(() => node.props.onClick());
    },
    initial, actions, effects, focused, queries,
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

// Six singleton targets and fourteen enabled-path/regression controls.
test("singleton/initial visible row is not draggable", () => {
  const view = fixture(seed(1));
  try {
    assert.deepEqual(view.rows(), ["q1"]); assert.equal(view.present("Collapse queue"), false);
    assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
    assert.equal(view.row("q1").props.draggable, false, "singleton must not expose enabled drag affordance");
  } finally { view.close(); }
});
test("singleton/expanded shrink to one disables remaining row", () => {
  const view = fixture(seed(2));
  try {
    view.rowClick("q1", "Delete"); assert.deepEqual(view.rows(), ["q2"]);
    assert.deepEqual(view.queue.items, [view.initial.items[1]!]); assert.deepEqual(view.effects, []);
    assert.deepEqual(view.actions, [{ kind: "delete", id: "q1" }]);
    assert.equal(view.row("q2").props.draggable, false);
  } finally { view.close(); }
});
test("singleton/collapsed shrink reveals non-draggable survivor", () => {
  const view = fixture(seed(2));
  try {
    view.click("Collapse queue"); view.transition((current) => queue.turnEnded(current, "completed"));
    assert.deepEqual(view.rows(), ["q2"]); assert.equal(view.present("Expand queue"), false);
    assert.deepEqual(view.queue.items, [view.initial.items[1]!]);
    assert.deepEqual(view.effects, [{ kind: "start", text: "message 1", attachments: [] }]);
    assert.equal(view.row("q2").props.draggable, false);
  } finally { view.close(); }
});
test("singleton/Cancel edit restores focus but not dragging", () => {
  const view = fixture(seed(1));
  try {
    view.enter("q1"); view.click("Cancel"); assert.deepEqual(view.rows(), ["q1"]);
    assert.deepEqual(view.queue.items, view.initial.items); assert.deepEqual(view.effects, []);
    assert.deepEqual(view.rowFocus(), [{ target: "q1" }]); assert.deepEqual(view.queries, ['li[data-id="q1"]']);
    assert.equal(view.row("q1").props.draggable, false);
  } finally { view.close(); }
});
test("singleton/Save edit restores focus but not dragging", () => {
  const view = fixture(seed(1));
  try {
    view.enter("q1"); view.change("saved singleton"); view.click("Save");
    assert.deepEqual(view.rows(), ["q1"]); assert.equal(view.queue.items[0]!.text, "saved singleton");
    assert.deepEqual(view.effects, []); assert.deepEqual(view.rowFocus(), [{ target: "q1" }]);
    assert.deepEqual(view.queries, ['li[data-id="q1"]']);
    assert.equal(view.row("q1").props.draggable, false);
  } finally { view.close(); }
});
test("singleton/session remount does not expose dragging", () => {
  const view = fixture();
  try {
    const next = seed(1); view.switchSession(next);
    assert.deepEqual(view.rows(), ["q1"]); assert.deepEqual(view.queue, next);
    assert.deepEqual(view.focused, []); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
    assert.equal(view.row("q1").props.draggable, false);
  } finally { view.close(); }
});
test("control/empty queue renders no draggable row", () => {
  const view = fixture(seed(0));
  try {
    assert.deepEqual(view.rows(), []); assert.equal(view.listCount(), 0); assert.equal(view.present("Collapse queue"), false);
    assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/expanded multirow rows remain draggable", () => {
  const view = fixture();
  try {
    assert.deepEqual(view.rows(), ["q1", "q2", "q3"]);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, true);
    assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/enabled dragstart writes payload and sets own drag state", () => {
  const view = fixture();
  try {
    const port = view.start("q2"); assert.equal(port.transfer.effectAllowed, "move");
    assert.deepEqual(port.data, [["text/plain", "q2"]]); assert.equal(view.dragging("q2"), true);
    assert.equal(view.dragging("q1"), false); assert.deepEqual(view.queue, view.initial);
    assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/enabled distinct-target drop preserves full reorder payload", () => {
  const view = fixture();
  try {
    view.start("q1"); assert.equal(view.over("q3").prevented, 1); assert.equal(view.drop("q3").prevented, 1);
    assert.deepEqual(view.rows(), ["q2", "q3", "q1"]);
    assert.deepEqual(view.actions, [{ kind: "reorder", ids: ["q2", "q3", "q1"] }]);
    assert.deepEqual(view.queue.items, [view.initial.items[1]!, view.initial.items[2]!, view.initial.items[0]!]);
    assert.deepEqual(view.effects, []); for (const id of view.rows()) assert.equal(view.dragging(id), false);
  } finally { view.close(); }
});
test("control/self drop is already a no-op", () => {
  const view = fixture();
  try {
    view.start("q2"); assert.equal(view.drop("q2").prevented, 1);
    assert.deepEqual(view.queue.items, view.initial.items); assert.deepEqual(view.actions, []);
    assert.deepEqual(view.effects, []); assert.equal(view.dragging("q2"), false);
  } finally { view.close(); }
});
test("control/foreign dragover and drop do not reorder", () => {
  const view = fixture();
  try {
    assert.equal(view.over("q2").prevented, 0); assert.equal(view.drop("q2").prevented, 1);
    assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
    for (const id of view.rows()) assert.equal(view.dragging(id), false);
  } finally { view.close(); }
});
test("control/dragend clears own drag state without reordering", () => {
  const view = fixture();
  try {
    view.start("q2"); assert.equal(view.dragging("q2"), true); view.end("q2");
    assert.equal(view.dragging("q2"), false); assert.deepEqual(view.queue, view.initial);
    assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/active edit disables other display rows", () => {
  const view = fixture();
  try {
    view.enter("q2"); assert.deepEqual(view.rows(), ["q1", "q3"]);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, false);
    const editing = view.editingRows(); assert.equal(editing.length, 1);
    assert.equal(editing[0].props.draggable, undefined); assert.equal(editing[0].props.onDragStart, undefined);
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/collapsed multirow has no visible drag target", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); assert.deepEqual(view.rows(), []); assert.equal(view.listCount(), 0);
    view.click("Expand queue"); assert.deepEqual(view.rows(), ["q1", "q2", "q3"]);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, true);
    assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/1474 blank edit cannot save or begin dragging", () => {
  const view = fixture();
  try {
    view.enter("q2"); view.change(" \n "); assert.equal(view.available("Save"), false); assert.equal(view.available("Save and steer"), false);
    assert.equal(view.key("Enter").prevented, true); assert.equal(view.key("Enter", true).prevented, true);
    assert.equal(view.queue.editingId, "q2"); assert.deepEqual(view.queue.items, view.initial.items);
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]); assert.deepEqual(view.effects, []);
    assert.deepEqual(view.rowFocus(), []); for (const id of view.rows()) assert.equal(view.row(id).props.draggable, false);
  } finally { view.close(); }
});
test("control/1476 singleton regrowth stays expanded and restores multirow dragging", () => {
  const view = fixture(seed(2));
  try {
    view.click("Collapse queue"); view.transition((current) => queue.turnEnded(current, "completed"));
    assert.deepEqual(view.rows(), ["q2"]);
    view.transition((current) => queue.submit(current, { text: "new follow-up" }, "queue", new Date("2026-11-17T01:00:00Z")));
    assert.deepEqual(view.rows(), ["q2", "q3"]); assert.equal(view.present("Expand queue"), false); assert.equal(view.present("Collapse queue"), true);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, true);
    assert.deepEqual(view.rowFocus(), []); assert.deepEqual(view.queries, []);
    assert.deepEqual(view.effects, [{ kind: "start", text: "message 1", attachments: [] }]);
  } finally { view.close(); }
});
test("control/1479 removed edited row never receives return focus", () => {
  const view = fixture();
  try {
    view.enter("q2"); view.transition((current) => queue.remove(current, "q2"));
    assert.deepEqual(view.rows(), ["q1", "q3"]); assert.deepEqual(view.rowFocus(), []); assert.deepEqual(view.queries, []);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, true);
    assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/1479 session-key switch cannot focus old edited row", () => {
  const view = fixture();
  try {
    view.enter("q2"); const next = seed(); view.switchSession(next);
    assert.deepEqual(view.queue, next); assert.deepEqual(view.rows(), ["q1", "q2", "q3"]);
    assert.deepEqual(view.rowFocus(), []); assert.deepEqual(view.queries, []);
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/1479 Save-and-steer removes edited row without return focus", () => {
  const view = fixture();
  try {
    view.enter("q2"); view.change("steered middle"); view.click("Save and steer");
    assert.deepEqual(view.rows(), ["q1", "q3"]); assert.equal(view.queue.editingId, null);
    assert.deepEqual(view.rowFocus(), []); assert.deepEqual(view.queries, []);
    for (const id of view.rows()) assert.equal(view.row(id).props.draggable, true);
    assert.deepEqual(view.effects, [{ kind: "steer", text: "steered middle", attachments: view.initial.items[1]!.attachments }]);
  } finally { view.close(); }
});
