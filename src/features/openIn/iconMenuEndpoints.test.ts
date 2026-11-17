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
type Variant = "icon" | "split";
type FocusTarget = { id: string; focus(): void };

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

async function fixture(variant: Variant) {
  const calls: string[] = [];
  const document: { activeElement: FocusTarget | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };
  function focusTarget(id: string): FocusTarget {
    const target = { id, focus() { document.activeElement = target; } };
    return target;
  }
  const rows = [focusTarget("finder"), focusTarget("cursor"), focusTarget("copy-path")];
  const chevron = focusTarget("chevron");
  const menuNode = { querySelector: () => rows[0], querySelectorAll: () => rows };
  const wrapNode = { contains: () => true, querySelector: () => chevron };
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
      async recordOpenIn(appId: string, isRemote: boolean) {
        calls.push(JSON.stringify({ command: "record_open_in", args: { appId, isRemote } }));
      },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  }, document);
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
  async function open() {
    await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); });
    assert.equal(document.activeElement?.id, "finder");
  }
  await open();
  return {
    calls,
    open,
    focus(id: string) {
      const target = rows.find((row) => row.id === id);
      assert.ok(target);
      document.activeElement = target;
    },
    active: () => document.activeElement?.id,
    isOpen: () => renderer.root.findAllByProps({ role: "menu" }).length > 0,
    async press(key: string, defaultPrevented = false, which = 0) {
      const event = {
        key, which, defaultPrevented, currentTarget: menuNode, prevented: 0, stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async click(appId: string) {
      await act(async () => { renderer.root.findByProps({ "data-app": appId }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const endpoints = [{ key: "Home", target: "finder" }, { key: "End", target: "copy-path" }];
for (const { key, target } of endpoints) {
  test(`icon ${key} focuses ${target} without opening an app or closing the menu`, async () => {
    const view = await fixture("icon");
    try {
      view.focus("cursor");
      const event = await view.press(key);
      assert.equal(view.active(), target);
      assert.deepEqual(event, { prevented: 1, stopped: 1 });
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });

  test(`icon ${key} at ${target} still consumes the endpoint key`, async () => {
    const view = await fixture("icon");
    try {
      view.focus(target);
      assert.deepEqual(await view.press(key), { prevented: 1, stopped: 1 });
      assert.equal(view.active(), target);
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });

  test(`split ${key} retains its non-navigation behavior`, async () => {
    const view = await fixture("split");
    try {
      view.focus("cursor");
      assert.deepEqual(await view.press(key), { prevented: 0, stopped: 0 });
      assert.equal(view.active(), "cursor");
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });

  test(`icon ignores already-prevented ${key}`, async () => {
    const view = await fixture("icon");
    try {
      view.focus("cursor");
      assert.deepEqual(await view.press(key, true), { prevented: 0, stopped: 0 });
      assert.equal(view.active(), "cursor");
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });

  test(`icon ignores ${key} during legacy IME code 229`, async () => {
    const view = await fixture("icon");
    try {
      view.focus("cursor");
      assert.deepEqual(await view.press(key, false, 229), { prevented: 0, stopped: 0 });
      assert.equal(view.active(), "cursor");
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

for (const { key, from, target } of [
  { key: "ArrowDown", from: "copy-path", target: "finder" },
  { key: "ArrowUp", from: "finder", target: "copy-path" },
]) {
  test(`icon ${key} keeps wrapped row navigation`, async () => {
    const view = await fixture("icon");
    try {
      view.focus(from);
      assert.deepEqual(await view.press(key), { prevented: 1, stopped: 1 });
      assert.equal(view.active(), target);
      assert.equal(view.isOpen(), true);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

test("icon Escape keeps close and trigger focus behavior", async () => {
  const view = await fixture("icon");
  try {
    view.focus("cursor");
    assert.deepEqual(await view.press("Escape"), { prevented: 1, stopped: 0 });
    assert.equal(view.active(), "chevron");
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("icon app and Copy path clicks still reach their exact side-effect boundary", async () => {
  const view = await fixture("icon");
  try {
    await view.click("cursor");
    assert.equal(view.isOpen(), false);
    await view.open();
    await view.click("copy-path");
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.calls, [
      JSON.stringify({ command: "record_open_in", args: { appId: "cursor", isRemote: false } }),
      JSON.stringify({ command: "open_in_app", args: { appId: "cursor", path: "/Users/demo/project" } }),
      JSON.stringify({ command: "plugin:clipboard-manager|write_text", args: { text: "/Users/demo/project" } }),
    ]);
  } finally { await view.close(); }
});
