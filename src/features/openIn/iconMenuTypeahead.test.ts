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
type App = { id: string; name: string; iconType: string; icon: null };
const installed: App[] = [
  { id: "finder", name: "Finder", iconType: "folder", icon: null },
  { id: "cursor", name: "Cursor", iconType: "code", icon: null },
  { id: "coteditor", name: "CotEditor", iconType: "code", icon: null },
  { id: "tower", name: "Tower", iconType: "code", icon: null },
];
type FocusTarget = { id: string; textContent: string; isConnected: boolean; disabled: boolean; hidden: boolean; focus(): void; matches(selector: string): boolean; checkVisibility(): boolean; getAttribute(name: string): string | null; hasAttribute(name: string): boolean };

async function fixture(variant: Variant = "icon", inventory = installed) {
  const calls: string[] = [];
  const document: { activeElement: FocusTarget | null; addEventListener(): void; removeEventListener(): void } = {
    activeElement: null, addEventListener() {}, removeEventListener() {},
  };
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  function setTimeout(callback: () => void, ms = 0) { const id = nextTimer++; timers.set(id, { at: now + ms, callback }); return id; }
  function clearTimeout(id: number) { timers.delete(id); }
  function focusTarget(id: string, textContent: string): FocusTarget {
    const target: FocusTarget = {
      id, textContent, isConnected: true, disabled: false, hidden: false,
      focus() { document.activeElement = target; },
      matches(selector) { return selector === ":disabled" && target.disabled; },
      checkVisibility() { return target.isConnected && !target.hidden; },
      getAttribute(name) { return name === "aria-disabled" && target.disabled ? "true" : null; },
      hasAttribute(name) { return name === "disabled" && target.disabled; },
    };
    return target;
  }
  const rows = [...inventory.map((app) => focusTarget(app.id, app.name)), focusTarget("copy-path", "Copy path")];
  const chevron = focusTarget("chevron", "Open in...");
  const menuNode = {
    querySelector: () => rows[0],
    querySelectorAll: (selector: string) => selector.includes(":not([disabled])") ? rows.filter((row) => !row.disabled) : rows,
    contains: (target: unknown) => target === menuNode || rows.includes(target as FocusTarget),
  };
  const wrapNode = { contains: (target: unknown) => target === chevron || menuNode.contains(target), querySelector: () => chevron };
  function load(file: string, exported: object, imports: Record<string, unknown>) {
    const filename = resolve(process.cwd(), "src/features/openIn", file);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(source, {
      Error, console, document, setTimeout, clearTimeout,
      getComputedStyle: (target: FocusTarget) => ({ display: target.hidden ? "none" : "block", visibility: "visible" }),
      exports: exported,
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        assert.ok(name in imports, `Unexpected Open in dependency: ${name}`);
        return imports[name];
      },
    });
  }
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return inventory;
      calls.push(JSON.stringify({ command, args }));
    },
  };
  const apps: object = {};
  load("apps.ts", apps, { "@tauri-apps/api/core": native });
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
    "../../settings/appPrefs": {
      useAppPrefs: () => ({ default_open_in: "finder", open_in_mru_order: [] }),
      async recordOpenIn(appId: string, isRemote: boolean) { calls.push(JSON.stringify({ command: "record_open_in", args: { appId, isRemote } })); },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  });
  assert.ok(component.OpenInButton);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(component.OpenInButton!, { variant, path: "/Users/demo/project" }), {
      createNodeMock(node: { props: Record<string, unknown> }) {
        if (node.props.role === "menu") return menuNode;
        if (node.props.className === "oi" || node.props.className === "oi oi-icon") return wrapNode;
        return null;
      },
    });
  });
  async function open() { await act(async () => { renderer.root.findByProps({ className: "oi-chevron" }).props.onClick(); }); }
  await open();
  return {
    calls, rows, open,
    active: () => document.activeElement?.id,
    isOpen: () => renderer.root.findAllByProps({ role: "menu" }).length > 0,
    focus(id: string) { const row = rows.find((r) => r.id === id); assert.ok(row); document.activeElement = row; },
    async press(key: string, flags: Record<string, unknown> = {}) {
      const event = {
        key, which: 0, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        currentTarget: menuNode, target: document.activeElement, prevented: 0, stopped: 0,
        preventDefault() { this.defaultPrevented = true; this.prevented += 1; },
        stopPropagation() { this.stopped += 1; }, ...flags,
      };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onKeyDown(event); });
      return { prevented: event.prevented, stopped: event.stopped };
    },
    async blur(inside: boolean) {
      const event = { currentTarget: menuNode, relatedTarget: inside ? rows[1] : null };
      await act(async () => { renderer.root.findByProps({ role: "menu" }).props.onBlur?.(event); });
    },
    async advance(ms: number) {
      now += ms;
      await act(async () => {
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      });
    },
    async click(id: string) { await act(async () => { renderer.root.findByProps({ "data-app": id }).props.onClick(); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
    timerCount: () => timers.size,
  };
}

async function using(run: (view: Awaited<ReturnType<typeof fixture>>) => Promise<void>, variant: Variant = "icon", inventory = installed) {
  const view = await fixture(variant, inventory);
  try { await run(view); } finally { await view.close(); }
}

for (const key of ["c", "C"]) {
  test(`icon ${key} focuses the next case-insensitive prefix without executing an action`, async () => using(async (view) => {
    assert.deepEqual(await view.press(key), { prevented: 1, stopped: 1 });
    assert.equal(view.active(), "cursor"); assert.equal(view.isOpen(), true); assert.deepEqual(view.calls, []);
  }));
}

test("icon builds a multi-character prefix from its original starting row", async () => using(async (view) => {
  await view.press("c"); await view.press("o");
  assert.equal(view.active(), "coteditor"); assert.deepEqual(view.calls, []);
}));

test("icon repeated letters cycle through matching apps and Copy path", async () => using(async (view) => {
  const seen = [];
  for (let i = 0; i < 4; i++) { await view.press("c"); seen.push(view.active()); }
  assert.deepEqual(seen, ["cursor", "coteditor", "copy-path", "cursor"]); assert.deepEqual(view.calls, []);
}));

test("icon typeahead wraps from the final row", async () => using(async (view) => {
  view.focus("copy-path"); await view.press("f"); assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}));

test("icon multi-character Copy path prefix only focuses, without copying", async () => using(async (view) => {
  for (const key of "copy") await view.press(key);
  assert.equal(view.active(), "copy-path"); assert.equal(view.isOpen(), true); assert.deepEqual(view.calls, []);
}));

test("icon keeps a prefix until the 500ms reference timeout", async () => using(async (view) => {
  await view.press("c"); await view.advance(499); await view.press("o"); assert.equal(view.active(), "coteditor");
}));

test("icon resets a prefix at the 500ms reference timeout", async () => using(async (view) => {
  await view.press("c"); await view.advance(500); await view.press("f"); assert.equal(view.active(), "finder");
  await view.advance(500); await view.press("c"); assert.equal(view.active(), "cursor");
}));

test("icon unmatched printable keys are consumed and clear the failed prefix", async () => using(async (view) => {
  view.focus("tower"); assert.deepEqual(await view.press("z"), { prevented: 1, stopped: 1 }); assert.equal(view.active(), "tower");
  await view.press("c"); assert.equal(view.active(), "copy-path"); assert.deepEqual(view.calls, []);
}));

test("icon skips a disabled prefix match", async () => using(async (view) => {
  view.rows[1].disabled = true; await view.press("c"); assert.equal(view.active(), "coteditor"); assert.deepEqual(view.calls, []);
}));

test("icon skips a hidden prefix match", async () => using(async (view) => {
  view.rows[1].hidden = true; await view.press("c"); assert.equal(view.active(), "coteditor"); assert.deepEqual(view.calls, []);
}));

test("icon keeps repeated-letter names searchable instead of unconditionally cycling", async () => using(async (view) => {
  await view.press("b"); await view.press("b"); assert.equal(view.active(), "bbedit"); await view.press("e"); assert.equal(view.active(), "bbedit");
}, "icon", [...installed, { id: "bbedit", name: "BBEdit", iconType: "code", icon: null }]));

test("icon preserves an internal-space prefix and consumes the space", async () => using(async (view) => {
  for (const key of "copy") await view.press(key);
  assert.deepEqual(await view.press(" "), { prevented: 1, stopped: 1 }); await view.press("p");
  assert.equal(view.active(), "copy-path"); assert.deepEqual(view.calls, []);
}));

test("icon leaving the menu clears an existing prefix", async () => using(async (view) => {
  await view.press("c"); await view.blur(false); await view.press("f"); assert.equal(view.active(), "finder");
}));

test("icon moving focus within the menu preserves an existing prefix", async () => using(async (view) => {
  await view.press("c"); await view.blur(true); await view.press("o"); assert.equal(view.active(), "coteditor");
}));

test("icon close and reopen do not carry an old prefix", async () => using(async (view) => {
  await view.press("c"); await view.press("Escape"); await view.open(); await view.press("f");
  assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}));

for (const flag of ["ctrlKey", "metaKey", "altKey"]) {
  test(`icon ${flag} character retains focus and does not consume or execute`, async () => using(async (view) => {
    assert.deepEqual(await view.press("c", { [flag]: true }), { prevented: 0, stopped: 0 });
    assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
  }));
}

test("split menu retains its existing no-typeahead behavior", async () => using(async (view) => {
  assert.deepEqual(await view.press("c"), { prevented: 0, stopped: 0 }); assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}, "split"));

test("icon initial space retains existing button activation semantics", async () => using(async (view) => {
  assert.deepEqual(await view.press(" "), { prevented: 0, stopped: 0 }); assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}));

test("icon already-prevented character preserves existing guard", async () => using(async (view) => {
  assert.deepEqual(await view.press("c", { defaultPrevented: true }), { prevented: 0, stopped: 0 });
  assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}));

test("icon non-character unrelated key does not change focus", async () => using(async (view) => {
  assert.deepEqual(await view.press("F2"), { prevented: 0, stopped: 0 }); assert.equal(view.active(), "finder"); assert.deepEqual(view.calls, []);
}));

test("icon existing arrows, endpoints and Escape retain their behavior", async () => using(async (view) => {
  await view.press("ArrowDown"); assert.equal(view.active(), "cursor");
  await view.press("End"); assert.equal(view.active(), "copy-path");
  await view.press("Home"); assert.equal(view.active(), "finder");
  await view.press("Escape"); assert.equal(view.isOpen(), false); assert.equal(view.active(), "chevron"); assert.deepEqual(view.calls, []);
}));

test("positive app click control observes exact launch and preference write", async () => using(async (view) => {
  await view.click("cursor"); assert.equal(view.isOpen(), false);
  assert.deepEqual(view.calls.map((call) => JSON.parse(call).command), ["record_open_in", "open_in_app"]);
  assert.deepEqual(JSON.parse(view.calls[1]).args, { appId: "cursor", path: "/Users/demo/project" });
}));

test("positive Copy path click control observes clipboard operation", async () => using(async (view) => {
  await view.click("copy-path"); assert.equal(view.isOpen(), false);
  assert.deepEqual(view.calls.map((call) => JSON.parse(call).command), ["plugin:clipboard-manager|write_text"]);
  assert.deepEqual(JSON.parse(view.calls[0]).args, { text: "/Users/demo/project" });
}));

test("closing the component leaves no pending timer", async () => {
  const view = await fixture(); await view.press("c"); await view.close(); assert.equal(view.timerCount(), 0);
});
