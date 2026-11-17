// Conductor Rebuild: qualification only. Actual production component, synthetic DOM/IPC.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Variant = "icon" | "split";
type Node = { id: string; textContent: string; focus(): void };
async function fixture(variant: Variant = "icon") {
  const calls: unknown[] = [];
  const document: { activeElement: Node | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null, addEventListener() {}, removeEventListener() {},
  };
  const node = (id: string, textContent: string): Node => {
    const value = { id, textContent, focus() { document.activeElement = value; } };
    return value;
  };
  const rows = [node("finder", "Finder"), node("cursor", "Cursor"), node("copy-path", "Copy path")];
  const trigger = node("chevron", "Open in...");
  const menu = {
    querySelector: () => rows[0], querySelectorAll: () => rows,
    contains: (target: unknown) => target === menu || rows.includes(target as Node),
  };
  const wrap = { contains: (target: unknown) => target === trigger || menu.contains(target), querySelector: () => trigger };
  function load(file: string, exported: object, imports: Record<string, unknown>) {
    const filename = resolve(process.cwd(), "src/features/openIn", file);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(source, {
      Error, console, document, setTimeout, clearTimeout, exports: exported,
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        assert.ok(name in imports, `Unexpected dependency: ${name}`);
        return imports[name];
      },
    });
  }
  const apps: object = {};
  load("apps.ts", apps, { "@tauri-apps/api/core": {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return [
        { id: "finder", name: "Finder", iconType: "folder", icon: null },
        { id: "cursor", name: "Cursor", iconType: "code", icon: null },
      ];
      calls.push(JSON.stringify({ command, args }));
    },
  } });
  const component: { OpenInButton?: React.ComponentType<{ variant: Variant; path: string }> } = {};
  const inert = () => null;
  load("OpenInButton.tsx", component, {
    "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children, ShortcutHint: inert },
    "../../components/motion/usePresence.ts": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "../../keybindings/dispatcher.ts": { PRIORITY: { DIALOG: 100 } },
    "../../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }), useKeybindings() {} },
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [] },
    "../../keybindings/shortcut.ts": { glyphs: () => "" },
    "../../components/Icons": { ChevronDownIcon: inert, CodeIcon: inert, CopyIcon: inert, FolderIcon: inert, TerminalIcon: inert },
    "../../settings/appPrefs": { useAppPrefs: () => ({ default_open_in: "finder", open_in_mru_order: [] }), recordOpenIn: async (...args: unknown[]) => { calls.push(args); } },
    "./apps": apps, "./AppSwitcher.tsx": { AppSwitcher: inert }, "./openIn.css": {},
  });
  assert.ok(component.OpenInButton);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(component.OpenInButton!, { variant, path: "/Users/demo/project" }), {
      createNodeMock(element: { props: Record<string, unknown> }) {
        if (element.props.role === "menu") return menu;
        if (element.props.className === "oi" || element.props.className === "oi oi-icon") return wrap;
        return null;
      },
    });
  });
  async function toggle() { await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); }); }
  await toggle();
  return {
    calls, rows, menu, toggle,
    isOpen: () => renderer.root.findByProps({ className: "oi-chevron" }).props["aria-expanded"],
    active: () => document.activeElement?.id,
    focus(index: number) { rows[index].focus(); },
    async press(key: string, flags: Record<string, unknown> = {}) {
      const event = {
        key, which: 0, defaultPrevented: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
        currentTarget: menu, target: document.activeElement,
        nativeEvent: { target: document.activeElement, composedPath: () => [document.activeElement, menu, wrap] },
        prevented: 0, stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented++; },
        stopPropagation() { this.stopped++; }, ...flags,
      };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async click(id: string) { await act(async () => { renderer.root.findByProps({ "data-app": id }).props.onClick(); }); },
    async dispose() { await act(async () => renderer.unmount()); },
  };
}
async function using(run: (view: Awaited<ReturnType<typeof fixture>>) => Promise<void>, variant: Variant = "icon") {
  const view = await fixture(variant);
  try { await run(view); } finally { await view.dispose(); }
}

