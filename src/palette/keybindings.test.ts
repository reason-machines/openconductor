import { test } from "node:test";
import assert from "node:assert/strict";
import { chord, formatChord, matchesChord, parseChord, type KeyInput } from "./keybindings/chord.ts";
import { applyOverrides, findConflicts, resolveBinding, type FocusContext } from "./keybindings/routing.ts";
import { COMMAND_PALETTE_DIALOG_ID, DEFAULT_BINDINGS } from "./keybindings/defaults.ts";

function key(k: string, mods: Partial<KeyInput> = {}, code?: string): KeyInput {
  return { key: k, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}
const cmd = { metaKey: true };
const idle: FocusContext = { openDialogId: null, focus: "none" };
const typing: FocusContext = { openDialogId: null, focus: "input" };
const terminal: FocusContext = { openDialogId: null, focus: "terminal" };
const palette: FocusContext = { openDialogId: COMMAND_PALETTE_DIALOG_ID, focus: "input" };
const resolve = (e: KeyInput, ctx: FocusContext) => resolveBinding(DEFAULT_BINDINGS, e, ctx)?.id ?? null;

test("parse and format chords", () => {
  assert.deepEqual(parseChord("Cmd+Shift+K"), chord("k", "shift", "meta"));
  assert.deepEqual(parseChord("mod++"), chord("+", "meta"));
  assert.equal(formatChord(parseChord("meta+shift+ctrl+alt+p")), "⌃⌥⇧⌘P");
  assert.equal(formatChord(chord("Tab", "shift")), "⇧⇥");
  assert.throws(() => parseChord("hyper+k"), /Unknown modifier/);
});

test("matching uses exact modifiers, physical code and implied shift for symbols", () => {
  assert.ok(matchesChord(chord("k", "meta"), key("K", { metaKey: true, shiftKey: false })));
  assert.ok(!matchesChord(chord("k", "meta"), key("k", { metaKey: true, shiftKey: true })));
  assert.ok(matchesChord(chord("/", "meta", "shift"), key("?", { metaKey: true, shiftKey: true }, "Slash")));
  assert.ok(matchesChord(chord("+", "meta"), key("+", { metaKey: true, shiftKey: true }, "Equal")));
  assert.ok(matchesChord(chord("1", "meta"), key("¡", { metaKey: true }, "Digit1")));
});

test("Cmd+K opens the palette from anywhere, including while typing", () => {
  assert.equal(resolve(key("k", cmd), idle), "toggleCommandPalette");
  assert.equal(resolve(key("k", cmd), typing), "toggleCommandPalette");
  assert.equal(resolve(key("k", cmd), palette), "toggleCommandPalette");
});

test("Cmd+K clears scrollback instead when the terminal has focus", () => {
  assert.equal(resolve(key("k", cmd), terminal), "terminal.clearScrollback");
});

test("Tab cycles palette tabs only while the palette is open", () => {
  assert.equal(resolve(key("Tab"), palette), "commandPalette.nextTab");
  assert.equal(resolve(key("Tab", { shiftKey: true }), palette), "commandPalette.previousTab");
  assert.equal(resolve(key("Tab"), idle), null);
});

test("an open dialog blocks non-global bindings", () => {
  assert.equal(resolve(key("n", cmd), idle), "workspace.create");
  assert.equal(resolve(key("n", cmd), palette), null);
  assert.equal(resolve(key("h", { metaKey: true, shiftKey: true }), palette), "nav.home");
});

test("plain-key bindings do not fire while typing", () => {
  assert.equal(resolve(key("["), idle), "view.toggleLeftSidebar");
  assert.equal(resolve(key("["), typing), null);
  assert.equal(resolve(key("b", cmd), typing), "view.toggleLeftSidebar");
});

test("Cmd+1..9 switch workspaces", () => {
  for (let i = 1; i <= 9; i++) assert.equal(resolve(key(String(i), cmd), idle), `workspace.switchTo${i}`);
});

test("overrides rebind configurable bindings and ignore the rest", () => {
  const defs = applyOverrides(DEFAULT_BINDINGS, {
    toggleCommandPalette: [chord("p", "meta", "shift")],
    openSettings: [chord("s", "meta")],
  });
  assert.equal(resolveBinding(defs, key("p", { metaKey: true, shiftKey: true }), idle)?.id, "toggleCommandPalette");
  assert.equal(resolveBinding(defs, key("k", cmd), idle), null);
  assert.equal(resolveBinding(defs, key(",", cmd), idle)?.id, "openSettings");
});

test("default bindings have no same-scope conflicts; duplicates are reported", () => {
  assert.deepEqual(findConflicts(DEFAULT_BINDINGS), []);
  const clash = applyOverrides(DEFAULT_BINDINGS, { "workspace.create": [chord("k", "meta")] });
  assert.deepEqual(findConflicts(clash), [{ chord: "meta+k", ids: ["toggleCommandPalette", "workspace.create"] }]);
});
