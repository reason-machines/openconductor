// Conductor Rebuild — COMPOSER-QUEUE-COLLAPSE-SHRINK-135.
// Frozen source preparation only; execution requires the ledger's serialized slot.
// Mount complete actual Composer/QueuePanel/QueueRow; use the actual queue reducers.
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
};
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const path = "src/features/chat/Composer.tsx";
const source = process.env.COMPOSER_QUEUE_COLLAPSE_SOURCE_REF
  ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_QUEUE_COLLAPSE_SOURCE_REF}:${path}`], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 })
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
      replaceRange: () => assert.fail("collapse must not replace editor text"),
      insertFile: () => assert.fail("collapse must not insert a file"),
      deleteRange: () => assert.fail("collapse must not delete editor text"),
      newline: () => assert.fail("collapse must not insert a newline"),
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
    if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => assert.fail("collapse must not stage a paste") };
    if (name === "./composerPasteFilePaths.ts") return { readClipboardTextFromPlatform: () => assert.fail("collapse must not read the clipboard") };
    if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
    if (name.endsWith("/useSettings.ts")) return { useSettings: () => ({ settings: null, save: () => assert.fail("collapse must not save settings"), error: null, reload() {} }) };
    if (name.endsWith("/prefs.ts")) return { withBoolPref: () => assert.fail("collapse must not change preferences") };
    if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("collapse must not query a backend") };
    if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CircleDotIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
    throw new Error(`Unexpected Composer dependency: ${name}`);
  },
}, { filename: "actual-Composer.queue-collapse-shrink.cjs", timeout: 5000 });
assert.ok(exports.Composer, "mount the complete actual exported Composer");

function seed(count = 2): queue.ChatQueue {
  let current = queue.turnStarted(queue.emptyQueue());
  for (let i = 1; i <= count; i++) {
    const result = queue.submit(current, { text: `message ${i}` }, "queue", new Date(`2026-11-17T00:00:0${i}Z`), i === 2 ? [{ name: "note.txt", text: "retained attachment" }] : []);
    assert.deepEqual(result.effects, [], "seed only queues behind a working turn");
    current = result.queue;
  }
  return current;
}
function fixture(initial = seed(), canSteer = true) {
  let currentQueue = initial;
  let update: (next: queue.ChatQueue) => void;
  let renderer: ReturnType<typeof create>;
  const actions: queue.QueueAction[] = [];
  const effects: queue.Effect[] = [];
  function apply(result: queue.ChatQueue | queue.QueueStep) {
    if ("queue" in result) { effects.push(...result.effects); update(result.queue); }
    else update(result);
  }
  function Host() {
    const [current, setCurrent] = React.useState(initial);
    currentQueue = current;
    update = setCurrent;
    const inputRef = React.useRef(null);
    return React.createElement(exports.Composer, {
      draft: "", inputRef, queue: current, canSteer,
      setDraft: () => assert.fail("queue controls must not overwrite the main draft"),
      onSubmit: () => assert.fail("queue controls must not submit through the provider"),
      onStop: () => assert.fail("queue controls must not stop the agent"),
      onQueue(action: queue.QueueAction) { actions.push({ ...action }); apply(queue.actionStep(current, action)); },
    });
  }
  act(() => { renderer = create(React.createElement(Host)); });
  const buttons = () => renderer.root.findAllByType("button");
  const button = (label: string) => {
    const found = buttons().filter((node: { props: { children?: unknown } }) => node.props.children === label);
    assert.ok(found.length <= 1, `ambiguous ${label} button`);
    return found[0];
  };
  return {
    initial, actions, effects,
    get queue() { return currentQueue; },
    rows(): string[] { return renderer.root.findAllByType("li").filter((node: { props: Record<string, unknown> }) => typeof node.props["data-id"] === "string").map((node: { props: Record<string, string> }) => node.props["data-id"]); },
    present(label: string): boolean { return !!button(label); },
    available(label: string): boolean { const node = button(label); return !!node && !node.props.disabled; },
    click(label: string) {
      const node = button(label);
      assert.ok(node, `${label} must actually be rendered`);
      assert.notEqual(node.props.disabled, true, "never invoke a disabled callback");
      act(() => node.props.onClick());
    },
    rowClick(id: string, label: string) {
      const row = renderer.root.findByProps({ "data-id": id });
      const node = row.findAllByType("button").find((node: { props: { children?: unknown } }) => node.props.children === label);
      assert.ok(node, `${label} must be visible in ${id}`);
      assert.notEqual(node.props.disabled, true);
      act(() => node.props.onClick());
    },
    changeEdit(value: string) {
      const editors = renderer.root.findAllByType(EditorBoundary).filter((node: { props: EditorProps }) => node.props.placeholder === "Edit queued message");
      assert.equal(editors.length, 1);
      act(() => editors[0].props.onChange(value));
    },
    transition(reduce: (current: queue.ChatQueue) => queue.ChatQueue | queue.QueueStep) { act(() => apply(reduce(currentQueue))); },
    rerender() { act(() => renderer.update(React.createElement(Host))); },
    close() { act(() => renderer.unmount()); },
  };
}
type View = ReturnType<typeof fixture>;
function singleton(view: View, id: string) {
  assert.deepEqual(view.rows(), [id], "remaining singleton must be rendered");
  assert.equal(view.present("Collapse queue"), false, "singleton must not offer collapse");
  assert.equal(view.present("Expand queue"), false, "singleton must not need expanding");
}
function completed(view: View) { view.transition((current) => queue.turnEnded(current, "completed")); }
function append(view: View) { view.transition((current) => queue.submit(current, { text: "new follow-up" }, "queue", new Date("2026-11-17T01:00:00Z"))); }

// Five decisive expectations. Their failure is predicted, not an executed RED.
test("shrink/collapsed completion 2-to-1 reveals the remaining row", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); completed(view); singleton(view, "q2");
    assert.deepEqual(view.queue.items, [view.initial.items[1]!]);
    assert.deepEqual(view.effects, [{ kind: "start", text: "message 1", attachments: [] }]);
    assert.deepEqual(view.actions, [], "collapse is presentation-only; completion is external");
  } finally { view.close(); }
});
test("shrink/collapsed 2-to-1-to-2 regrows expanded", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); completed(view); append(view);
    assert.deepEqual(view.rows(), ["q2", "q3"], "count shrink must clear retained collapse before regrowth");
    assert.equal(view.present("Collapse queue"), true);
    assert.equal(view.present("Expand queue"), false);
  } finally { view.close(); }
});
test("shrink/singleton initially has no collapse toggle", () => {
  const view = fixture(seed(1));
  try { singleton(view, "q1"); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []); }
  finally { view.close(); }
});
test("shrink/expanded completion 2-to-1 removes the toggle", () => {
  const view = fixture();
  try { completed(view); singleton(view, "q2"); }
  finally { view.close(); }
});
test("shrink/collapsed explicit deletion 2-to-1 reveals the survivor", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); view.transition((current) => queue.actionStep(current, { kind: "delete", id: "q1" }));
    singleton(view, "q2"); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});

// Thirteen unchanged controls; #1474 must be on main before this fixture runs.
test("control/multiple rows initially expanded", () => {
  const view = fixture();
  try { assert.deepEqual(view.rows(), ["q1", "q2"]); assert.equal(view.present("Collapse queue"), true); }
  finally { view.close(); }
});
test("control/collapsed multiple rows survive ordinary rerender", () => {
  const view = fixture();
  try { view.click("Collapse queue"); view.rerender(); assert.deepEqual(view.rows(), []); assert.equal(view.present("Expand queue"), true); assert.deepEqual(view.queue, view.initial); }
  finally { view.close(); }
});
test("control/collapsed 3-to-2 stays collapsed", () => {
  const view = fixture(seed(3));
  try { view.click("Collapse queue"); completed(view); assert.deepEqual(view.queue.items.map((item) => item.id), ["q2", "q3"]); assert.deepEqual(view.rows(), []); assert.equal(view.present("Expand queue"), true); }
  finally { view.close(); }
});
test("control/reordering multiple collapsed rows preserves collapse", () => {
  const view = fixture();
  try { view.click("Collapse queue"); view.transition((current) => queue.reorder(current, ["q2", "q1"])); assert.deepEqual(view.rows(), []); view.click("Expand queue"); assert.deepEqual(view.rows(), ["q2", "q1"]); }
  finally { view.close(); }
});
test("control/manual expand preserves complete queued items", () => {
  const view = fixture();
  try { view.click("Collapse queue"); view.click("Expand queue"); assert.deepEqual(view.rows(), ["q1", "q2"]); assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []); }
  finally { view.close(); }
});
test("control/zero-item unmount then new queue starts expanded", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); view.transition((current) => queue.remove(current, "q1")); view.transition((current) => queue.remove(current, "q2"));
    assert.deepEqual(view.rows(), []); assert.equal(view.present("Expand queue"), false); assert.equal(view.present("Collapse queue"), false);
    append(view); assert.deepEqual(view.rows(), ["q3"]);
  } finally { view.close(); }
});
test("control/pause and resume while collapsed do not change count or collapse", () => {
  const view = fixture();
  try {
    view.click("Collapse queue"); view.click("Pause"); assert.equal(view.queue.paused, true); view.click("Resume");
    assert.deepEqual(view.actions, [{ kind: "pause" }, { kind: "resume" }]); assert.deepEqual(view.effects, []); assert.deepEqual(view.queue, view.initial); assert.deepEqual(view.rows(), []); assert.equal(view.present("Expand queue"), true);
  } finally { view.close(); }
});
test("control/ordinary queued edit still saves", () => {
  const view = fixture();
  try {
    view.rowClick("q1", "Edit"); view.changeEdit("updated first"); view.click("Save");
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }, { kind: "saveEdit", input: { text: "updated first" }, steer: false }]);
    assert.deepEqual(view.rows(), ["q1", "q2"]); assert.deepEqual(view.queue.items, [{ ...view.initial.items[0]!, text: "updated first" }, view.initial.items[1]!]);
  } finally { view.close(); }
});
for (const label of ["Save", "Save and steer"]) test(`control/1474 blank ${label} stays disabled`, () => {
  const view = fixture();
  try {
    view.rowClick("q1", "Edit"); view.changeEdit(""); assert.equal(view.available(label), false);
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }]); assert.deepEqual(view.queue.items, view.initial.items); assert.deepEqual(view.effects, []);
  } finally { view.close(); }
});
test("control/direct blank reducer deletion remains intentional", () => {
  const initial = seed();
  const result = queue.saveEdit(queue.beginEdit(initial, "q1"), { text: "" }, false);
  assert.deepEqual(result, { queue: { ...initial, items: [initial.items[1]!] }, effects: [] });
  assert.equal(initial.items.length, 2);
});
test("control/no-steer retains collapse and both queued items", () => {
  const view = fixture(seed(), false);
  try { assert.equal(view.present("Steer"), false); view.click("Collapse queue"); view.click("Expand queue"); assert.deepEqual(view.rows(), ["q1", "q2"]); assert.deepEqual(view.queue, view.initial); }
  finally { view.close(); }
});
test("control/expanded 3-to-2 keeps both remaining rows visible", () => {
  const view = fixture(seed(3));
  try { completed(view); assert.deepEqual(view.rows(), ["q2", "q3"]); assert.equal(view.present("Collapse queue"), true); assert.deepEqual(view.queue.items, view.initial.items.slice(1)); }
  finally { view.close(); }
});
