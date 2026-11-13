import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { OpenInApp } from "./apps.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const installed: OpenInApp[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "cursor", name: "Cursor", iconType: "code", icon: null },
];
type FocusTarget = { id: string; focus(): void };
type ArrowKey = "ArrowDown" | "ArrowUp";

function load(file: string, exported: object, imports: Record<string, unknown>, document: object) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    Error,
    console,
    document,
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Open in component dependency: ${name}`);
      return imports[name];
    },
  });
}

async function fixture() {
  const calls: string[] = [];
  const focusCalls: string[] = [];
  const document: { activeElement: FocusTarget | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };
  function focusTarget(id: string): FocusTarget {
    const target = { id, focus() { document.activeElement = target; focusCalls.push(id); } };
    return target;
  }
  const rows = [focusTarget("finder"), focusTarget("cursor"), focusTarget("copy-path")];
  const chevron = focusTarget("chevron");
  const outside = focusTarget("outside");
  const menuNode = {
    querySelector() { return rows[0]; },
    querySelectorAll() { return rows; },
  };
  const wrapNode = { contains() { return true; }, querySelector() { return chevron; } };
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return installed;
      calls.push(JSON.stringify({ command, args }));
    },
  };
  const apps: Partial<typeof import("./apps.ts")> = {};
  load("./apps.ts", apps, { "@tauri-apps/api/core": native }, document);
  const component: Partial<typeof import("./OpenInButton.tsx")> = {};
  const inert = () => null;
  load("./OpenInButton.tsx", component, {
    "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children, ShortcutHint: inert },
    "../../components/motion/usePresence.ts": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "../../keybindings/dispatcher.ts": { PRIORITY: { DIALOG: 100 } },
    "../../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings() {} },
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../../keybindings/shortcut.ts": { glyphs: () => "" },
    "../../components/Icons": { ChevronDownIcon: inert, CodeIcon: inert, CopyIcon: inert, FolderIcon: inert, TerminalIcon: inert },
    "../../settings/appPrefs": {
      useAppPrefs: () => ({ default_open_in: "finder", open_in_mru_order: [] }),
      async recordOpenIn() { calls.push("record_open_in"); },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  }, document);
  const OpenInButton = component.OpenInButton;
  assert.ok(OpenInButton);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(OpenInButton, { variant: "split", path: "/Users/demo/project" }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        if (node.props.role === "menu") return menuNode;
        if (node.props.className === "oi") return wrapNode;
        return null;
      },
    });
  });
  await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); });
  assert.equal(document.activeElement?.id, "finder", "opening focuses the first row through the mounted ref");
  focusCalls.length = 0;
  return {
    calls,
    focusCalls,
    focus(id: string) {
      const target = id === "outside" ? outside : rows.find((row) => row.id === id);
      assert.ok(target);
      document.activeElement = target;
      focusCalls.length = 0;
    },
    active() { return document.activeElement?.id; },
    isOpen() { return renderer.root.findAllByProps({ role: "menu" }).length > 0; },
    async press(key: string, defaultPrevented = false) {
      const event = {
        key,
        defaultPrevented,
        currentTarget: menuNode,
        prevented: 0,
        stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async close() { await act(async () => { renderer.unmount(); }); assert.deepEqual(calls, [], "navigation must not write preferences, copy, or launch an app"); },
  };
}

for (const key of ["ArrowDown", "ArrowUp"] satisfies ArrowKey[]) {
  test(`split Open in ignores already-prevented ${key}`, async () => {
    const view = await fixture();
    try {
      view.focus("cursor");
      const event = await view.press(key, true);
      assert.equal(view.active(), "cursor");
      assert.deepEqual(view.focusCalls, []);
      assert.deepEqual(event, { prevented: 0, stopped: 0 });
      assert.equal(view.isOpen(), true);
    } finally { await view.close(); }
  });
}

for (const scenario of [
  { key: "ArrowDown", from: "copy-path", to: "finder" },
  { key: "ArrowUp", from: "finder", to: "copy-path" },
] satisfies { key: ArrowKey; from: string; to: string }[]) {
  test(`split Open in wraps ${scenario.key} and consumes its bubbling event`, async () => {
    const view = await fixture();
    try {
      view.focus(scenario.from);
      const event = await view.press(scenario.key);
      assert.equal(view.active(), scenario.to);
      assert.deepEqual(view.focusCalls, [scenario.to]);
      assert.deepEqual(event, { prevented: 1, stopped: 1 });
      assert.equal(view.isOpen(), true);
    } finally { await view.close(); }
  });
}

for (const key of ["ArrowDown", "ArrowUp"] satisfies ArrowKey[]) {
  test(`split Open in leaves ${key} untouched when focus is outside its rows`, async () => {
    const view = await fixture();
    try {
      view.focus("outside");
      assert.deepEqual(await view.press(key), { prevented: 0, stopped: 0 });
      assert.equal(view.active(), "outside");
      assert.deepEqual(view.focusCalls, []);
      assert.equal(view.isOpen(), true);
    } finally { await view.close(); }
  });
}

test("split Open in leaves unrelated keys untouched", async () => {
  const view = await fixture();
  try {
    view.focus("cursor");
    assert.deepEqual(await view.press("Enter"), { prevented: 0, stopped: 0 });
    assert.equal(view.active(), "cursor");
    assert.deepEqual(view.focusCalls, []);
    assert.equal(view.isOpen(), true);
  } finally { await view.close(); }
});

for (const defaultPrevented of [false, true]) {
  test(`split Open in preserves Escape close and trigger focus with defaultPrevented=${defaultPrevented}`, async () => {
    const view = await fixture();
    try {
      view.focus("cursor");
      assert.deepEqual(await view.press("Escape", defaultPrevented), { prevented: 1, stopped: 0 });
      assert.equal(view.isOpen(), false);
      assert.equal(view.active(), "chevron");
      assert.deepEqual(view.focusCalls, ["chevron"]);
    } finally { await view.close(); }
  });
}
