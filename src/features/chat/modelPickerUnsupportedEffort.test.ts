import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import * as models from "../../settings/models.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import * as composerModels from "./composerModels.ts";
import * as loadoutChoices from "./loadoutChoices.ts";
import type { ModelPickerProps } from "./ModelPicker.tsx";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_UNSUPPORTED_EFFORT_SOURCE_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_UNSUPPORTED_EFFORT_SOURCE_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

const haiku: composerModels.ModelChoice = { model: "haiku-4-5", agent: "claude", effort: null };
const opus: composerModels.ModelChoice = { model: "opus-5-1m", agent: "claude", effort: "high" };
const codex: composerModels.ModelChoice = { model: "gpt-5.6-sol", agent: "codex", effort: "high" };

function visibleText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (node && typeof node === "object" && "children" in node) return visibleText(node.children);
  return "";
}
const text = (node: unknown) => visibleText(node).replace(/\s+/g, " ").trim();

function fixture(props: Partial<Omit<ModelPickerProps, "onChange">> = {}) {
  const javascript = ts.transpileModule(source, {
    fileName: "ModelPicker.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./ModelPicker"), "ModelPicker">> = {};
  runInNewContext(javascript, {
    exports,
    document: { addEventListener() {}, removeEventListener() {} },
    require(specifier: string) {
      if (specifier === "react" || specifier === "react/jsx-runtime") return dependencies(specifier);
      if (specifier === "../../components/ui/Tooltip.tsx") return {
        Tooltip: ({ content, side, children }: { content: ReactNode; side?: string; children: ReactNode }) =>
          React.createElement("span", { "data-tooltip": content, "data-tooltip-side": side }, children),
        ShortcutHint: () => null,
      };
      if (specifier === "../../components/motion/usePresence.ts") return {
        usePresence: (open: boolean) => ({ mounted: open, attrs: {} }),
      };
      if (specifier === "../../keybindings/KeybindingsProvider.tsx") return {
        useKeybindings() {},
        useKeybindingOverrides: () => ({ overrides: {} }),
      };
      if (specifier === "../../keybindings/overrides.ts") return { effectiveShortcuts };
      if (specifier === "../../keybindings/shortcut.ts") return { glyphs };
      if (specifier === "../../keybindings/dispatcher.ts") return { PRIORITY };
      if (specifier === "../../settings/models.ts") return models;
      if (specifier === "./composerModels.ts") return composerModels;
      if (specifier === "./loadoutChoices.ts") return loadoutChoices;
      if (specifier === "./composerIcons.tsx") return {
        ArrowUpRightIcon: () => null, CheckIcon: () => null, ChevronDownIcon: () => null,
        ChevronRightIcon: () => null, ModelGlyph: () => null, PlusSmallIcon: () => null,
        SearchSmallIcon: () => null, SettingsSmallIcon: () => null,
      };
      throw new Error(`Unexpected model picker dependency: ${specifier}`);
    },
  });
  assert.ok(exports.ModelPicker);
  const changes: composerModels.ModelChoice[] = [];
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.ModelPicker, {
      value: haiku,
      favorites: [opus, codex],
      ...props,
      onChange: (choice: composerModels.ModelChoice) => { changes.push(choice); },
    }));
  });
  act(() => renderer.root.findByProps({ "data-testid": "composer-model-button" }).props.onClick());
  const rows = () => renderer.root.findAllByProps({ role: "menuitem" });
  return {
    changes,
    effortRows: () => rows().filter((row: unknown) => /^(Effort|Thinking)( |$)/.test(text(row))),
    tooltip: () => renderer.root.findAllByProps({ "data-tooltip": "Not supported for this model" }),
    submenus: () => renderer.root.findAllByProps({ className: "oc-model-submenu" }),
    results: () => rows().filter((row: { props: Record<string, unknown> }) => row.props["data-model-result"] !== undefined),
    query(value: string) {
      act(() => renderer.root.findByType("input").props.onChange({ target: { value } }));
      assert.equal(renderer.root.findByType("input").props.value, value);
    },
    click(row: { props: { onClick?: () => void } }) { act(() => row.props.onClick?.()); },
    close() { act(() => renderer.unmount()); },
  };
}

