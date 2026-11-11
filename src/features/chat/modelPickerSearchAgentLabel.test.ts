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
const source = process.env.MODEL_PICKER_AGENT_LABEL_SOURCE_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_AGENT_LABEL_SOURCE_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

const opus: composerModels.ModelChoice = { model: "opus-5-1m", agent: "claude", effort: "high" };
const codex: composerModels.ModelChoice = { model: "gpt-5.6-sol", agent: "codex", effort: "high" };
const name = (choice: composerModels.ModelChoice) => composerModels.modelDisplayName(choice.model);

function visibleText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (node && typeof node === "object" && "children" in node) return visibleText(node.children);
  return "";
}

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
        Tooltip: ({ children }: { children: ReactNode }) => children,
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
      value: opus,
      favorites: [codex],
      ...props,
      onChange: (choice: composerModels.ModelChoice) => { changes.push(choice); },
    }));
  });
  act(() => renderer.root.findByProps({ "data-testid": "composer-model-button" }).props.onClick());
  const input = () => renderer.root.findByType("input");
  const rows = () => renderer.root.findAllByProps({ role: "menuitem" })
    .filter((row: { props: Record<string, unknown> }) => row.props["data-model-result"] !== undefined);
  return {
    changes,
    query(value: string) {
      act(() => input().props.onChange({ target: { value } }));
      assert.equal(input().props.value, value);
      assert.deepEqual(changes, []);
    },
    rowText() { return rows().map((row: unknown) => visibleText(row).replace(/\s+/g, " ").trim()); },
    choose(index: number) { act(() => rows()[index].props.onClick()); },
    queryValue() { return input().props.value; },
    close() { act(() => renderer.unmount()); },
  };
}

test("mounted search result shows the selected Claude agent instead of effort", () => {
  const view = fixture();
  try {
    view.query("opus");
    assert.deepEqual(view.rowText(), [`${name(opus)} Claude Code`]);
  } finally { view.close(); }
});

test("mounted search result shows the Codex agent instead of effort", () => {
  const view = fixture();
  try {
    view.query("gpt");
    assert.deepEqual(view.rowText(), [`${name(codex)} Codex`]);
  } finally { view.close(); }
});

test("mounted same-name search results retain loadout order and distinguish agents", () => {
  const view = fixture({ favorites: [codex, opus], itemLabel: () => "Shared model" });
  try {
    view.query("shared");
    assert.deepEqual(view.rowText(), ["Shared model Codex", "Shared model Claude Code"]);
  } finally { view.close(); }
});

test("mounted search row label uses callback agent before explicit identity", () => {
  const view = fixture({ favorites: [], itemAgent: () => "codex" });
  try {
    view.query("opus");
    assert.deepEqual(view.rowText(), [`${name(opus)} Codex`]);
  } finally { view.close(); }
});

test("mounted search row label uses explicit agent before catalog inference", () => {
  const view = fixture({ value: { ...opus, agent: "codex" }, favorites: [] });
  try {
    view.query("opus");
    assert.deepEqual(view.rowText(), [`${name(opus)} Codex`]);
  } finally { view.close(); }
});

test("mounted search row label retains catalog agent inference", () => {
  const view = fixture({ value: { model: opus.model, effort: opus.effort }, favorites: [] });
  try {
    view.query("opus");
    assert.deepEqual(view.rowText(), [`${name(opus)} Claude Code`]);
  } finally { view.close(); }
});

test("mounted blank and whitespace queries preserve default effort details", () => {
  const view = fixture();
  try {
    const baseline = [`${name(codex)} High`, `${name(opus)} High`];
    assert.deepEqual(view.rowText(), baseline);
    view.query("  ");
    assert.deepEqual(view.rowText(), baseline);
  } finally { view.close(); }
});

test("mounted clearing search restores default row text without selecting", () => {
  const view = fixture();
  try {
    const baseline = view.rowText();
    view.query("opus");
    view.query("");
    assert.deepEqual(view.rowText(), baseline);
  } finally { view.close(); }
});

test("mounted search selection preserves the original model identity and clears the query", () => {
  const view = fixture();
  try {
    view.query("gpt");
    view.choose(0);
    assert.equal(view.changes.length, 1);
    assert.equal(view.changes[0], codex);
    assert.equal(view.queryValue(), "");
    assert.deepEqual(view.rowText(), [`${name(codex)} High`, `${name(opus)} High`]);
  } finally { view.close(); }
});
