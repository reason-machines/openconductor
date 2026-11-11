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
const source = process.env.MODEL_PICKER_SEARCH_INPUT_SOURCE_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_SEARCH_INPUT_SOURCE_REF}:${sourcePath}`], { encoding: "utf8" })
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
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.ModelPicker, {
      value: { model: "claude-opus-4-6" },
      favorites: [{ model: "claude-sonnet-4-6" }],
      onChange: (choice: composerModels.ModelChoice) => { changes.push(choice); },
    }));
  });
  const toggle = () => {
    act(() => renderer.root.findByProps({ "data-testid": "composer-model-button" }).props.onClick());
  };
  toggle();
  const input = () => renderer.root.findByType("input");
  return {
    changes,
    input,
    toggle,
    query(value: string) { act(() => input().props.onChange({ target: { value } })); },
    close() { act(() => renderer.unmount()); },
  };
}

for (const attribute of ["autoCorrect", "autoCapitalize"]) {
  test(`mounted model search input declares ${attribute}=off before and after typing`, () => {
    const view = fixture();
    try {
      for (const query of ["", " SONNET "]) {
        view.query(query);
        assert.equal(view.input().props[attribute], "off");
        assert.equal(view.input().props.value, query);
      }
      view.toggle();
      view.toggle();
      assert.equal(view.input().props[attribute], "off");
    } finally { view.close(); }
  });
}

test("mounted model search retains its existing input attributes", () => {
  const view = fixture();
  try {
    const input = view.input();
    assert.equal(input.props["aria-label"], "Search models");
    assert.equal(input.props.placeholder, "Search models");
    assert.equal(input.props.autoComplete, "off");
    assert.equal(input.props.spellCheck, false);
    assert.equal(input.props.autoFocus, true);
    assert.equal(input.props.value, "");
  } finally { view.close(); }
});

test("mounted model search keeps typed model identifiers verbatim without selecting a model", () => {
  const view = fixture();
  try {
    for (const query of ["claude-SONNET-4-6", "no matching MODEL", ""]) {
      view.query(query);
      assert.equal(view.input().props.value, query);
      assert.deepEqual(view.changes, []);
    }
  } finally { view.close(); }
});
