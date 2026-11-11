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

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_DISABLED_SOURCE_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_DISABLED_SOURCE_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

function fixture() {
  const javascript = ts.transpileModule(source, {
    fileName: "ModelPicker.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./ModelPicker"), "ModelPicker">> = {};
  runInNewContext(javascript, {
    exports,
    document: { addEventListener() {}, removeEventListener() {} },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../../components/ui/Tooltip.tsx") return {
        Tooltip: ({ children }: { children: ReactNode }) => children,
        ShortcutHint: () => null,
      };
      if (name === "../../components/motion/usePresence.ts") return {
        usePresence: (open: boolean) => ({ mounted: open, attrs: {} }),
      };
      if (name === "../../keybindings/KeybindingsProvider.tsx") return {
        useKeybindings() {},
        useKeybindingOverrides: () => ({ overrides: {} }),
      };
      if (name === "../../keybindings/overrides.ts") return { effectiveShortcuts };
      if (name === "../../keybindings/shortcut.ts") return { glyphs };
      if (name === "../../keybindings/dispatcher.ts") return { PRIORITY };
      if (name === "../../settings/models.ts") return models;
      if (name === "./composerModels.ts") return composerModels;
      if (name === "./loadoutChoices.ts") return loadoutChoices;
      if (name === "./composerIcons.tsx") return {
        ArrowUpRightIcon: () => null, CheckIcon: () => null, ChevronDownIcon: () => null,
        ChevronRightIcon: () => null, ModelGlyph: () => null, PlusSmallIcon: () => null,
        SearchSmallIcon: () => null, SettingsSmallIcon: () => null,
      };
      throw new Error(`Unexpected model picker dependency: ${name}`);
    },
  });
  assert.ok(exports.ModelPicker);
  const changes: composerModels.ModelChoice[] = [];
  const props = {
    value: { model: "claude-opus-4-6" },
    favorites: [{ model: "claude-sonnet-4-6" }],
    onChange: (choice: composerModels.ModelChoice) => { changes.push(choice); },
  };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(exports.ModelPicker, props)); });
  act(() => renderer.root.findByProps({ "data-testid": "composer-model-button" }).props.onClick());
  const input = () => renderer.root.findByType("input");
  return {
    changes,
    input,
    rows: () => renderer.root.findAll((node: { type: unknown; props: { "data-model-result"?: number } }) => node.type === "button" && node.props["data-model-result"] !== undefined),
    query(value: string) { act(() => input().props.onChange({ target: { value } })); },
    disabled(value: boolean) { act(() => renderer.update(React.createElement(exports.ModelPicker, { ...props, disabled: value }))); },
    clickResult() { act(() => renderer.root.findByProps({ "data-model-result": 0 }).props.onClick()); },
    close() { act(() => renderer.unmount()); },
  };
}

for (const query of ["", "sonnet", "opus"]) {
  test(`an already-open model menu disables native result buttons for query ${JSON.stringify(query)}`, () => {
    const view = fixture();
    try {
      view.query(query);
      assert.ok(view.rows().length > 0);
      view.disabled(true);
      assert.equal(view.input().props.value, query);
      for (const row of view.rows()) assert.equal(row.props.disabled, true);
      assert.deepEqual(view.changes, []);
    } finally { view.close(); }
  });
}

test("changing a search query while disabled keeps newly rendered results disabled", () => {
  const view = fixture();
  try {
    view.query("sonnet");
    view.disabled(true);
    view.query("opus");
    assert.equal(view.input().props.value, "opus");
    assert.equal(view.rows().length, 1);
    assert.equal(view.rows()[0].props.disabled, true);
    assert.deepEqual(view.changes, []);
  } finally { view.close(); }
});

test("reenabling preserves filtered mouse selection and the open menu", () => {
  const view = fixture();
  try {
    view.query("sonnet");
    view.disabled(true);
    view.disabled(false);
    for (const row of view.rows()) assert.equal(!!row.props.disabled, false);
    view.clickResult();
    assert.deepEqual(view.changes, [{ model: "claude-sonnet-4-6" }]);
    assert.equal(view.input().props.value, "");
  } finally { view.close(); }
});
