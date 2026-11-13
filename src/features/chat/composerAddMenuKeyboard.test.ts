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
import type { ComposerEditorHandle } from "./ComposerEditor.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Options = { attachment?: boolean; link?: boolean; plan?: boolean; disabledPlan?: boolean };
type FocusTarget = { focus(): void };

function fixture({ attachment = true, link = true, plan = true, disabledPlan = false }: Options = {}) {
  const focused: string[] = [];
  const actions: string[] = [];
  const trigger: FocusTarget = { focus() { focused.push("Add"); } };
  const rows = new Map<string, FocusTarget>();
  const rowNode = (label: string) => {
    let node = rows.get(label);
    if (!node) { node = { focus() { focused.push(label); } }; rows.set(label, node); }
    return node;
  };
  const editor: ComposerEditorHandle = {
    focus() { focused.push("editor"); }, blur() {}, visible: () => true, focused: () => false,
    composing: () => false, selection: () => ({ text: "", start: 0, end: 0 }),
    replaceRange: () => assert.fail("menu navigation must not replace text"),
    insertFile: () => assert.fail("menu navigation must not insert files"),
    deleteRange: () => assert.fail("menu navigation must not delete text"),
    newline: () => assert.fail("menu navigation must not insert a newline"),
  };
  const javascript = ts.transpileModule(readFileSync("src/features/chat/Composer.tsx", "utf8"), {
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
      if (name === "./ComposerEditor.tsx") return { ComposerEditor: () => null };
      if (name === "./SlashMenu.tsx") return { SlashMenu: () => null };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: () => false };
      if (name === "../../backend") return { fuzzyFilterFiles: () => assert.fail("menu navigation must not search files") };
      if (name === "./composerIcons.tsx") return Object.fromEntries(["ArrowUpIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]));
      throw new Error(`Unexpected Composer dependency: ${name}`);
    },
  });
  assert.ok(exports.Composer);
  let renderer: ReturnType<typeof create>;
  const menuRows = () => renderer.root.findAllByProps({ role: "menuitem" });
  const labelOf = (node: { findAllByProps(props: unknown): { children: string[] }[] }) => node.findAllByProps({ className: "oc-menu-item-label" })[0].children.join("");
  const rootNode = {
    contains(target: FocusTarget) { return target === trigger || [...rows.values()].includes(target); },
    querySelectorAll(selector: string) {
      assert.equal(selector, '[role="menuitem"]:not(:disabled)');
      return menuRows().filter((node: { props: { disabled?: boolean } }) => !node.props.disabled).map((node: Parameters<typeof labelOf>[0]) => rowNode(labelOf(node)));
    },
  };
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft: "", setDraft: () => assert.fail("menu navigation must not overwrite the draft"), inputRef: { current: editor },
      queue: queue.emptyQueue(), canSteer: false,
      onSubmit: () => assert.fail("menu navigation must not submit"),
      onStop: () => assert.fail("menu navigation must not stop the agent"),
      onQueue: () => assert.fail("menu navigation must not alter the queue"),
      ...(attachment ? { onAttachFiles: () => actions.push("attachment") } : {}),
      ...(link ? { onLinkWorkspaces: () => actions.push("link") } : {}),
      ...(plan ? { planMode: { isPlanMode: false, disabled: disabledPlan, onToggle: () => actions.push("plan") } } : {}),
    }), { createNodeMock(element: { type: string; props: Record<string, unknown> }) {
      if (element.props.className === "oc-add-menu") return rootNode;
      if (element.props["aria-label"] === "Add") return trigger;
      if (element.type === "input") return { click() { actions.push("attachment"); } };
      return null;
    } });
  });
  const button = () => renderer.root.findByProps({ "aria-label": "Add" });
  return {
    focused, actions,
    open: () => button().props["aria-expanded"],
    click(detail?: number) { act(() => button().props.onClick(detail === undefined ? undefined : { detail })); },
    key(key: string, target = "Add", composing = false) {
      let prevented = false;
      let stopped = false;
      act(() => renderer.root.findByProps({ className: "oc-add-menu" }).props.onKeyDown({
        key, target: target === "Add" ? trigger : rowNode(target), currentTarget: rootNode,
        nativeEvent: { isComposing: composing }, isComposing: composing,
        preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
      }));
      return { prevented, stopped };
    },
    select(label: string) { act(() => menuRows().find((node: Parameters<typeof labelOf>[0]) => labelOf(node) === label).props.onClick()); },
    labels: () => menuRows().map(labelOf),
    close() { act(() => renderer.unmount()); },
  };
}

