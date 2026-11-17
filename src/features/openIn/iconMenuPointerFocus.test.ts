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
const available: OpenInApp[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "cursor", name: "Cursor", iconType: "code", icon: null },
  { id: "claude", name: "Claude", iconType: "code", icon: null },
];
type FocusOptions = { preventScroll?: boolean };
type FocusTarget = { id: string; focus(options?: FocusOptions): void };
type Variant = "icon" | "split";

function load(file: string, exported: object, imports: Record<string, unknown>, document: object, webkit: boolean) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    Error,
    console,
    document,
    CSS: { supports: (query: string) => query === "-webkit-backdrop-filter:none" && webkit },
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Open in component dependency: ${name}`);
      return imports[name];
    },
  });
}

async function fixture(variant: Variant = "icon", webkit = true) {
  const calls: string[] = [];
  const focusCalls: { id: string; options?: FocusOptions }[] = [];
  const document: { activeElement: FocusTarget | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };
  function focusTarget(id: string): FocusTarget {
    const target = { id, focus(options?: FocusOptions) { document.activeElement = target; focusCalls.push({ id, options: options ? { preventScroll: options.preventScroll } : undefined }); } };
    return target;
  }
  const rows = [...available.map((app) => focusTarget(app.id)), focusTarget("copy-path")];
  const chevron = focusTarget("chevron");
  const menuNode = { querySelector: () => rows[0], querySelectorAll: () => rows };
  const wrapNode = { contains: (target: unknown) => target === chevron || rows.some((row) => row === target), querySelector: () => chevron };
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return available;
      calls.push(JSON.stringify({ command, args }));
    },
  };
  const apps: Partial<typeof import("./apps.ts")> = {};
  load("./apps.ts", apps, { "@tauri-apps/api/core": native }, document, webkit);
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
      async recordOpenIn(appId: string, isRemote: boolean) {
        calls.push(JSON.stringify({ command: "record_open_in", args: { appId, isRemote } }));
      },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  }, document, webkit);
  const OpenInButton = component.OpenInButton;
  assert.ok(OpenInButton);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(OpenInButton, { variant, path: "/Users/demo/project" }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        if (node.props.role === "menu") return menuNode;
        if (node.props.className === "oi" || node.props.className === "oi oi-icon") return wrapNode;
        return null;
      },
    });
  });
  await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); });
  assert.equal(document.activeElement?.id, "finder");
  focusCalls.length = 0;
  return {
    calls,
    focusCalls,
    active: () => document.activeElement?.id,
    isOpen: () => renderer.root.findAllByProps({ role: "menu" }).length > 0,
    focus(id: string) {
      const row = rows.find((item) => item.id === id);
      assert.ok(row);
      row.focus();
      focusCalls.length = 0;
    },
    async move(id: string, movementX = 1, movementY = 0) {
      const row = rows.find((item) => item.id === id);
      assert.ok(row);
      const event = {
        currentTarget: row, movementX, movementY, prevented: 0, stopped: 0,
        preventDefault() { this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ "data-app": id }).props.onMouseMove?.(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async press(key: string) {
      const event = {
        key, which: 0, defaultPrevented: false, prevented: 0, stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async click(id: string) {
      await act(async () => { renderer.root.findByProps({ "data-app": id }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const untouched = { prevented: 0, stopped: 0 };
const consumed = { prevented: 1, stopped: 1 };

test("WebKit horizontal mouse movement focuses Cursor without scrolling or consumption", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.move("cursor", 1, 0), untouched);
    assert.equal(view.active(), "cursor");
    assert.deepEqual(view.focusCalls, [{ id: "cursor", options: { preventScroll: true } }]);
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("WebKit vertical mouse movement focuses Cursor without side effects", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.move("cursor", 0, -1), untouched);
    assert.equal(view.active(), "cursor");
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Copy path participates in mouse movement focus", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.move("copy-path"), untouched);
    assert.equal(view.active(), "copy-path");
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("ArrowDown continues after the moved-to row", async () => {
  const view = await fixture();
  try {
    await view.move("cursor");
    assert.deepEqual(await view.press("ArrowDown"), consumed);
    assert.equal(view.active(), "claude");
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("ArrowUp continues before the moved-to row", async () => {
  const view = await fixture();
  try {
    await view.move("cursor");
    assert.deepEqual(await view.press("ArrowUp"), consumed);
    assert.equal(view.active(), "finder");
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Non-WebKit zero movement is not filtered", async () => {
  const view = await fixture("icon", false);
  try {
    assert.deepEqual(await view.move("cursor", 0, 0), untouched);
    assert.equal(view.active(), "cursor");
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("WebKit zero movement preserves keyboard focus and event propagation", async () => {
  const view = await fixture();
  try {
    view.focus("claude");
    assert.deepEqual(await view.move("cursor", 0, 0), untouched);
    assert.equal(view.active(), "claude");
    assert.deepEqual(view.focusCalls, []);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Split rows retain existing mouse-movement behavior", async () => {
  const view = await fixture("split");
  try {
    assert.deepEqual(await view.move("cursor"), untouched);
    assert.equal(view.active(), "finder");
    assert.deepEqual(view.focusCalls, []);
    assert.equal(view.isOpen(), true);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Movement within the focused row does not repeat focus", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.move("finder"), untouched);
    assert.equal(view.active(), "finder");
    assert.deepEqual(view.focusCalls, []);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Original Home and End endpoints remain available", async () => {
  const view = await fixture();
  try {
    await view.move("cursor");
    assert.deepEqual(await view.press("Home"), consumed);
    assert.equal(view.active(), "finder");
    assert.deepEqual(await view.press("End"), consumed);
    assert.equal(view.active(), "copy-path");
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("Mouse movement never launches; app click retains exact preference and native calls", async () => {
  const view = await fixture();
  try {
    await view.move("cursor");
    assert.deepEqual(view.calls, []);
    await view.click("cursor");
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.calls, [
      JSON.stringify({ command: "record_open_in", args: { appId: "cursor", isRemote: false } }),
      JSON.stringify({ command: "open_in_app", args: { appId: "cursor", path: "/Users/demo/project" } }),
    ]);
  } finally { await view.close(); }
});

test("Mouse movement never copies; Copy path click retains exact native call", async () => {
  const view = await fixture();
  try {
    await view.move("copy-path");
    assert.deepEqual(view.calls, []);
    await view.click("copy-path");
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.calls, [
      JSON.stringify({ command: "plugin:clipboard-manager|write_text", args: { text: "/Users/demo/project" } }),
    ]);
  } finally { await view.close(); }
});
