import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingsFor, resolveCommand } from "./resolve.ts";
import { PRIORITY, type FocusContext } from "./dispatcher.ts";
import { logical } from "./types.ts";
import type { KeyEventLike } from "./shortcut.ts";

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});
const cmd = { metaKey: true };
const idle: FocusContext = { activeDialogId: null, typing: false, inTerminal: false };
const typing: FocusContext = { ...idle, typing: true };
const terminal: FocusContext = { ...idle, inTerminal: true };
const palette: FocusContext = { activeDialogId: "command-palette-dialog", typing: true, inTerminal: false };
const ALL = ["toggleCommandPalette", "commandPalette.nextTab", "workspace.create", "nav.home", "view.toggleLeftSidebar", "terminal.clearScrollback"];

test("registration defaults: input and terminal focus on, NORMAL priority, not global", () => {
  const [b] = bindingsFor("workspace.next");
  assert.deepEqual(
    { input: b.enableOnInputFocus, term: b.enableOnTerminalFocus, global: b.isGlobal, priority: b.priority },
    { input: true, term: true, global: false, priority: PRIORITY.NORMAL },
  );
});

test("one binding per effective shortcut; call-site options win over the command's when", () => {
  assert.deepEqual(bindingsFor("view.toggleLeftSidebar").map((b) => b.shortcut), [logical("b", ["meta"]), logical("[")]);
  assert.equal(bindingsFor("toggleCommandPalette", { isGlobal: false })[0].isGlobal, false);
  assert.deepEqual(bindingsFor("nav.home", { enabled: false }), []);
  assert.deepEqual(bindingsFor("nav.home", {}, { dialogId: "settings" })[0].enableOnDialogIds, ["settings"]);
});

test("Cmd+K opens the palette idle, while typing and inside the palette", () => {
  for (const ctx of [idle, typing, palette]) assert.equal(resolveCommand(key("k", cmd), ctx, ALL), "toggleCommandPalette");
});

test("terminal-only commands need terminal focus", () => {
  assert.equal(resolveCommand(key("k", cmd), terminal, ["terminal.clearScrollback"]), "terminal.clearScrollback");
  assert.equal(resolveCommand(key("k", cmd), idle, ["terminal.clearScrollback"]), undefined);
});

test("Tab cycles palette tabs only while the palette is open", () => {
  assert.equal(resolveCommand(key("Tab"), palette, ALL), "commandPalette.nextTab");
  assert.equal(resolveCommand(key("Tab"), idle, ALL), undefined);
});

test("an open dialog blocks non-global commands", () => {
  assert.equal(resolveCommand(key("n", cmd), idle, ALL), "workspace.create");
  assert.equal(resolveCommand(key("n", cmd), palette, ALL), undefined);
  assert.equal(resolveCommand(key("h", { metaKey: true, shiftKey: true }), palette, ALL), "nav.home");
});

test("bare keys need allowWhileTyping; Cmd chords and Cmd+1..9 fire while typing", () => {
  assert.equal(resolveCommand(key("["), idle, ALL), "view.toggleLeftSidebar");
  assert.equal(resolveCommand(key("["), typing, ALL), undefined);
  assert.equal(resolveCommand(key("b", cmd), typing, ALL), "view.toggleLeftSidebar");
  for (let i = 1; i <= 9; i++) assert.equal(resolveCommand(key(String(i), cmd), typing, [`workspace.switchTo${i}`]), `workspace.switchTo${i}`);
});

test("overrides rebind what resolves", () => {
  const overrides = { toggleCommandPalette: [logical("p", ["meta", "shift"])] };
  assert.equal(resolveCommand(key("k", cmd), idle, ALL, { overrides }), undefined);
  assert.equal(resolveCommand(key("p", { metaKey: true, shiftKey: true }), idle, ALL, { overrides }), "toggleCommandPalette");
});
