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
  { id: "terminal", name: "Terminal", iconType: "terminal", icon: null },
];
const paths = ["/Users/demo/code/tide-web", "/Users/demo/.openconductor/workspaces/tide-web"];
type Handler = (() => void) | undefined;

function load(file: string, exported: object, imports: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    Error,
    console,
    document: { addEventListener() {}, removeEventListener() {} },
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Open in component dependency: ${name}`);
      return imports[name];
    },
  });
}

async function fixture(variant: "icon" | "split", path: string, catalog = installed) {
  const calls: string[] = [];
  let bindings: Record<string, Handler> = {};
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return catalog;
      calls.push(JSON.stringify({ command, args }));
    },
  };
  const apps: Partial<typeof import("./apps.ts")> = {};
  load("./apps.ts", apps, { "@tauri-apps/api/core": native });
  const component: Partial<typeof import("./OpenInButton.tsx")> = {};
  const inert = () => null;
  load("./OpenInButton.tsx", component, {
    "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children, ShortcutHint: inert },
    "../../components/motion/usePresence.ts": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "../../keybindings/dispatcher.ts": { PRIORITY: { DIALOG: 100 } },
    "../../keybindings/KeybindingsProvider": {
      useKeybindingOverrides: () => ({ overrides: {} }),
      useKeybindings(next: Record<string, Handler>) { bindings = { ...bindings, ...next }; },
    },
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [{}] },
    "../../keybindings/shortcut.ts": { glyphs: () => "⌘O" },
    "../../components/Icons": { ChevronDownIcon: inert, CodeIcon: inert, CopyIcon: inert, FolderIcon: inert, TerminalIcon: inert },
    "../../settings/appPrefs": {
      useAppPrefs: () => ({ default_open_in: "cursor", open_in_mru_order: [] }),
      async recordOpenIn(appId: string, isRemote: boolean) {
        calls.push(JSON.stringify({ command: "record_open_in", args: { appId, isRemote } }));
      },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  });
  const OpenInButton = component.OpenInButton;
  assert.ok(OpenInButton);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(OpenInButton, { variant, path })); });
  return {
    calls,
    async open() {
      await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); });
    },
    numbers() {
      return renderer.root.findAllByProps({ className: "oi-row-num" }).map((node: { props: { children: React.ReactNode } }) => node.props.children);
    },
    hints() {
      return renderer.root.findAllByProps({ className: "oi-row-kbd" }).map((node: { props: { children: React.ReactNode } }) => node.props.children);
    },
    registeredDigits() {
      return Array.from({ length: 9 }, (_, i) => `menu.selectItem${i + 1}`).filter((id) => typeof bindings[id] === "function");
    },
    async selectDigit(digit: number) {
      const handler = bindings[`menu.selectItem${digit}`];
      assert.equal(typeof handler, "function", `Digit ${digit} must have a registered handler`);
      await act(async () => { handler?.(); });
    },
    async click(appId: string) {
      await act(async () => { renderer.root.findByProps({ "data-app": appId }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

function call(command: string, args: object) {
  return JSON.stringify({ command, args });
}

for (const path of paths) {
  test(`icon Open in has no numbered app or copy badges at ${path}`, async () => {
    const view = await fixture("icon", path);
    try {
      await view.open();
      assert.deepEqual(view.numbers(), []);
    } finally { await view.close(); }
  });

  test(`icon Open in registers no numbered selection handlers at ${path}`, async () => {
    const view = await fixture("icon", path);
    try {
      await view.open();
      assert.deepEqual(view.registeredDigits(), []);
      assert.deepEqual(view.calls, []);
    } finally { await view.close(); }
  });

  test(`icon pointer launch and copy preserve the exact Settings path ${path}`, async () => {
    const view = await fixture("icon", path);
    try {
      await view.open();
      await view.click("cursor");
      await view.open();
      await view.click("copy-path");
      assert.deepEqual(view.calls, [
        call("record_open_in", { appId: "cursor", isRemote: false }),
        call("open_in_app", { appId: "cursor", path }),
        call("plugin:clipboard-manager|write_text", { text: path }),
      ]);
    } finally { await view.close(); }
  });
}

test("split Open in keeps numbered app and Copy path badges", async () => {
  const view = await fixture("split", paths[0]);
  try {
    await view.open();
    assert.deepEqual(view.numbers(), [1, 2, 3, 4]);
  } finally { await view.close(); }
});

test("split digits still record and launch an app, then copy its workspace path", async () => {
  const path = paths[0];
  const view = await fixture("split", path);
  try {
    assert.deepEqual(view.registeredDigits(), []);
    await view.open();
    await view.selectDigit(2);
    assert.deepEqual(view.registeredDigits(), []);
    await view.open();
    await view.selectDigit(4);
    assert.deepEqual(view.calls, [
      call("record_open_in", { appId: "cursor", isRemote: false }),
      call("open_in_app", { appId: "cursor", path }),
      call("plugin:clipboard-manager|write_text", { text: path }),
    ]);
    assert.deepEqual(view.registeredDigits(), []);
  } finally { await view.close(); }
});

for (const variant of ["icon", "split"] satisfies ("icon" | "split")[]) {
  test(`${variant} Open in preserves the default-app shortcut hint`, async () => {
    const view = await fixture(variant, paths[0]);
    try {
      await view.open();
      assert.deepEqual(view.hints(), ["⌘O"]);
    } finally { await view.close(); }
  });
}

test("split Open in retains its nine-row numbering limit", async () => {
  const catalog = Array.from({ length: 10 }, (_, i) => ({ ...installed[1], id: `editor-${i}`, name: `Editor ${i}` }));
  const view = await fixture("split", paths[0], catalog);
  try {
    await view.open();
    assert.deepEqual(view.numbers(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(view.registeredDigits().length, 9);
    await view.selectDigit(9);
    assert.deepEqual(view.calls, [
      call("record_open_in", { appId: "editor-8", isRemote: false }),
      call("open_in_app", { appId: "editor-8", path: paths[0] }),
    ]);
  } finally { await view.close(); }
});