for (const [key, expected] of [["ArrowDown", "Add attachment"], ["ArrowUp", "Plan mode"]]) {
  test(`Add menu ${key} opens and focuses ${expected}`, () => {
    const f = fixture();
    try { assert.deepEqual(f.key(key), { prevented: true, stopped: true }); assert.equal(f.open(), true); assert.deepEqual(f.focused, [expected]); assert.deepEqual(f.actions, []); }
    finally { f.close(); }
  });
}

for (const [key, target, expected] of [
  ["ArrowDown", "Add attachment", "Link workspaces"],
  ["ArrowDown", "Plan mode", "Add attachment"],
  ["ArrowUp", "Link workspaces", "Add attachment"],
  ["ArrowUp", "Add attachment", "Plan mode"],
  ["Home", "Plan mode", "Add attachment"],
  ["End", "Add attachment", "Plan mode"],
]) {
  test(`Add menu ${key} from ${target} focuses ${expected}`, () => {
    const f = fixture(); f.click();
    try { assert.deepEqual(f.key(key, target), { prevented: true, stopped: true }); assert.deepEqual(f.focused, [expected]); assert.deepEqual(f.actions, []); assert.equal(f.open(), true); }
    finally { f.close(); }
  });
}

for (const [key, target] of [["ArrowDown", "Link workspaces"], ["End", "Add attachment"], ["ArrowUp", "Add"]]) {
  test(`Add menu ${key} skips disabled Plan row`, () => {
    const f = fixture({ disabledPlan: true });
    if (target !== "Add") f.click();
    try { f.key(key, target); assert.deepEqual(f.focused, [key === "ArrowDown" ? "Add attachment" : "Link workspaces"]); assert.deepEqual(f.actions, []); }
    finally { f.close(); }
  });
}

test("Add menu navigation supports an absent attachment row", () => {
  const f = fixture({ attachment: false });
  try { f.key("ArrowDown"); assert.deepEqual(f.focused, ["Link workspaces"]); f.key("ArrowUp", "Link workspaces"); assert.deepEqual(f.focused, ["Link workspaces", "Plan mode"]); }
  finally { f.close(); }
});

test("Add menu with only a disabled Plan row opens without selecting or focusing it", () => {
  const f = fixture({ attachment: false, link: false, disabledPlan: true });
  try { f.key("ArrowDown"); assert.equal(f.open(), true); assert.deepEqual(f.focused, []); assert.deepEqual(f.actions, []); }
  finally { f.close(); }
});

test("Add menu Escape closes and returns keyboard focus to Add", () => {
  const f = fixture(); f.click();
  try { assert.deepEqual(f.key("Escape", "Plan mode"), { prevented: true, stopped: true }); assert.equal(f.open(), false); assert.deepEqual(f.focused, ["Add"]); assert.deepEqual(f.actions, []); }
  finally { f.close(); }
});

for (const key of ["Tab", "Enter", " ", "ArrowLeft", "a"]) {
  test(`Add menu leaves native ${JSON.stringify(key)} behavior alone`, () => {
    const f = fixture(); f.click();
    try { assert.deepEqual(f.key(key, "Add attachment"), { prevented: false, stopped: false }); assert.equal(f.open(), true); assert.deepEqual(f.focused, []); assert.deepEqual(f.actions, []); }
    finally { f.close(); }
  });
}

for (const key of ["Home", "End", "Escape"]) {
  test(`closed Add menu ignores ${key}`, () => {
    const f = fixture();
    try { assert.deepEqual(f.key(key), { prevented: false, stopped: false }); assert.equal(f.open(), false); assert.deepEqual(f.focused, []); }
    finally { f.close(); }
  });
}

for (const key of ["ArrowDown", "Escape"]) {
  test(`Add menu does not intercept ${key} during composition`, () => {
    const f = fixture(); if (key === "Escape") f.click();
    try { assert.deepEqual(f.key(key, "Add", true), { prevented: false, stopped: false }); assert.equal(f.open(), key === "Escape"); assert.deepEqual(f.focused, []); }
    finally { f.close(); }
  });
}

for (const [label, expected] of [["Add attachment", "attachment"], ["Link workspaces", "link"], ["Plan mode", "plan"]]) {
  test(`Add menu retains ${label} click exactly once`, () => {
    const f = fixture(); f.click();
    try { f.select(label); assert.deepEqual(f.actions, [expected]); assert.equal(f.open(), false); }
    finally { f.close(); }
  });
}

for (const key of ["Enter", " "]) {
  test(`Add menu ${JSON.stringify(key)} activation click focuses the first enabled row`, () => {
    const f = fixture();
    try {
      assert.deepEqual(f.key(key), { prevented: false, stopped: false });
      f.click(0);
      assert.equal(f.open(), true);
      assert.deepEqual(f.focused, ["Add attachment"]);
      assert.deepEqual(f.actions, []);
    } finally { f.close(); }
  });
}
