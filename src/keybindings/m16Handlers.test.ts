// M16: openDebugTools and workspace.toggleCreateFrom keybinding handler tests.
// Verifies dispatch rules against the registry (isGlobal, allowWhileTyping),
// shortcut-override propagation, and disabled-handler behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bindCommands } from "./bind.ts";
import { createDispatcher, type DispatchEvent, type FocusContext } from "./dispatcher.ts";
import { logical } from "./types.ts";

const idle: FocusContext = { activeDialogId: null, typing: false, inTerminal: false };
const inDialog: FocusContext = { activeDialogId: "command-palette-dialog", typing: false, inTerminal: false };
const typing: FocusContext = { activeDialogId: null, typing: true, inTerminal: false };

/** Build a KeyboardEvent-like object; code defaults to "" (logical key). */
const ev = (key: string, mods: Partial<DispatchEvent> = {}, code = ""): DispatchEvent => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});

// ── openDebugTools ────────────────────────────────────────────────────────────

test("openDebugTools fires on physical ⌘⌥I (code=KeyI)", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { openDebugTools: () => void ran++ });
  assert.equal(d.dispatch(ev("I", { metaKey: true, altKey: true }, "KeyI"), idle).kind, "ran");
  assert.equal(ran, 1);
});

test("openDebugTools fires even with a dialog open (isGlobal:true)", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { openDebugTools: () => void ran++ });
  assert.equal(d.dispatch(ev("I", { metaKey: true, altKey: true }, "KeyI"), inDialog).kind, "ran");
  assert.equal(ran, 1);
});

test("openDebugTools does not fire without the alt modifier", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { openDebugTools: () => void ran++ });
  assert.equal(d.dispatch(ev("I", { metaKey: true }, "KeyI"), idle).kind, "pass");
  assert.equal(ran, 0);
});

test("openDebugTools shortcut override replaces ⌘⌥I", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(
    d,
    { openDebugTools: () => void ran++ },
    { overrides: { openDebugTools: [logical("d", ["meta", "alt"])] } },
  );
  // Original physical shortcut no longer fires.
  assert.equal(d.dispatch(ev("I", { metaKey: true, altKey: true }, "KeyI"), idle).kind, "pass");
  // Override fires.
  assert.equal(d.dispatch(ev("d", { metaKey: true, altKey: true }), idle).kind, "ran");
  assert.equal(ran, 1);
});

// ── workspace.toggleCreateFrom ────────────────────────────────────────────────

test("workspace.toggleCreateFrom fires on ⌘I", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { "workspace.toggleCreateFrom": () => void ran++ });
  assert.equal(d.dispatch(ev("i", { metaKey: true }), idle).kind, "ran");
  assert.equal(ran, 1);
});

test("workspace.toggleCreateFrom fires while typing (allowWhileTyping:true)", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { "workspace.toggleCreateFrom": () => void ran++ });
  assert.equal(d.dispatch(ev("i", { metaKey: true }), typing).kind, "ran");
  assert.equal(ran, 1);
});

test("workspace.toggleCreateFrom skips when handler is undefined (picker disabled)", () => {
  const d = createDispatcher();
  bindCommands(d, { "workspace.toggleCreateFrom": undefined });
  assert.equal(d.dispatch(ev("i", { metaKey: true }), idle).kind, "pass");
});

test("workspace.toggleCreateFrom shortcut override replaces ⌘I", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(
    d,
    { "workspace.toggleCreateFrom": () => void ran++ },
    { overrides: { "workspace.toggleCreateFrom": [logical("k", ["meta"])] } },
  );
  // Original shortcut no longer fires.
  assert.equal(d.dispatch(ev("i", { metaKey: true }), idle).kind, "pass");
  // Override fires.
  assert.equal(d.dispatch(ev("k", { metaKey: true }), idle).kind, "ran");
  assert.equal(ran, 1);
});


