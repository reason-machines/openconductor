import { test } from "node:test";
import assert from "node:assert/strict";
import { moveActive, paletteCommandFor } from "./state.ts";
import { logical } from "../keybindings/types.ts";
import type { KeyEventLike } from "../keybindings/shortcut.ts";

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});
const cmdFor = (e: KeyEventLike) => paletteCommandFor(e);

test("arrows, Enter and Escape drive the list", () => {
  assert.equal(cmdFor(key("ArrowDown")), "next-item");
  assert.equal(cmdFor(key("ArrowUp")), "prev-item");
  assert.equal(cmdFor(key("ArrowUp", { metaKey: true })), "first-item");
  assert.equal(cmdFor(key("n", { ctrlKey: true })), "next-item");
  assert.equal(cmdFor(key("Enter")), "select");
  assert.equal(cmdFor(key("Escape")), "close");
});

test("Home selects the first result instead of moving only the text cursor", () => {
  const command = cmdFor(key("Home"));
  assert.equal(command, "first-item");
  assert.equal(moveActive(2, 3, command), 0);
  assert.equal(moveActive(-1, 3, command), 0);
  assert.equal(moveActive(0, 0, command), 0);
});

test("End selects the last result instead of moving only the text cursor", () => {
  const command = cmdFor(key("End"));
  assert.equal(command, "last-item");
  assert.equal(moveActive(0, 3, command), 2);
  assert.equal(moveActive(-1, 3, command), 2);
  assert.equal(moveActive(0, 0, command), 0);
});

test("modified Home and End keep their text-field behavior", () => {
  for (const k of ["Home", "End"]) {
    for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"]) {
      assert.equal(cmdFor(key(k, { [modifier]: true })), null);
    }
  }
});

test("Tab and Shift+Tab switch tabs; Cmd+K closes; letters type", () => {
  assert.equal(cmdFor(key("Tab")), "next-tab");
  assert.equal(cmdFor(key("Tab", { shiftKey: true })), "prev-tab");
  assert.equal(cmdFor(key("k", { metaKey: true })), "close");
  assert.equal(cmdFor(key("k")), null);
  assert.equal(cmdFor(key("1", { metaKey: true })), null);
});

test("rebinding the palette toggle changes what closes it", () => {
  const defs = { toggleCommandPalette: [logical("p", ["meta", "shift"])] };
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
