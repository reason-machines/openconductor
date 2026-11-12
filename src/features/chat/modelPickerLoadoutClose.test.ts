import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import * as models from "../../settings/models.ts";
import { bindCommands } from "../../keybindings/bind.ts";
import { createDispatcher, PRIORITY } from "../../keybindings/dispatcher.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import * as composerModels from "./composerModels.ts";
import * as loadoutChoices from "./loadoutChoices.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const slots: readonly (composerModels.ModelChoice | null)[] = [
  { agent: "claude", model: "opus-5-1m", effort: "high", fast: true },
  null,
  { agent: "codex", model: "gpt-5.4", effort: "xhigh", fast: false },
  null,
  { agent: "reason", model: "reason-test-model", effort: null },
];

function fixture({ disabled = false, focusInside = true } = {}) {
  const dispatcher = createDispatcher();
  const editor = {};
  const javascript = ts.transpileModule(source, {
    fileName: "ModelPicker.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./ModelPicker"), "ModelPicker">> = {};
  runInNewContext(javascript, {
    exports,
    document: { activeElement: editor, addEventListener() {}, removeEventListener() {} },
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
        useKeybindingOverrides: () => ({ overrides: {} }),
        useKeybindings(handlers: Parameters<typeof bindCommands>[1], options: Parameters<typeof bindCommands>[3]) {
          React.useEffect(() => bindCommands(dispatcher, handlers, {}, options), [handlers, options]);
        },
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
    value: slots[0], loadout: slots, disabled,
    onChange: (choice: composerModels.ModelChoice) => { changes.push(choice); },
  };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.ModelPicker, props), {
      createNodeMock(element: { type: unknown; props: { className?: string } }) {
        if (element.props.className === "oc-model-picker") return {
          closest: () => ({ contains: (target: unknown) => focusInside && target === editor }),
          querySelector: () => ({ scrollTop: 0 }),
        };
        if (element.type === "input") return { focus() {} };
        return null;
      },
    });
  });
  const menus = () => renderer.root.findAllByProps({ role: "menu", "aria-label": "Model" });
  return {
    changes,
    menus,
    open() {
      act(() => renderer.root.findByProps({ "data-testid": "composer-model-button" }).props.onClick());
      assert.equal(menus().length, 1);
    },
    disable() {
      act(() => renderer.update(React.createElement(exports.ModelPicker, { ...props, disabled: true })));
    },
    query(value: string) {
      act(() => renderer.root.findByType("input").props.onChange({ target: { value } }));
      assert.equal(renderer.root.findByType("input").props.value, value);
    },
    shortcut(index: number) {
      let result: ReturnType<typeof dispatcher.dispatch> | undefined;
      act(() => {
        result = dispatcher.dispatch({
          key: String(index), code: `Digit${index}`, metaKey: true, ctrlKey: false,
          altKey: false, shiftKey: false, repeat: false,
        }, { activeDialogId: null, typing: true, inTerminal: false });
      });
      assert.ok(result);
      return result;
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const index of [1, 3, 5]) {
  test(`mounted loadout shortcut ${index} applies the exact occupied slot and closes the model menu`, () => {
    const f = fixture();
    try {
      f.open();
      assert.equal(f.shortcut(index).kind, "ran");
      assert.deepEqual(f.changes, [slots[index - 1]]);
      assert.equal(f.menus().length, 0, "occupied loadout selection must close the model menu");
    } finally { f.close(); }
  });
}

test("mounted loadout shortcut selects the physical slot during a filtered model search and closes it", () => {
  const f = fixture();
  try {
    f.open();
    f.query("no-such-model");
    assert.equal(f.shortcut(3).kind, "ran");
    assert.deepEqual(f.changes, [slots[2]]);
    assert.equal(f.menus().length, 0, "loadout shortcut must close the filtered model menu");
  } finally { f.close(); }
});

for (const index of [2, 4]) {
  test(`mounted loadout empty-slot control ${index} keeps the menu open without a selection`, () => {
    const f = fixture();
    try {
      f.open();
      assert.equal(f.shortcut(index).kind, "ran");
      assert.deepEqual(f.changes, []);
      assert.equal(f.menus().length, 1);
    } finally { f.close(); }
  });
}

test("mounted loadout disabled control does not apply a shortcut or dismiss an already-open menu", () => {
  const f = fixture();
  try {
    f.open();
    f.disable();
    assert.notEqual(f.shortcut(3).kind, "ran");
    assert.deepEqual(f.changes, []);
    assert.equal(f.menus().length, 1);
  } finally { f.close(); }
});

test("mounted loadout closed-menu control applies an occupied slot while composer focus is inside", () => {
  const f = fixture();
  try {
    assert.equal(f.menus().length, 0);
    assert.equal(f.shortcut(3).kind, "ran");
    assert.deepEqual(f.changes, [slots[2]]);
    assert.equal(f.menus().length, 0);
  } finally { f.close(); }
});

test("mounted loadout outside-focus control leaves a closed picker unchanged", () => {
  const f = fixture({ focusInside: false });
  try {
    assert.notEqual(f.shortcut(3).kind, "ran");
    assert.deepEqual(f.changes, []);
    assert.equal(f.menus().length, 0);
  } finally { f.close(); }
});