for (const [index, name] of ["first app", "middle app", "Copy path"].entries()) {
  test(`icon Shift+Tab from ${name} dismisses and returns focus without executing`, async () => using(async (view) => {
    view.focus(index);
    const event = await view.press("Tab", { shiftKey: true });
    assert.equal(view.isOpen(), false);
    assert.equal(view.active(), "chevron");
    assert.deepEqual(event, { prevented: 1, stopped: 1 });
    assert.deepEqual(view.calls, []);
  }));
}
test("icon Shift+Tab consumes both default action and propagation", async () => using(async (view) => {
  assert.deepEqual(await view.press("Tab", { shiftKey: true }), { prevented: 1, stopped: 1 });
  assert.deepEqual(view.calls, []);
}));
test("icon Shift+Tab with legacy IME code is handled before list-navigation guard", async () => using(async (view) => {
  await view.press("Tab", { shiftKey: true, which: 229 });
  assert.equal(view.isOpen(), false); assert.equal(view.active(), "chevron");
}));
test("icon Shift+Tab accepts ordinary native target without composedPath", async () => using(async (view) => {
  await view.press("Tab", { shiftKey: true, nativeEvent: { target: view.rows[0] } });
  assert.equal(view.isOpen(), false); assert.equal(view.active(), "chevron");
}));
test("icon Shift+Tab keeps the menu reusable on reopen", async () => using(async (view) => {
  await view.press("Tab", { shiftKey: true });
  assert.equal(view.isOpen(), false);
  await view.toggle(); assert.equal(view.isOpen(), true); assert.equal(view.active(), "finder");
}));
for (const variant of ["icon", "split"] as const) {
  test(`${variant} forward Tab retains existing default policy`, async () => using(async (view) => {
    assert.deepEqual(await view.press("Tab"), { prevented: 0, stopped: 0 });
    assert.equal(view.isOpen(), true); assert.deepEqual(view.calls, []);
  }, variant));
}
test("split Shift+Tab is not given the icon dropdown contract", async () => using(async (view) => {
  assert.deepEqual(await view.press("Tab", { shiftKey: true }), { prevented: 0, stopped: 0 });
  assert.equal(view.isOpen(), true); assert.equal(view.active(), "finder");
}, "split"));
test("already-prevented Shift+Tab retains the local handler policy", async () => using(async (view) => {
  assert.deepEqual(await view.press("Tab", { shiftKey: true, defaultPrevented: true }), { prevented: 0, stopped: 0 });
  assert.equal(view.isOpen(), true);
}));
test("ordinary Escape still dismisses and focuses the trigger", async () => using(async (view) => {
  await view.press("Escape"); assert.equal(view.isOpen(), false); assert.equal(view.active(), "chevron");
}));
test("icon arrows still move and wrap", async () => using(async (view) => {
  await view.press("ArrowDown"); assert.equal(view.active(), "cursor");
  await view.press("End"); assert.equal(view.active(), "copy-path");
  await view.press("ArrowDown"); assert.equal(view.active(), "finder");
}));
test("icon Shift+Tab from the menu container dismisses without an action", async () => using(async (view) => {
  await view.press("Tab", { shiftKey: true, target: view.menu, nativeEvent: { target: view.menu } });
  assert.equal(view.isOpen(), false); assert.equal(view.active(), "chevron"); assert.deepEqual(view.calls, []);
}));
for (const composedPath of [false, true]) {
  test(`icon foreign Shift+Tab is ignored with composedPath=${composedPath}`, async () => using(async (view) => {
    const outside = { id: "foreign-node" };
    const nativeEvent = composedPath ? { target: outside, composedPath: () => [outside] } : { target: outside };
    assert.deepEqual(await view.press("Tab", { shiftKey: true, target: outside, nativeEvent }), { prevented: 0, stopped: 0 });
    assert.equal(view.isOpen(), true); assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
  }));
}
test("positive copy click control records the real adapter boundary", async () => using(async (view) => {
  await view.click("copy-path");
  assert.equal(view.isOpen(), false);
  assert.deepEqual(view.calls, [JSON.stringify({ command: "plugin:clipboard-manager|write_text", args: { text: "/Users/demo/project" } })]);
}));
