// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_EDIT_BYTES, terminalCommandFor } from "./shortcuts.ts";
import { COMMANDS } from "../../keybindings/registry.ts";
import type { KeyEventLike } from "../../keybindings/shortcut.ts";

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("tab shortcuts resolve inside the terminal", () => {
  assert.equal(terminalCommandFor(key("t", { metaKey: true })), "terminal.newTab");
  assert.equal(terminalCommandFor(key("T", { metaKey: true, shiftKey: true })), "terminal.newBigTab");
  assert.equal(terminalCommandFor(key("w", { metaKey: true })), "terminal.closeTab");
  assert.equal(terminalCommandFor(key("k", { metaKey: true })), "terminal.clearScrollback");
  assert.equal(terminalCommandFor(key("f", { metaKey: true })), "terminal.search");
});

test("line-editing shortcuts resolve to commands that send shell bytes", () => {
  const cases: [KeyEventLike, string, string][] = [
    [key("ArrowLeft", { metaKey: true }), "terminal.moveLineStart", "\x01"],
    [key("ArrowRight", { metaKey: true }), "terminal.moveLineEnd", "\x05"],
    [key("Backspace", { metaKey: true }), "terminal.deleteLine", "\x15"],
    [key("ArrowLeft", { altKey: true }), "terminal.moveWordLeft", "\x1bb"],
    [key("ArrowRight", { altKey: true }), "terminal.moveWordRight", "\x1bf"],
    [key("Enter", { shiftKey: true }), "terminal.insertNewline", "\x1b\r"],
  ];
  for (const [e, id, bytes] of cases) {
    assert.equal(terminalCommandFor(e), id);
    assert.equal(LINE_EDIT_BYTES[id], bytes);
  }
});

test("ordinary typing reaches the shell untouched", () => {
  for (const e of [key("k"), key("t"), key("f"), key("f", { ctrlKey: true }), key("Enter"), key("ArrowLeft"), key("Backspace"), key("c", { ctrlKey: true }), key("w", { ctrlKey: true })])
    assert.equal(terminalCommandFor(e), undefined, JSON.stringify(e));
});

test("every command the terminal handles is in the registry", () => {
  const ids = new Set(COMMANDS.map((c) => c.id));
  for (const id of [...Object.keys(LINE_EDIT_BYTES), "terminal.newTab", "terminal.newBigTab", "terminal.closeTab", "terminal.clearScrollback", "terminal.search"])
    assert.ok(ids.has(id), id);
});
