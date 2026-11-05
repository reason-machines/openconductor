import { test } from "node:test";
import assert from "node:assert/strict";
import { moveActive, paletteCommandFor } from "./state.ts";
import { DEFAULT_BINDINGS } from "./keybindings/defaults.ts";
import { applyOverrides } from "./keybindings/routing.ts";
import { chord, type KeyInput } from "./keybindings/chord.ts";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});
const cmdFor = (e: KeyInput) => paletteCommandFor(e, DEFAULT_BINDINGS);

test("arrows, Enter and Escape drive the list", () => {
  assert.equal(cmdFor(key("ArrowDown")), "next-item");
  assert.equal(cmdFor(key("ArrowUp")), "prev-item");
  assert.equal(cmdFor(key("ArrowUp", { metaKey: true })), "first-item");
  assert.equal(cmdFor(key("n", { ctrlKey: true })), "next-item");
  assert.equal(cmdFor(key("Enter")), "select");
  assert.equal(cmdFor(key("Escape")), "close");
});

test("Tab and Shift+Tab switch tabs; Cmd+K closes; letters type", () => {
  assert.equal(cmdFor(key("Tab")), "next-tab");
  assert.equal(cmdFor(key("Tab", { shiftKey: true })), "prev-tab");
  assert.equal(cmdFor(key("k", { metaKey: true })), "close");
  assert.equal(cmdFor(key("k")), null);
  assert.equal(cmdFor(key("1", { metaKey: true })), null);
});

test("rebinding the palette toggle changes what closes it", () => {
  const defs = applyOverrides(DEFAULT_BINDINGS, { toggleCommandPalette: [chord("p", "meta", "shift")] });
  assert.equal(paletteCommandFor(key("k", { metaKey: true }), defs), null);
  assert.equal(paletteCommandFor(key("p", { metaKey: true, shiftKey: true }), defs), "close");
});

test("active row wraps and clamps", () => {
  assert.equal(moveActive(2, 3, "next-item"), 0);
  assert.equal(moveActive(0, 3, "prev-item"), 2);
  assert.equal(moveActive(1, 3, "last-item"), 2);
  assert.equal(moveActive(5, 3, "select"), 2);
  assert.equal(moveActive(0, 0, "next-item"), 0);
});
