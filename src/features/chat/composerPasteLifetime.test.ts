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

function fixture({ detached = false } = {}) {
  const events: unknown[] = [];
  let resolveRead!: (text: string | null) => void;
  const pendingRead = new Promise<string | null>(resolve => { resolveRead = resolve; });
  const selection = { text: "retained draft", start: 2, end: 6 };
  const handle: ComposerEditorHandle = {
    focus: () => { events.push("focus"); }, blur() {}, visible: () => true,
    focused: () => false, composing: () => false, selection: () => ({ ...selection }),
    replaceRange: (range, text) => { events.push({ range, text }); return true; },
    insertFile: () => assert.fail("must not attach files"),
    deleteRange: () => assert.fail("must not delete draft"),
    newline: () => assert.fail("must not insert newline"),
  };
  const inputRef: { current: ComposerEditorHandle | null } = { current: detached ? null : handle };
  let handlers: CommandHandlers = {};
  let reads = 0;
  function EditorBoundary() {
    React.useLayoutEffect(() => () => { inputRef.current = null; }, []);
    return null;
  }
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
      if (name === "./composerPasteFilePaths.ts") return { readClipboardTextFromPlatform: () => { reads++; return pendingRead; } };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name.endsWith("/useSettings.ts")) return { useSettings: () => ({ settings: null, save: () => Promise.resolve(true) }) };
      if (name.endsWith("/prefs.ts")) return { withBoolPref: (s: unknown) => s };
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("must not search files") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map(key => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(exports.Composer, {
    draft: selection.text, setDraft: () => assert.fail("must not replace stored draft"), inputRef,
    queue: queue.emptyQueue(), canSteer: false,
    onSubmit: () => assert.fail("must not submit"), onQueue: () => assert.fail("must not queue"), onStop: () => assert.fail("must not stop"),
  })); });
  return {
    events, inputRef, reads: () => reads,
    paste() { act(() => { handlers["chat.composer.pasteFilePaths"]?.(); }); },
    async resolve(text: string | null) { await act(async () => { resolveRead(text); await pendingRead; }); },
    close() { act(() => renderer.unmount()); },
  };
}

test("pending paste does not focus or insert after the editor unmounts", async () => {
  const view = fixture();
  view.paste();
  assert.equal(view.reads(), 1);
  view.close();
  assert.equal(view.inputRef.current, null, "editor cleanup detaches its handle");
  await view.resolve("/fixture/kept.txt");
  assert.deepEqual(view.events, []);
});

test("a live editor retains focus and exact current-selection insertion", async () => {
  const view = fixture();
  try {
    view.paste();
    await view.resolve("/fixture/one.txt\n/fixture/two.txt");
    assert.equal(view.reads(), 1);
    assert.equal(view.events[0], "focus");
    assert.equal(JSON.stringify(view.events[1]), JSON.stringify({ range: { start: 2, end: 6 }, text: "/fixture/one.txt\n/fixture/two.txt" }));
    assert.equal(view.events.length, 2);
  } finally { view.close(); }
});

for (const text of [null, ""]) test(`empty clipboard ${JSON.stringify(text)} does not focus or insert`, async () => {
  const view = fixture();
  try { view.paste(); await view.resolve(text); assert.deepEqual(view.events, []); }
  finally { view.close(); }
});

test("clipboard whitespace remains legitimate content", async () => {
  const view = fixture();
  try {
    view.paste(); await view.resolve(" \n ");
    assert.equal(view.events[0], "focus");
    assert.equal(JSON.stringify(view.events[1]), JSON.stringify({ range: { start: 2, end: 6 }, text: " \n " }));
  } finally { view.close(); }
});

test("a detached editor declines without reading clipboard", () => {
  const view = fixture({ detached: true });
  try { view.paste(); assert.equal(view.reads(), 0); assert.deepEqual(view.events, []); }
  finally { view.close(); }
});

test("a pending paste in one editor does not touch another mounted composer", async () => {
  const first = fixture(), second = fixture();
  try {
    first.paste(); await first.resolve("first only");
    assert.equal(first.events.length, 2);
    assert.deepEqual(second.events, []);
    assert.equal(second.reads(), 0);
  } finally { first.close(); second.close(); }
});
