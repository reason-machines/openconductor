import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import * as hints from "../state/shortcutHint.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const control: Overrides = { "workspace.switchTo1": [{ key: { kind: "logical", value: "1" }, modifiers: ["ctrl"] }] };
const multiple: Overrides = { "workspace.switchTo1": [
  ...control["workspace.switchTo1"],
  { key: { kind: "physical", code: "Digit1", display: "1" }, modifiers: ["alt", "shift"] },
] };
const bare: Overrides = { "workspace.switchTo1": [{ key: { kind: "logical", value: "1" } }] };

type Flags = hints.ModifierState;
const noModifiers: Flags = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

class ListenerTarget extends EventTarget {
  querySelectorAll() { return []; }
  querySelector() { return null; }
  emit(type: string, modifiers: Partial<Flags> = {}) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      ...noModifiers, ...modifiers, key: "Control", code: "ControlLeft", repeat: false,
    }).map(([key, value]) => [key, { value }])));
    this.dispatchEvent(event);
  }
}

class Clock {
  now = 0;
  next = 0;
  pending = new Map<number, { due: number; run: () => void }>();
  setTimeout = (run: () => void, delay: number) => {
    const id = ++this.next;
    this.pending.set(id, { due: this.now + delay, run });
    return id;
  };
  clearTimeout = (id: number) => { this.pending.delete(id); };
  advance(milliseconds: number) {
    this.now += milliseconds;
    for (const [id, timer] of this.pending) {
      if (timer.due > this.now) continue;
      this.pending.delete(id);
      timer.run();
    }
  }
}

function compile(path: string, require: (name: string) => unknown, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, { exports: {}, require, ...globals });
}

async function fixture(t: TestContext, initial: Overrides = {}) {
  const window = new ListenerTarget();
  const document = new ListenerTarget();
  const clock = new Clock();
  const providerPath = "../keybindings/KeybindingsProvider.tsx";
  const provider: Pick<typeof import("../keybindings/KeybindingsProvider"), "KeybindingsProvider" | "useKeybindingOverrides"> = compile(
    providerPath, createRequire(new URL(providerPath, import.meta.url)), { window, document },
  );
  const imports: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": dependencies("react/jsx-runtime"),
    "../keybindings/registry": { COMMANDS },
    "../keybindings/overrides": { effectiveShortcuts },
    "../keybindings/KeybindingsProvider": provider,
    "../state/shortcutHint": hints,
  };
  const hook: Pick<typeof import("./SidebarWorkspaceRow"), "useShortcutHints"> = compile("./SidebarWorkspaceRow.tsx", (name) => imports[name] ?? {}, {
    window, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  });
  let update: ReturnType<typeof provider.useKeybindingOverrides>["setOverrides"] | undefined;
  function Probe() {
    update = provider.useKeybindingOverrides().setOverrides;
    return React.createElement("output", { "data-visible": hook.useShortcutHints() });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(provider.KeybindingsProvider, { children: React.createElement(Probe) }));
  });
  t.after(async () => {
    await act(async () => { renderer.unmount(); });
    assert.equal(clock.pending.size, 0, "unmount cancels pending hint timers");
  });
  async function setOverrides(overrides: Overrides) {
    await act(async () => {
      assert.ok(update, "the real provider exposes its live setter");
      update(overrides);
    });
  }
  await setOverrides(initial);
  return {
    visible: () => renderer.root.findByType("output").props["data-visible"],
    async emit(type: string, flags: Partial<Flags> = {}) {
      await act(async () => { window.emit(type, flags); });
    },
    async advance(milliseconds: number) {
      await act(async () => { clock.advance(milliseconds); });
    },
    setOverrides,
  };
}

test("Sidebar number hints: default modifier waits 500ms and hides on release", async (t) => {
  const f = await fixture(t);
  await f.emit("keydown", { metaKey: true });
  await f.advance(499);
  assert.equal(f.visible(), false);
  await f.advance(1);
  assert.equal(f.visible(), true);
  await f.emit("keyup");
  assert.equal(f.visible(), false);
});

test("Sidebar number hints: saved primary Control modifier reveals hints", async (t) => {
  const f = await fixture(t, control);
  await f.emit("keydown", { ctrlKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
});

test("Sidebar number hints: a saved replacement no longer accepts default Command", async (t) => {
  const f = await fixture(t, control);
  await f.emit("keydown", { metaKey: true });
  await f.advance(500);
  assert.equal(f.visible(), false);
});

test("Sidebar number hints: an additional physical shortcut can reveal hints", async (t) => {
  const f = await fixture(t, multiple);
  await f.emit("keydown", { altKey: true, shiftKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
});

test("Sidebar number hints: extra held modifiers do not hide an eligible chord", async (t) => {
  const f = await fixture(t);
  await f.emit("keydown", { metaKey: true, shiftKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
});

test("Sidebar number hints: shortcuts with no modifiers never reveal hints", async (t) => {
  const f = await fixture(t, bare);
  await f.emit("keydown", { metaKey: true });
  await f.advance(500);
  assert.equal(f.visible(), false);
  await f.emit("keydown");
  await f.advance(500);
  assert.equal(f.visible(), false);
});

test("Sidebar number hints: provider updates and reset affect the next event without remounting", async (t) => {
  const f = await fixture(t);
  await f.setOverrides(control);
  await f.emit("keydown", { ctrlKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
  await f.emit("keyup");
  await f.setOverrides({});
  await f.emit("keydown", { metaKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
});

test("Sidebar number hints: pointer release cancels a pending default hint", async (t) => {
  const f = await fixture(t);
  await f.emit("keydown", { metaKey: true });
  await f.advance(499);
  await f.emit("mousemove");
  await f.advance(1);
  assert.equal(f.visible(), false);
});

test("Sidebar number hints: focus loss hides a visible default hint", async (t) => {
  const f = await fixture(t);
  await f.emit("keydown", { metaKey: true });
  await f.advance(500);
  assert.equal(f.visible(), true);
  await f.emit("blur");
  assert.equal(f.visible(), false);
});
