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
import type { CommandHandlers } from "../../keybindings/bind.ts";
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";
import type { Composer } from "./Composer.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function fixture({ focused = false, status = "working", detached = false }: {
  focused?: boolean;
  status?: queue.SessionStatus;
  detached?: boolean;
} = {}) {
  const events: string[] = [];
  const selection = { text: "keep this draft", start: 2, end: 6 };
  const focusPositions: ("end" | undefined)[] = [];
  const parts: document.ComposerPart[] = [
    { kind: "text", text: "keep " },
    { kind: "file", path: "src/keep.ts", label: "keep.ts", directory: false },
    { kind: "text", text: " this draft" },
  ];
  const draft = document.writeComposerDraft(parts);
  const queueState: queue.ChatQueue = {
    ...queue.emptyQueue(), status,
    items: [{ id: "queued-keep", text: "do not send", attachments: [], createdAt: "2026-11-12T00:00:00Z" }],
  };
  const beforeQueue = JSON.stringify(queueState);
  const handle: ComposerEditorHandle = {
    focus(position) {
      events.push("focus");
      focusPositions.push(position);
      focused = true;
      if (position === "end") selection.start = selection.end = selection.text.length;
    },
    blur() { focused = false; },
    visible: () => true,
    focused: () => focused,
    composing: () => false,
    selection: () => ({ ...selection }),
    replaceRange: () => assert.fail("cancel must not replace draft text"),
    insertFile: () => assert.fail("cancel must not insert files"),
    deleteRange: () => assert.fail("cancel must not delete draft text"),
    newline: () => assert.fail("cancel must not insert a newline"),
  };
  const inputRef: { current: ComposerEditorHandle | null } = { current: detached ? null : handle };
  let handlers: CommandHandlers = {};
  const EditorBoundary = () => null;
  const exports: { Composer?: typeof Composer } = {};
  const javascript = ts.transpileModule(readFileSync("src/features/chat/Composer.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/Tooltip.tsx")) return { Tooltip: ({ children }: { children: unknown }) => children, ShortcutHint: () => null };
      if (name.endsWith("/usePresence.ts")) return { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) };
      if (name.endsWith("/KeybindingsProvider.tsx")) return {
        useKeybindingOverrides: () => ({ overrides: {} }),
        useKeybindings(value: CommandHandlers) { handlers = value; },
      };
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
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("cancel must not search files") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft, setDraft: () => assert.fail("cancel must not overwrite the stored draft"), inputRef,
      queue: queueState, canSteer: false,
      onSubmit: () => assert.fail("cancel must not submit"),
      onQueue: () => assert.fail("cancel must not edit the queue"),
      onStop() { events.push("stop"); },
      attachments: React.createElement("span", { "data-testid": "cancel-retained-attachment" }, "keep.txt"),
      hasAttachments: true,
    }));
  });
  const attachedNode = renderer.root.findByProps({ "data-testid": "cancel-retained-attachment" });
  return {
    events, focusPositions,
    focused: () => focused,
    selection: () => handle.selection(),
    cancel() {
      let result: unknown;
      act(() => { result = handlers["chat.cancel"]?.(); });
      return result;
    },
    clickStop() { act(() => renderer.root.findByProps({ className: "oc-icon-btn composer-stop" }).props.onClick()); },
    assertUnchanged() {
      assert.equal(JSON.stringify(queueState), beforeQueue);
      assert.equal(renderer.root.findByProps({ "data-testid": "cancel-retained-attachment" }), attachedNode);
      assert.equal(renderer.root.findByType(EditorBoundary).props.value, draft);
      assert.deepEqual(document.readComposerDraft(draft), parts);
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("accepted keyboard cancellation stops then refocuses a blurred Composer", () => {
  const view = fixture();
  try {
    view.cancel();
    assert.deepEqual(view.events, ["stop", "focus"]);
    assert.equal(view.focused(), true);
    assert.deepEqual(view.focusPositions, [undefined]);
  } finally { view.close(); }
});

test("keyboard cancellation preserves an already focused editor's selection", () => {
  const view = fixture({ focused: true });
  try {
    const before = view.selection();
    view.cancel();
    assert.deepEqual(view.events, ["stop", "focus"]);
    assert.deepEqual(view.focusPositions, [undefined]);
    assert.deepEqual(view.selection(), before);
  } finally { view.close(); }
});

test("idle keyboard cancellation still declines without stopping or focusing", () => {
  const view = fixture({ status: "idle" });
  try {
    assert.equal(view.cancel(), false);
    assert.deepEqual(view.events, []);
    assert.equal(view.focused(), false);
    view.assertUnchanged();
  } finally { view.close(); }
});

test("pointer Stop retains its existing stop-only behavior", () => {
  const view = fixture();
  try {
    view.clickStop();
    assert.deepEqual(view.events, ["stop"]);
    assert.deepEqual(view.focusPositions, []);
    assert.equal(view.focused(), false);
    view.assertUnchanged();
  } finally { view.close(); }
});

test("accepted cancellation still stops when the editor ref has detached", () => {
  const view = fixture({ detached: true });
  try {
    assert.doesNotThrow(() => view.cancel());
    assert.deepEqual(view.events, ["stop"]);
    view.assertUnchanged();
  } finally { view.close(); }
});

test("keyboard cancellation isolates rich draft, attachment, queue, and another chat", () => {
  const view = fixture();
  const other = fixture();
  try {
    const before = view.selection();
    view.cancel();
    assert.deepEqual(view.events, ["stop", "focus"]);
    assert.deepEqual(view.selection(), before);
    view.assertUnchanged();
    other.assertUnchanged();
    assert.deepEqual(other.events, []);
    assert.equal(other.focused(), false);
  } finally { view.close(); other.close(); }
});
