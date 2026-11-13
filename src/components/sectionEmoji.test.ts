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
      throw new Error(`Unexpected section dialog dependency: ${name}`);
    },
  });
  return exports;
}

function fixture(data: SectionDialogMode = { mode: "create" }) {
  const { SectionDialog } = load("./SectionDialog.tsx");
  assert.equal(typeof SectionDialog, "function");
  const submissions: { name: string; emoji?: string }[] = [];
  let closed = 0;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SectionDialog, {
      data,
      onSubmit: (value: { name: string; emoji?: string }) => { submissions.push(value); },
      onClose: () => { closed++; },
    }));
  });
  const buttons = () => renderer.root.findAllByType("button");
  const search = () => renderer.root.findByProps({ placeholder: "Search emoji" });
  const options = () => renderer.root.findAllByProps({ role: "option" });
  return {
    renderer: () => renderer,
    submissions,
    closed: () => closed,
    search,
    options,
    open() {
      const trigger = buttons().find((node: { props: { "aria-expanded"?: boolean } }) => node.props["aria-expanded"] !== undefined);
      assert.ok(trigger);
      act(() => trigger.props.onClick());
    },
    query(value: string) { act(() => search().props.onChange({ target: { value } })); },
    name(value: string) {
      act(() => renderer.root.findByProps({ "aria-label": "Section name" }).props.onChange({ target: { value } }));
    },
    click(label: string) {
      const button = buttons().find((node: { props: { children?: unknown; "aria-label"?: string } }) => node.props.children === label || node.props["aria-label"] === label);
      assert.ok(button, `Missing button ${label}`);
      act(() => button.props.onClick());
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("section emoji search appears only after opening the picker", () => {
  const view = fixture();
  try {
    assert.equal(view.renderer().root.findAllByProps({ placeholder: "Search emoji" }).length, 0);
    view.open();
    assert.equal(view.search().props.value, "");
    assert.equal(view.options().length, 20);
  } finally { view.close(); }
});

for (const query of ["rocket", " ROCKET ", "launch"]) {
  test(`section emoji search filters the existing choices for ${JSON.stringify(query)}`, () => {
    const view = fixture();
    try {
      view.open();
      view.query(query);
      assert.equal(view.options().length, 1);
      assert.equal(view.options()[0].props.children, "\u{1f680}");
      assert.equal(view.submissions.length, 0);
      assert.equal(view.closed(), 0);
      view.query("   ");
      assert.equal(view.options().length, 20);
    } finally { view.close(); }
  });
}

test("unmatched section emoji search shows the empty state without submitting", () => {
  const view = fixture();
  try {
    view.open();
    view.query("no-such-section-emoji");
    assert.equal(view.options().length, 0);
    assert.equal(view.renderer().root.findByProps({ role: "status" }).props.children, "No emoji found");
    assert.equal(view.submissions.length, 0);
    assert.equal(view.closed(), 0);
  } finally { view.close(); }
});

test("selecting a filtered emoji closes the picker but saves only on Create", () => {
  const view = fixture();
  try {
    view.name("  Launch  ");
    view.open();
    view.query("rocket");
    act(() => view.options()[0].props.onClick());
    assert.equal(view.renderer().root.findAllByProps({ placeholder: "Search emoji" }).length, 0);
    assert.equal(view.submissions.length, 0);
    view.click("Create");
    assert.equal(view.submissions.length, 1);
    assert.equal(view.submissions[0].name, "Launch");
    assert.equal(view.submissions[0].emoji, "\u{1f680}");
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

test("Remove emoji remains usable with no search results and omits emoji on Save", () => {
  const view = fixture({ mode: "edit", sectionId: "section-a", name: "Existing", emoji: "\u{1f525}" });
  try {
    view.open();
    view.query("no-such-section-emoji");
    view.click("Remove emoji");
    assert.equal(view.renderer().root.findAllByProps({ placeholder: "Search emoji" }).length, 0);
    view.click("Save");
    assert.equal(view.submissions[0].name, "Existing");
    assert.equal(Object.prototype.hasOwnProperty.call(view.submissions[0], "emoji"), false);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

for (const mode of ["create", "edit"] as const) {
  test(`section ${mode} preserves Cancel without submitting`, () => {
    const data: SectionDialogMode = mode === "create" ? { mode } : { mode, sectionId: "section-a", name: "Existing", emoji: "\u{1f525}" };
    const view = fixture(data);
    try {
      view.open();
      view.click("Cancel");
      assert.equal(view.submissions.length, 0);
      assert.equal(view.closed(), 1);
    } finally { view.close(); }
  });
}

test("section name keeps its trimmed-empty primary-button guard and Enter control", () => {
  const view = fixture();
  try {
    assert.equal(view.renderer().root.findByProps({ "data-primary-action": true }).props.disabled, true);
    view.name("  Section  ");
    assert.equal(view.renderer().root.findByProps({ "data-primary-action": true }).props.disabled, false);
    let prevented = 0;
    let stopped = 0;
    const event = { key: "Enter", nativeEvent: { isComposing: true }, preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
    act(() => view.renderer().root.findByProps({ "aria-label": "Section name" }).props.onKeyDown(event));
    assert.equal(view.submissions.length, 0);
    event.nativeEvent.isComposing = false;
    act(() => view.renderer().root.findByProps({ "aria-label": "Section name" }).props.onKeyDown(event));
    assert.equal(view.submissions[0].name, "Section");
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
  } finally { view.close(); }
});