for (const model of ["haiku-4-5", "haiku"]) {
  test(`mounted built-in ${model} explains unsupported Effort without activating it`, () => {
    const view = fixture({ value: { ...haiku, model } });
    try {
      assert.equal(view.effortRows().length, 1, "unsupported built-in Effort row must remain present");
      const row = view.effortRows()[0];
      assert.equal(text(row), "Effort Not supported");
      assert.equal(row.type, "button");
      assert.equal(row.props.disabled, true);
      assert.equal(row.props.onClick, undefined);
      assert.equal(row.props.onKeyDown, undefined);
      assert.equal(row.props["aria-haspopup"], undefined);
      assert.equal(view.tooltip().length, 1);
      assert.equal(view.tooltip()[0].props["data-tooltip-side"], "right");
      view.click(row);
      assert.deepEqual(view.changes, []);
      assert.equal(view.submenus().length, 0);
    } finally { view.close(); }
  });
}

test("mounted legacy Haiku without explicit agent uses its built-in capability", () => {
  const view = fixture({ value: { model: "haiku", effort: null } });
  try {
    assert.deepEqual(view.effortRows().map(text), ["Effort Not supported"]);
  } finally { view.close(); }
});

test("mounted unsupported Effort is hidden during search and restored on clear", () => {
  const view = fixture();
  try {
    assert.deepEqual(view.effortRows().map(text), ["Effort Not supported"]);
    view.query("opus");
    assert.equal(view.effortRows().length, 0);
    assert.equal(view.tooltip().length, 0);
    assert.deepEqual(view.results().map(text), ["Opus 5 Claude Code"]);
    view.query("");
    assert.deepEqual(view.effortRows().map(text), ["Effort Not supported"]);
    assert.deepEqual(view.changes, []);
  } finally { view.close(); }
});

for (const [value, label, lowLabel] of [[opus, "Effort", "Low"], [codex, "Thinking", "Light"]] satisfies [composerModels.ModelChoice, string, string][]) {
  test(`mounted supported ${label} still selects an effort with the same identity`, () => {
    const view = fixture({ value });
    try {
      const row = view.effortRows()[0];
      assert.equal(text(row), `${label} High`);
      assert.notEqual(row.props.disabled, true);
      assert.equal(view.tooltip().length, 0);
      view.click(row);
      const low = view.submenus()[0].findAllByType("button").find((option: unknown) => text(option) === lowLabel);
      assert.ok(low);
      view.click(low);
      assert.equal(view.changes.length, 1);
      assert.deepEqual({ ...view.changes[0] }, { ...value, effort: "low" });
    } finally { view.close(); }
  });
}

for (const value of [
  { model: "custom-model", effort: null },
  { model: "claude-code", agent: "claude", effort: null },
  { ...haiku, agent: "reason" },
  { ...haiku, agent: "codex" },
] satisfies composerModels.ModelChoice[]) {
  test(`mounted non-built-in choice ${value.agent ?? "unknown"}/${value.model} stays unchanged`, () => {
    const view = fixture({ value });
    try {
      assert.equal(view.effortRows().length, 0);
      assert.equal(view.tooltip().length, 0);
      assert.deepEqual(view.changes, []);
    } finally { view.close(); }
  });
}

test("mounted callback-resolved Reason agent does not acquire a built-in unsupported row", () => {
  const view = fixture({ itemAgent: () => "reason" });
  try {
    assert.equal(view.effortRows().length, 0);
    assert.equal(view.tooltip().length, 0);
  } finally { view.close(); }
});

test("mounted unsupported row preserves favorite order and exact model selection identity", () => {
  const view = fixture({ favorites: [codex, opus] });
  try {
    assert.deepEqual(view.results().map(text), ["GPT-5.6 Sol High", "Opus 5 High", "Haiku 4.5"]);
    view.click(view.results()[0]);
    assert.equal(view.changes.length, 1);
    assert.equal(view.changes[0], codex);
  } finally { view.close(); }
});
