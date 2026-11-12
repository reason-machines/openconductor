import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as overrides from "../keybindings/overrides.ts";
import * as shortcut from "../keybindings/shortcut.ts";
import * as workspaceNumber from "../state/workspaceNumber.ts";
import * as allWorkspaces from "../home/allWorkspaces.ts";
import * as model from "./search/model.ts";
import * as state from "./state.ts";
import * as workspacesTab from "./workspacesTab.ts";
import { VIEW_ARCHIVED_ACTION } from "./fromAppState.ts";
import type { CommandPaletteProps } from "./CommandPalette.tsx";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const data: model.PaletteData = {
  actions: [
    { id: "alpha", title: "Alpha", group: "actions" },
    { id: "beta", title: "Beta", group: "actions" },
    { id: "gamma", title: "Gamma", group: "actions" },
  ],
  settings: [],
  workspaces: [],
  projects: [],
  recentWorkspaceIds: [],
  activeWorkspaceId: null,
};
type KeyOptions = Pick<KeyboardEvent, "isComposing" | "keyCode" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;
type KeyCase = { key: string; target: string; modifiers?: Partial<KeyOptions> };
const nativeKeys: KeyCase[] = [
  { key: "Enter", target: "Beta" },
  { key: "ArrowDown", target: "Gamma" },
  { key: "ArrowUp", target: "Alpha" },
  { key: "Home", target: "Alpha" },
  { key: "End", target: "Gamma" },
  { key: "ArrowUp", target: "Alpha", modifiers: { metaKey: true } },
  { key: "ArrowDown", target: "Gamma", modifiers: { metaKey: true } },
  { key: "n", target: "Gamma", modifiers: { ctrlKey: true } },
  { key: "p", target: "Alpha", modifiers: { ctrlKey: true } },
];
const compositionSignals = [
  { label: "native composition", values: { isComposing: true } },
  { label: "legacy keyCode 229", values: { keyCode: 229 } },
] satisfies { label: string; values: Partial<KeyOptions> }[];

