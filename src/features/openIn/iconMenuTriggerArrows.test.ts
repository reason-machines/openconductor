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
type FocusTarget = { id: string; disabled: boolean; focus(): void };
type Options = { variant?: "icon" | "split"; path?: string | null; apps?: OpenInApp[]; disabled?: string[] };

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

async function fixture({ variant = "icon", path = "/Users/demo/project", apps: available = installed, disabled = [] }: Options = {}) {
  const calls: string[] = [];
  const document: { activeElement: FocusTarget | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  };
  function focusTarget(id: string): FocusTarget {
    const target = { id, disabled: disabled.includes(id), focus() { document.activeElement = target; } };
    return target;
  }
  const rows = [...available.map((app) => focusTarget(app.id)), focusTarget("copy-path")];
  const chevron = focusTarget("chevron");
  const menuNode = {
    querySelector: () => rows[0],
    querySelectorAll: () => rows.filter((row) => !row.disabled),
  };
  const wrapNode = { contains: () => true, querySelector: () => chevron };
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return available;
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
    renderer = create(React.createElement(OpenInButton, { variant, path }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        if (node.props.role === "menu") return menuNode;
        if (node.props.className === "oi" || node.props.className === "oi oi-icon") return wrapNode;
        return null;
      },
    });
  });
  chevron.focus();
  return {
    calls,
    active: () => document.activeElement?.id,
    isOpen: () => renderer.root.findAllByProps({ role: "menu" }).length > 0,
    isDisabled: () => renderer.root.findByProps({ className: "oi-chevron" }).props.disabled,
    async press(key: string, defaultPrevented = false) {
      const event = {
        key, which: 0, defaultPrevented, currentTarget: chevron, prevented: 0, stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; },
      };
      await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onKeyDown?.(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async toggle() {
      await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); });
    },
    async escape() {
      await act(async () => {
        renderer.root.findByProps({ role: "menu" }).props.onKeyDown({ key: "Escape", preventDefault() {} });
      });
    },
    async click(appId: string) {
      await act(async () => { renderer.root.findByProps({ "data-app": appId }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const { key, target, disabled } of [
  { key: "ArrowDown", target: "finder", disabled: [] },
  { key: "ArrowUp", target: "copy-path", disabled: [] },
  { key: "ArrowDown", target: "cursor", disabled: ["finder"] },
  { key: "ArrowUp", target: "cursor", disabled: ["copy-path"] },
]) {
  test(`closed icon ${key} focuses ${target} with disabled rows ${disabled.join(",")}`, async () => {
    const view = await fixture({ disabled });
    try {
      const event = await view.press(key);
      assert.equal(view.isOpen(), true);
      assert.equal(view.active(), target);
      assert.deepEqual(event, { prevented: 1, stopped: 1 });
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

test("ArrowUp initial last-row focus does not leak into subsequent pointer opening", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.press("ArrowUp"), { prevented: 1, stopped: 1 });
    assert.equal(view.active(), "copy-path");
    await view.escape();
    assert.equal(view.isOpen(), false);
    assert.equal(view.active(), "chevron");
    await view.toggle();
    assert.equal(view.isOpen(), true);
    assert.equal(view.active(), "finder");
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("ArrowDown opening and Escape compose with ArrowUp reopening", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(await view.press("ArrowDown"), { prevented: 1, stopped: 1 });
    assert.equal(view.active(), "finder");
    await view.escape();
    assert.equal(view.isOpen(), false);
    assert.deepEqual(await view.press("ArrowUp"), { prevented: 1, stopped: 1 });
    assert.equal(view.isOpen(), true);
    assert.equal(view.active(), "copy-path");
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

for (const key of ["ArrowDown", "ArrowUp"]) {
  test(`split ${key} trigger remains unchanged`, async () => {
    const view = await fixture({ variant: "split" });
    try {
      assert.deepEqual(await view.press(key), { prevented: 0, stopped: 0 });
      assert.equal(view.isOpen(), false);
      assert.equal(view.active(), "chevron");
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

for (const key of ["ArrowDown", "ArrowUp"]) {
  test(`already-prevented icon ${key} leaves menu closed`, async () => {
    const view = await fixture();
    try {
      assert.deepEqual(await view.press(key, true), { prevented: 0, stopped: 0 });
      assert.equal(view.isOpen(), false);
      assert.equal(view.active(), "chevron");
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

for (const options of [{ path: null }, { apps: [] }]) {
  test(`disabled icon trigger leaves menu closed for ${"path" in options ? "missing path" : "no installed apps"}`, async () => {
    const view = await fixture(options);
    try {
      assert.equal(view.isDisabled(), true);
      for (const key of ["ArrowDown", "ArrowUp"]) {
        assert.deepEqual(await view.press(key), { prevented: 0, stopped: 0 });
        assert.equal(view.isOpen(), false);
      }
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });
}

test("unrelated icon trigger keys remain unconsumed and keep menu closed", async () => {
  const view = await fixture();
  try {
    for (const key of ["Home", "End", "ArrowLeft", "ArrowRight", "Tab", "Escape", "Enter", " "]) {
      assert.deepEqual(await view.press(key), { prevented: 0, stopped: 0 });
      assert.equal(view.isOpen(), false);
    }
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("ordinary icon pointer opening still focuses first row", async () => {
  const view = await fixture();
  try {
    await view.toggle();
    assert.equal(view.isOpen(), true);
    assert.equal(view.active(), "finder");
    assert.deepEqual(view.calls, []);
  } finally { await view.close(); }
});

test("icon app and Copy path clicks retain exact external side effects", async () => {
  const view = await fixture();
  try {
    await view.toggle();
    await view.click("cursor");
    assert.equal(view.isOpen(), false);
    await view.toggle();
    await view.click("copy-path");
    assert.equal(view.isOpen(), false);
    assert.deepEqual(view.calls, [
      JSON.stringify({ command: "record_open_in", args: { appId: "cursor", isRemote: false } }),
      JSON.stringify({ command: "open_in_app", args: { appId: "cursor", path: "/Users/demo/project" } }),
      JSON.stringify({ command: "plugin:clipboard-manager|write_text", args: { text: "/Users/demo/project" } }),
    ]);
  } finally { await view.close(); }
});
