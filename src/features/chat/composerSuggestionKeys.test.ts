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
import type { ComposerEditorHandle, ComposerSelection } from "./ComposerEditor.tsx";
import type { SlashMenuProps } from "./SlashMenu.tsx";
import type { FileMentionMenu } from "./FileMentionMenu.tsx";
import type { FileMatch } from "../../spotlight/quickOpen.ts";

type Menu = "slash" | "mention";
type Modifiers = Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">>;
type EditorCallbacks = {
  onKeyDown(event: unknown): void;
  onFocus(): void;
  onSelection(selection: ComposerSelection): void;
};
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const files: FileMatch[] = ["first.ts", "second.ts"].map((name) => ({
  file: { name, path: `/fixture/${name}`, is_directory: false }, relative_path: name, score: 1, match_indices: [],
}));
const slashCommands: commands.SlashCommand[] = ["first", "second"].map((name) => ({
  name, description: name, argumentHint: "", effect: "agent", supportedAgents: ["codex"],
}));

async function fixture(kind: Menu, open = true) {
  const draft = open ? (kind === "slash" ? "/" : "@") : "hello";
  const selection = { text: draft, start: draft.length, end: draft.length };
  const replacements: { range: { start: number; end: number }; text: string }[] = [];
  const insertions: { range: { start: number; end: number }; file: { path: string; label: string; directory: boolean } }[] = [];
  const submitted: userContent.UserPrompt[] = [];
  const drafts: string[] = [];
  let newlines = 0;
  let editorProps: EditorCallbacks | undefined;
  const handle: ComposerEditorHandle = {
    focus() {}, blur() {}, visible: () => true, focused: () => true, composing: () => false,
    selection: () => selection,
    replaceRange(range, text) { replacements.push({ range, text }); return true; },
    insertFile(range, file) { insertions.push({ range, file }); },
    deleteRange: () => assert.fail("file and slash selection must not call deleteRange"),
    newline() { newlines += 1; },
  };
  const EditorBoundary = (props: EditorCallbacks) => { editorProps = props; return null; };
  const SlashBoundary = (props: SlashMenuProps) => React.createElement("suggestion-probe", {
    kind: "slash", focused: props.focused, labels: props.matches.map((match) => match.command.name),
  });
  const MentionBoundary = (props: Parameters<typeof FileMentionMenu>[0]) => React.createElement("suggestion-probe", {
    kind: "mention", focused: props.focused, labels: props.matches.map((item) => item.kind === "file" ? item.match.relative_path : item.kind),
  });
  const path = "src/features/chat/Composer.tsx";
  const source = process.env.COMPOSER_SUGGESTION_KEYS_SOURCE_REF
    ? execFileSync("git", ["-c", "gc.auto=0", "show", `${process.env.COMPOSER_SUGGESTION_KEYS_SOURCE_REF}:${path}`], { encoding: "utf8" })
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
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: MentionBoundary };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => Promise.resolve(files) };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.Composer, {
      draft, setDraft: (value: string) => drafts.push(value), inputRef: { current: handle },
      queue: queue.emptyQueue(), canSteer: false, slashCommands,
      workspacePath: kind === "mention" ? "/fixture" : undefined,
      onSubmit: (input: userContent.UserPrompt) => { submitted.push(input); },
      onStop: () => assert.fail("suggestion keys must not stop an agent"), onQueue() {},
    }));
  });
  await act(async () => {
    assert.ok(editorProps);
    editorProps.onFocus();
    editorProps.onSelection(selection);
  });
  function state(): { kind: Menu; focused: number; labels: string[] } | null {
    const menus = renderer.root.findAllByType("suggestion-probe");
    assert.ok(menus.length <= 1);
    return menus[0]?.props ?? null;
  }
  if (open) {
    assert.equal(state()?.kind, kind, "production Composer must open the requested menu");
    assert.deepEqual(state()?.labels, kind === "slash" ? ["first", "second"] : ["first.ts", "second.ts"]);
    assert.equal(state()?.focused, 0);
  } else assert.equal(state(), null);
  return {
    replacements, insertions, submitted, drafts,
    newlines: () => newlines,
    menu: state,
    key(key: string, modifiers: Modifiers = {}, composing = false) {
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      const fields = { key, code: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: composing, ...modifiers };
      Object.defineProperties(event, Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value }])));
      act(() => { assert.ok(editorProps); editorProps.onKeyDown(event); });
      return { prevented: event.defaultPrevented, stopped: event.cancelBubble };
    },
    close() { act(() => renderer.unmount()); },
  };
}

const modifiers: readonly [string, Modifiers][] = [
  ["Shift", { shiftKey: true }], ["Meta", { metaKey: true }],
  ["Ctrl", { ctrlKey: true }], ["Alt", { altKey: true }],
];

