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
import { composerSlashRange } from "./composerSlashRange.ts";
import type { ComposerEditorHandle, ComposerSelection } from "./ComposerEditor.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const review: commands.SlashCommand = { name: "review", description: "Review changes", argumentHint: "", effect: "agent", supportedAgents: ["codex"] };

function fixture(text = "please /re", caret = text.length) {
  const initial = text;
  let selection: ComposerSelection = { text, start: caret, end: caret };
  const replacements: { range: { start: number; end: number }; text: string }[] = [];
  const handle: ComposerEditorHandle = {
    focus() {}, blur() {}, visible: () => true, focused: () => true, composing: () => false,
    selection: () => selection,
    replaceRange(range, inserted) {
      replacements.push({ range: { start: range.start, end: range.end }, text: inserted });
      text = text.slice(0, range.start) + inserted + text.slice(range.end);
      selection = { text, start: range.start + inserted.length, end: range.start + inserted.length };
      return true;
    },
    insertFile: () => assert.fail("slash completion must not insert a file"),
    deleteRange: () => assert.fail("slash completion must replace its text range"),
    newline: () => assert.fail("completion must not insert a newline"),
  };
  let editorProps: { onSelection(value: ComposerSelection): void; onFocus(): void; onKeyDown(event: unknown): void };
  const EditorBoundary = (props: typeof editorProps) => { editorProps = props; return null; };
  const MenuBoundary = () => null;
  const path = "src/features/chat/Composer.tsx";
  const source = process.env.COMPOSER_SLASH_PREFIX_SOURCE_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_SLASH_PREFIX_SOURCE_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./Composer"), "Composer">> = {};
  runInNewContext(javascript, {
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
      draft: initial, setDraft: () => assert.fail("completion must not overwrite the stored draft"), inputRef: { current: handle },
      queue: { status: "idle", items: [], editingId: null, paused: false }, canSteer: false,
      slashCommands: [review], onSubmit: () => assert.fail("picking must not submit"), onStop() {}, onQueue() {},
    }));
  });
  act(() => { editorProps.onFocus(); editorProps.onSelection(selection); });
  return {
    menu: () => renderer.root.findAllByType(MenuBoundary),
    pick() { act(() => renderer.root.findByType(MenuBoundary).props.onPick(review)); },
    key(key: string) {
      let prevented = false;
      act(() => editorProps.onKeyDown({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, preventDefault() { prevented = true; }, stopPropagation() {} }));
      return prevented;
    },
    select(next: ComposerSelection, notify = true) {
      selection = next;
      if (notify) act(() => editorProps.onSelection(next));
    },
    replacements, selection: () => selection,
    close() { act(() => renderer.unmount()); },
  };
}

test("space-prefixed slash opens the actual Composer menu and replaces only its live range", () => {
  const view = fixture("please /re keep suffix", 10);
  try {
    assert.equal(view.menu().length, 1, "space-prefixed slash must reach the visible menu");
    view.pick();
    assert.deepEqual(view.replacements, [{ range: { start: 7, end: 10 }, text: "/review " }]);
    assert.deepEqual(view.selection(), { text: "please /review  keep suffix", start: 15, end: 15 });
  } finally { view.close(); }
});

for (const key of ["Enter", "Tab"]) {
  test(`space-prefixed ${key} completes the command without replacing the prefix`, () => {
    const view = fixture();
    try {
      assert.equal(view.key(key), true);
      assert.deepEqual(view.replacements, [{ range: { start: 7, end: 10 }, text: "/review " }]);
    } finally { view.close(); }
  });
}

test("a cached menu cannot replace a different equal-query live range", () => {
  const text = "please /re then /re";
  const view = fixture(text, 10);
  try {
    assert.equal(view.menu().length, 1);
    view.select({ text, start: text.length, end: text.length }, false);
    view.pick();
    assert.deepEqual(view.replacements, []);
    view.select({ text, start: 7, end: 10 }, false);
    view.pick();
    assert.deepEqual(view.replacements, []);
  } finally { view.close(); }
});

test("Escape dismisses one range, not another equal query", () => {
  const text = "please /re then /re";
  const view = fixture(text, 10);
  try {
    assert.equal(view.key("Escape"), true);
    assert.equal(view.menu().length, 0);
    view.select({ text, start: text.length, end: text.length });
    assert.equal(view.menu().length, 1);
    view.pick();
    assert.deepEqual(view.replacements, [{ range: { start: 16, end: 19 }, text: "/review " }]);
  } finally { view.close(); }
});

test("active slash ranges respect text-node boundaries, allowed prefixes and UTF-16 offsets", () => {
  assert.deepEqual(composerSlashRange("please /re", 10, 10), { start: 7, end: 10, query: "re" });
  assert.deepEqual(composerSlashRange("📄 /re", 6, 6), { start: 3, end: 6, query: "re" });
  assert.deepEqual(composerSlashRange("prefix\n/re", 10, 10), { start: 7, end: 10, query: "re" });
  assert.deepEqual(composerSlashRange("\ufffc/re", 4, 4), { start: 1, end: 4, query: "re" });
  assert.deepEqual(composerSlashRange("/re", 3, 3), { start: 0, end: 3, query: "re" });
  assert.equal(composerSlashRange("please /re", 7, 10), null);
  assert.equal(composerSlashRange("please/re", 9, 9), null);
  assert.equal(composerSlashRange("please\t/re", 10, 10), null);
  assert.equal(composerSlashRange("/usr/bin", 8, 8), null);
  assert.equal(composerSlashRange("/re now", 7, 7), null);
  assert.equal(composerSlashRange("/re", 0, 0), null);
});