function loadComponent() {
  const output = ts.transpileModule(readFileSync(new URL("./CommandPalette.tsx", import.meta.url), "utf8"), {
    fileName: "CommandPalette.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../keybindings/overrides.ts": overrides,
    "../keybindings/shortcut.ts": shortcut,
    "./search/model.ts": model,
    "./state.ts": state,
    "../state/workspaceNumber.ts": workspaceNumber,
    "./fromAppState.ts": { VIEW_ARCHIVED_ACTION },
    "../home/allWorkspaces.ts": allWorkspaces,
    "../home/allWorkspaces": allWorkspaces,
    "./workspacesTab.ts": workspacesTab,
    "./WorkspacesTab.tsx": { WorkspaceFilters: inert, WorkspaceRow: inert },
    "../components/Icons": { SearchIcon: inert },
    "../components/motion/dialogMotion": { useDialogMotion: () => ({ current: null }) },
    "../components/ConductorIcon": { ConductorIcon: inert },
    "./palette.css": {},
  };
  const exported: Partial<typeof import("./CommandPalette.tsx")> = {};
  runInNewContext(output, {
    console,
    Date,
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected palette component dependency: ${name}`);
      return imports[name];
    },
  });
  assert.ok(exported.CommandPalette);
  return exported.CommandPalette;
}

async function fixture(customOverrides: CommandPaletteProps["overrides"] = {}) {
  const selected: string[] = [];
  let closeCount = 0;
  let renderer: ReturnType<typeof create>;
  const CommandPalette = loadComponent();
  await act(async () => {
    renderer = create(React.createElement(CommandPalette, {
      data,
      initialTab: "actions",
      overrides: customOverrides,
      onSelect(item) { selected.push(item.id); },
      onClose() { closeCount += 1; },
    }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        if (node.props.id === "palette-list") return { scrollTo() {}, querySelector() { return { scrollIntoView() {} }; } };
        return null;
      },
    });
  });
  const rows = () => renderer.root.findAllByProps({ role: "option" });
  const beta = rows()[1];
  assert.ok(beta);
  await act(async () => { beta.props.onMouseMove(); });
  function activeTitle() {
    const row = renderer.root.findByProps({ role: "option", "aria-selected": true });
    return row.findByProps({ className: "palette-title" }).props.children;
  }
  assert.equal(activeTitle(), "Beta");
  return {
    selected,
    closes() { return closeCount; },
    activeTitle,
    activeTab() { return renderer.root.findByProps({ role: "tab", "aria-selected": true }).props.children; },
    async press(key: string, options: Partial<KeyOptions> = {}) {
      const nativeEvent = { key, isComposing: false, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...options };
      const event = {
        ...nativeEvent,
        nativeEvent,
        prevented: 0,
        stopped: 0,
        preventDefault() { this.defaultPrevented = true; nativeEvent.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ className: "palette-input" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async dispose() { await act(async () => { renderer.unmount(); }); },
  };
}

function keyLabel(scenario: KeyCase) {
  return `${scenario.modifiers?.metaKey ? "Meta+" : scenario.modifiers?.ctrlKey ? "Control+" : ""}${scenario.key}`;
}

for (const signal of compositionSignals) {
  for (const scenario of nativeKeys) {
    test(`palette ignores ${keyLabel(scenario)} during ${signal.label}`, async () => {
      const view = await fixture();
      try {
        const event = await view.press(scenario.key, { ...scenario.modifiers, ...signal.values });
        assert.deepEqual(view.selected, [], "composition must not activate a result");
        assert.equal(view.closes(), 0, "composition must not close the palette");
        assert.equal(view.activeTitle(), "Beta", "composition must not move the active result");
        assert.deepEqual(event, { prevented: 0, stopped: 0 });
      } finally { await view.dispose(); }
    });
  }
}

for (const scenario of nativeKeys) {
  test(`palette preserves ordinary ${keyLabel(scenario)}`, async () => {
    const view = await fixture();
    try {
      const event = await view.press(scenario.key, scenario.modifiers);
      if (scenario.key === "Enter") {
        assert.deepEqual(view.selected, ["action:beta"]);
        assert.equal(view.closes(), 1);
      } else {
        assert.deepEqual(view.selected, []);
        assert.equal(view.closes(), 0);
        assert.equal(view.activeTitle(), scenario.target);
      }
      assert.deepEqual(event, { prevented: 1, stopped: 1 });
    } finally { await view.dispose(); }
  });
}

for (const signal of compositionSignals) {
  test(`palette preserves Escape close during ${signal.label}`, async () => {
    const view = await fixture();
    try {
      assert.deepEqual(await view.press("Escape", signal.values), { prevented: 1, stopped: 1 });
      assert.deepEqual(view.selected, []);
      assert.equal(view.closes(), 1);
    } finally { await view.dispose(); }
  });
  test(`palette preserves a custom tab shortcut during ${signal.label}`, async () => {
    const view = await fixture({ "commandPalette.nextTab": [{ key: "l", modifiers: ["alt"] }] });
    try {
      assert.deepEqual(await view.press("l", { altKey: true, ...signal.values }), { prevented: 1, stopped: 1 });
      assert.equal(view.activeTab(), "Settings");
      assert.deepEqual(view.selected, []);
      assert.equal(view.closes(), 0);
    } finally { await view.dispose(); }
  });
  test(`palette leaves unrelated text keys untouched during ${signal.label}`, async () => {
    const view = await fixture();
    try {
      assert.deepEqual(await view.press("a", signal.values), { prevented: 0, stopped: 0 });
      assert.equal(view.activeTitle(), "Beta");
      assert.deepEqual(view.selected, []);
      assert.equal(view.closes(), 0);
    } finally { await view.dispose(); }
  });
}