for (const kind of ["slash", "mention"] as const) {
  for (const [label, modifier] of modifiers) {
    test(`${kind}: ${label}+ArrowDown/Up navigates suggestions before editor commands`, async () => {
      const view = await fixture(kind);
      try {
        const down = view.key("ArrowDown", modifier);
        assert.equal(view.menu()?.focused, 1, "modified ArrowDown must move the selected suggestion");
        assert.deepEqual(down, { prevented: true, stopped: true });
        const up = view.key("ArrowUp", modifier);
        assert.equal(view.menu()?.focused, 0);
        assert.deepEqual(up, { prevented: true, stopped: true });
        assert.equal(view.newlines(), 0);
        assert.deepEqual(view.submitted, []);
        assert.deepEqual(view.drafts, []);
      } finally { view.close(); }
    });
    for (const key of ["Enter", "Tab"]) {
      test(`${kind}: ${label}+${key} selects the suggestion without sending or inserting a newline`, async () => {
        const view = await fixture(kind);
        try {
          const event = view.key(key, modifier);
          if (kind === "slash") {
            assert.equal(view.replacements.length, 1, "modified acceptance must replace the slash query");
            assert.equal(view.replacements[0]?.text, "/first ");
            assert.deepEqual({ ...view.replacements[0]?.range }, { start: 0, end: 1, query: "" });
            assert.deepEqual(view.insertions, []);
          } else {
            assert.equal(view.insertions.length, 1, "modified acceptance must insert the selected file");
            assert.deepEqual({ ...view.insertions[0]?.file }, { path: "first.ts", label: "first.ts", directory: false });
            assert.deepEqual({ ...view.insertions[0]?.range }, { start: 0, end: 1, query: "" });
            assert.deepEqual(view.replacements, []);
          }
          assert.deepEqual(event, { prevented: true, stopped: true });
          assert.equal(view.newlines(), 0);
          assert.deepEqual(view.submitted, []);
          assert.deepEqual(view.drafts, []);
        } finally { view.close(); }
      });
    }
  }
  test(`${kind}: unmodified arrows still navigate the open menu`, async () => {
    const view = await fixture(kind);
    try {
      assert.equal(view.key("ArrowDown").prevented, true);
      assert.equal(view.menu()?.focused, 1);
      assert.equal(view.key("ArrowUp").prevented, true);
      assert.equal(view.menu()?.focused, 0);
      assert.deepEqual(view.submitted, []);
    } finally { view.close(); }
  });
  test(`${kind}: unmodified Enter reaches the existing suggestion selection path`, async () => {
    const view = await fixture(kind);
    try {
      assert.equal(view.key("Enter").prevented, true);
      assert.equal(kind === "slash" ? view.replacements.length : view.insertions.length, 1);
      assert.deepEqual(view.submitted, []);
      assert.equal(view.newlines(), 0);
    } finally { view.close(); }
  });
  test(`${kind}: modified Escape still dismisses the open menu`, async () => {
    const view = await fixture(kind);
    try {
      assert.deepEqual(view.key("Escape", { shiftKey: true }), { prevented: true, stopped: true });
      assert.equal(view.menu(), null);
      assert.deepEqual(view.replacements, []);
      assert.deepEqual(view.insertions, []);
      assert.deepEqual(view.submitted, []);
    } finally { view.close(); }
  });
  test(`${kind}: unrelated keys stay available to the editor`, async () => {
    const view = await fixture(kind);
    try {
      assert.deepEqual(view.key("F2"), { prevented: false, stopped: false });
      assert.deepEqual(view.replacements, []);
      assert.deepEqual(view.insertions, []);
      assert.deepEqual(view.submitted, []);
      assert.equal(view.newlines(), 0);
    } finally { view.close(); }
  });
  test(`${kind}: composing events do not select a suggestion`, async () => {
    const view = await fixture(kind);
    try {
      assert.deepEqual(view.key("Enter", { shiftKey: true }, true), { prevented: false, stopped: false });
      assert.deepEqual(view.replacements, []);
      assert.deepEqual(view.insertions, []);
      assert.deepEqual(view.submitted, []);
      assert.equal(view.newlines(), 0);
    } finally { view.close(); }
  });
}

test("without suggestions Shift+Enter retains the configured newline action", async () => {
  const view = await fixture("slash", false);
  try {
    assert.equal(view.key("Enter", { shiftKey: true }).prevented, true);
    assert.equal(view.newlines(), 1);
    assert.deepEqual(view.submitted, []);
    assert.deepEqual(view.replacements, []);
    assert.deepEqual(view.insertions, []);
  } finally { view.close(); }
});

test("without suggestions Enter retains the configured submit action", async () => {
  const view = await fixture("slash", false);
  try {
    assert.equal(view.key("Enter").prevented, true);
    assert.equal(view.submitted.length, 1);
    assert.equal(view.submitted[0]?.text, "hello");
    assert.deepEqual(view.drafts, [""]);
    assert.equal(view.newlines(), 0);
    assert.deepEqual(view.replacements, []);
    assert.deepEqual(view.insertions, []);
  } finally { view.close(); }
});
