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
const sourceRef = process.env.MODEL_PICKER_IME_PROPAGATION_REF;
const source = (path: string) => sourceRef
  ? execFileSync("git", ["show", `${sourceRef}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const pickerSource = source("src/features/chat/ModelPicker.tsx");
const dialogSource = source("src/components/CreateWorkspaceDialog.tsx");
const signals = ["isComposing", "nativeIsComposing", "keyCode", "which", "nativeKeyCode", "nativeWhich"] as const;
type Signal = typeof signals[number];

type HostNode = { type: string; props: Record<string, any>; instance: any; parent: HostNode | null };

// Mount both real components, connect them through the composer boundary, and
// walk their rendered host ancestry in bubbling order. This does not emulate a
// browser's native/capture/default-action phases or evaluate reference code.
function dispatch({ key = "Escape", query = "opus", signal, code = 229, target = "search", defaultPrevented = false }: {
  key?: string;
  query?: string;
  signal?: Signal;
  code?: number;
  target?: "search" | "result" | "other";
  defaultPrevented?: boolean;
} = {}) {
  const changes: string[] = [];
  const focus: string[] = [];
  const state = { stopped: false, prevented: defaultPrevented, query, open: true, changes, focus, dialogCloses: 0 };
  class Element { focus() {} }
  class Button extends Element { dataset: { modelResult?: string } = {}; }
  const rowNodes = new Map<string, Button>();
  const inputNode = { focus: () => focus.push("search") };
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  const javascript = (text: string, fileName: string) => ts.transpileModule(text, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const picker: Partial<typeof import("./ModelPicker")> = {};
  const dialog: Partial<typeof import("../../components/CreateWorkspaceDialog")> = {};
  const wrapper = (tag: string) => ({ children, ...props }: { children?: ReactNode }) => React.createElement(tag, props, children);
  function require(specifier: string) {
    if (specifier === "react" || specifier === "react/jsx-runtime") return dependencies(specifier);
    if (specifier === "fuzzysort") return { default: dependencies(specifier) };
    if (specifier === "@base-ui/react/dialog") return { Dialog: { Root: wrapper("section"), Portal: wrapper("aside"), Popup: wrapper("div") } };
    if (specifier === "./CreateWorkspaceComposer") return {
      CreateWorkspaceComposer: () => React.createElement("form", null, React.createElement(picker.ModelPicker, {
        value: { model: "current" }, favorites: [{ model: "opus" }, { model: "sonnet" }],
        itemLabel: (choice: composerModels.ModelChoice) => choice.model === "sonnet" ? "Opus Sonnet" : choice.model,
        onChange: (choice: composerModels.ModelChoice) => changes.push(choice.model),
      })),
    };
    if (specifier === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
    if (specifier === "../../components/ui/Tooltip.tsx") return {
      Tooltip: ({ children }: { children: ReactNode }) => children, ShortcutHint: () => null,
    };
    if (specifier === "../../components/motion/usePresence.ts") return {
      usePresence: (open: boolean) => ({ mounted: open, attrs: {} }),
    };
    if (specifier === "../../keybindings/KeybindingsProvider.tsx") return {
      useKeybindings() {}, useKeybindingOverrides: () => ({ overrides: {} }),
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
    throw new Error(`Unexpected IME propagation dependency: ${specifier}`);
  }
  const context = { require, document, HTMLElement: Element, HTMLButtonElement: Button };
  runInNewContext(javascript(pickerSource, "ModelPicker.tsx"), { ...context, exports: picker });
  runInNewContext(javascript(dialogSource, "CreateWorkspaceDialog.tsx"), { ...context, exports: dialog });
  assert.ok(picker.ModelPicker);
  assert.ok(dialog.CreateWorkspaceDialog);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(dialog.CreateWorkspaceDialog, { onClose: () => state.dialogCloses++ }), {
      createNodeMock(element: { type: string; props: Record<string, any> }) {
        if (element.type === "input") return inputNode;
        if (element.type === "button") {
          const index = element.props["data-model-result"];
          const button = rowNodes.get(String(index)) ?? new Button();
          if (index !== undefined) {
            button.dataset.modelResult = String(index);
            button.focus = () => focus.push(`[data-model-result="${index}"]`);
            rowNodes.set(String(index), button);
          }
          return button;
        }
        return {
          getBoundingClientRect: () => ({ height: 300 }),
          querySelector: (selector: string) => selector === ".oc-model-list" ? { scrollTop: 0 }
            : rowNodes.get(selector.match(/data-model-result="(\d+)"/)?.[1] ?? ""),
        };
      },
    });
  });
  try {
    const chip = () => renderer.root.findByProps({ "data-testid": "composer-model-button" });
    act(() => chip().props.onClick());
    act(() => renderer.root.findByType("input").props.onChange({ target: { value: query } }));
    const start = (target === "search" ? renderer.root.findByType("input")
      : target === "result" ? renderer.root.findByProps({ "data-model-result": 1 })
      : renderer.root.findByProps({ className: "oc-model-menu" })) as HostNode;
    const nativeEvent = { isComposing: signal === "nativeIsComposing", keyCode: signal === "nativeKeyCode" ? code : 0, which: signal === "nativeWhich" ? code : 0 };
    const e = {
      key, target: start.instance, currentTarget: null as any,
      isComposing: signal === "isComposing", keyCode: signal === "keyCode" ? code : 0, which: signal === "which" ? code : 0,
      nativeEvent,
      get defaultPrevented() { return state.prevented; },
      preventDefault: () => { state.prevented = true; },
      stopPropagation: () => { state.stopped = true; },
    };
    const ancestors: HostNode[] = [];
    for (let node: HostNode | null = start; node; node = node.parent) {
      if (typeof node.type === "string") ancestors.push(node);
    }
    assert.ok(ancestors.some((node) => node.props.className === "oc-model-picker"), "actual picker root is in the input's ancestry");
    assert.ok(ancestors.some((node) => node.props.className === "create-dialog"), "actual enclosing Popup callback is in the input's ancestry");
    act(() => {
      for (const node of ancestors) {
        if (state.stopped) break;
        e.currentTarget = node.instance;
        node.props.onKeyDown?.(e);
      }
    });
    state.open = chip().props["aria-expanded"];
    state.query = state.open ? renderer.root.findByType("input").props.value : "";
    return state;
  } finally { act(() => renderer.unmount()); }
}

const untouched = (query = "opus") => ({ stopped: false, prevented: false, query, open: true, changes: [], focus: [], dialogCloses: 0 });

for (const signal of signals) {
  test(`search composition ${signal} contains Escape before the actual create-dialog callback`, () => {
    for (const query of ["", "opus"]) {
      assert.deepEqual(dispatch({ signal, query }), { ...untouched(query), stopped: true });
    }
  });
}

test("search composition contains Enter, navigation and editing without preventing IME defaults", () => {
  for (const signal of signals) {
    for (const key of ["Enter", "ArrowDown", "ArrowUp", "Tab", "a"]) {
      assert.deepEqual(dispatch({ signal, key }), { ...untouched(), stopped: true });
    }
  }
});

test("ordinary Escape clears search or closes only the model menu, never the create dialog", () => {
  assert.deepEqual(dispatch(), { ...untouched(""), stopped: true, prevented: true });
  assert.deepEqual(dispatch({ query: "" }), { ...untouched(""), stopped: true, prevented: true, open: false });
});

test("ordinary Enter and adjacent key codes still select the same first result", () => {
  for (const code of [13, 228, 230]) {
    assert.deepEqual(dispatch({ key: "Enter", signal: "keyCode", code }), {
      ...untouched(""), stopped: true, prevented: true, changes: ["opus"], focus: ["search"],
    });
  }
});

test("already-prevented composing events remain untouched", () => {
  for (const signal of signals) {
    assert.deepEqual(dispatch({ signal, defaultPrevented: true }), { ...untouched(), prevented: true });
  }
});

test("composition outside the search input retains the prior propagation policy", () => {
  for (const target of ["result", "other"] as const) {
    for (const signal of signals) {
      assert.deepEqual(dispatch({ signal, key: "Enter", target }), untouched());
    }
  }
});

test("ordinary Tab and focused-result Enter preserve navigation and exact selected result", () => {
  assert.deepEqual(dispatch({ key: "Tab" }), untouched());
  assert.deepEqual(dispatch({ key: "Enter", target: "result" }), {
    ...untouched(""), stopped: true, prevented: true, changes: ["sonnet"], focus: ["search"],
  });
});
