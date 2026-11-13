import assert from "node:assert/strict";
import * as sectionShortcutOverrides from "../keybindings/overrides.ts";
import * as sectionShortcutMatcher from "../keybindings/shortcut.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { SectionDialogMode } from "./SectionDialog";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function load(file: string): Record<string, unknown> {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./Dialogs") return { Modal: ({ children }: { children: ReactNode }) => children };
      if (name === "./sectionEmoji") return load("./sectionEmoji.ts");
      if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "../keybindings/overrides") return sectionShortcutOverrides;
      if (name === "../keybindings/shortcut") return sectionShortcutMatcher;
      throw new Error(`Unexpected section name input dependency: ${name}`);
    },
  });
  return exports;
}

function fixture(data: SectionDialogMode) {
  const { SectionDialog } = load("./SectionDialog.tsx");
  assert.equal(typeof SectionDialog, "function");
  const events: ("submit" | "close")[] = [];
  const submissions: { name: string; emoji?: string }[] = [];
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SectionDialog, {
      data,
      onSubmit(value: { name: string; emoji?: string }) { submissions.push(value); events.push("submit"); },
      onClose() { events.push("close"); },
    }));
  });
  const input = () => renderer.root.findByProps({ "aria-label": "Section name" });
  return {
    input,
    events,
    submissions,
    name(value: string) { act(() => input().props.onChange({ target: { value } })); },
    click(label: string) { act(() => renderer.root.findByProps({ children: label }).props.onClick()); },
    primary() { return renderer.root.findByProps({ "data-primary-action": true }); },
    enter(isComposing: boolean) {
      const observed: string[] = [];
      act(() => input().props.onKeyDown({
        key: "Enter",
        nativeEvent: { isComposing },
        preventDefault() { observed.push("prevent"); },
        stopPropagation() { observed.push("stop"); },
      }));
      return observed;
    },
    close() { act(() => renderer.unmount()); },
  };
}

const modes: SectionDialogMode[] = [
  { mode: "create" },
  { mode: "edit", sectionId: "section-test", name: "Existing", emoji: "\u{1f680}" },
];

for (const data of modes) {
  test(`section ${data.mode} name input disables automatic correction and capitalization`, () => {
    const view = fixture(data);
    try {
      const { autoCorrect, autoCapitalize } = view.input().props;
      assert.deepEqual({ autoCorrect, autoCapitalize }, { autoCorrect: "off", autoCapitalize: "off" });
      assert.equal(view.input().props.autoComplete, "off");
      assert.equal(view.input().props.spellCheck, false);
      assert.deepEqual(view.events, []);
    } finally { view.close(); }
  });

  test(`section ${data.mode} name input keeps focus selection and the initial name`, () => {
    const view = fixture(data);
    try {
      assert.equal(view.input().props.autoFocus, true);
      assert.equal(view.input().props.value, data.mode === "edit" ? data.name : "");
      let selected = 0;
      act(() => view.input().props.onFocus({ currentTarget: { select() { selected++; } } }));
      assert.equal(selected, 1);
      assert.deepEqual(view.events, []);
    } finally { view.close(); }
  });

  test(`section ${data.mode} name input preserves trimmed submit before close`, () => {
    const view = fixture(data);
    try {
      view.name("  Mixed Case section  ");
      assert.equal(view.primary().props.disabled, false);
      view.click(data.mode === "create" ? "Create" : "Save");
      assert.equal(view.submissions.length, 1);
      assert.equal(view.submissions[0].name, "Mixed Case section");
      assert.equal(view.submissions[0].emoji, data.mode === "edit" ? data.emoji : undefined);
      assert.deepEqual(view.events, ["submit", "close"]);
    } finally { view.close(); }
  });

  test(`section ${data.mode} name input preserves blank validation and IME-safe Enter`, () => {
    const view = fixture(data);
    try {
      view.name("   ");
      assert.equal(view.primary().props.disabled, true);
      assert.deepEqual(view.enter(false), ["prevent", "stop"]);
      assert.deepEqual(view.events, []);
      view.name("  Enter name  ");
      assert.deepEqual(view.enter(true), []);
      assert.deepEqual(view.events, []);
      assert.deepEqual(view.enter(false), ["prevent", "stop"]);
      assert.equal(view.submissions.length, 1);
      assert.equal(view.submissions[0].name, "Enter name");
      assert.deepEqual(view.events, ["submit", "close"]);
    } finally { view.close(); }
  });

  test(`section ${data.mode} Cancel closes without submitting the name`, () => {
    const view = fixture(data);
    try {
      view.name("Changed without saving");
      view.click("Cancel");
      assert.deepEqual(view.submissions, []);
      assert.deepEqual(view.events, ["close"]);
    } finally { view.close(); }
  });
}
