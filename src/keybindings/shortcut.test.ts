import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equivalent,
  glyphs,
  matchesEvent,
  recordFromEvent,
  sameShortcut,
  searchTokens,
  shortcutParts,
  spoken,
  type KeyEventLike,
} from "./shortcut.ts";
import { logical, physical } from "./types.ts";

const ev = (key: string, code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("parts are modifiers in ctrl, meta, shift, alt order, then the key", () => {
  assert.deepEqual(shortcutParts(logical("k", ["alt", "meta", "shift", "ctrl"])), ["ctrl", "meta", "shift", "alt", "k"]);
  assert.deepEqual(shortcutParts(physical("Slash", "/", ["meta", "alt"])), ["meta", "alt", "/"]);
});

test("glyphs and spoken labels", () => {
  assert.equal(glyphs(physical("Slash", "/", ["meta", "alt"])), "⌘⌥/");
  assert.equal(glyphs(logical("Enter", ["shift"])), "⇧↵");
  assert.equal(glyphs(logical("ArrowUp", ["meta", "alt"])), "⌘⌥↑");
  assert.equal(glyphs(logical("Backspace", ["meta", "shift"])), "⌘⇧⌫");
  assert.equal(glyphs(logical(" ")), "Space");
  assert.equal(spoken([logical("k", ["meta"]), logical("[")]), "Command+K or [");
  assert.equal(spoken([logical("Tab", ["ctrl", "shift"])]), "Control+Shift+Tab");
});

test("search tokens include modifier aliases and glyphs", () => {
  assert.deepEqual(searchTokens(logical("k", ["meta"])), ["command", "cmd", "⌘", "k", "K"]);
});

test("logical keys match case-insensitively with exact modifiers", () => {
  const s = logical("k", ["meta"]);
  assert.ok(matchesEvent(s, ev("k", "KeyK", { metaKey: true })));
  assert.ok(matchesEvent(s, ev("K", "KeyK", { metaKey: true })));
  assert.ok(!matchesEvent(s, ev("k", "KeyK")));
  assert.ok(!matchesEvent(s, ev("k", "KeyK", { metaKey: true, shiftKey: true })));
});

test("symbols tolerate the Shift or Option that produced them", () => {
  assert.ok(matchesEvent(logical("+", ["meta"]), ev("+", "Equal", { metaKey: true, shiftKey: true })));
  assert.ok(matchesEvent(logical("+", ["meta"]), ev("=", "Equal", { metaKey: true })));
  assert.ok(!matchesEvent(logical("-", ["meta"]), ev("-", "Minus", { metaKey: true, ctrlKey: true })));
});

test("physical keys match by code whatever the layout types", () => {
  const s = physical("KeyT", "T", ["meta", "alt"]);
  assert.ok(matchesEvent(s, ev("†", "KeyT", { metaKey: true, altKey: true })));
  assert.ok(!matchesEvent(s, ev("t", "KeyY", { metaKey: true, altKey: true })));
});

test("sameShortcut is exact; equivalent bridges logical and physical", () => {
  assert.ok(sameShortcut(logical("k", ["meta"]), logical("k", ["meta"])));
  assert.ok(!sameShortcut(logical("k", ["meta"]), logical("K", ["meta"])));
  assert.ok(equivalent(logical("k", ["meta"]), logical("K", ["meta"])));
  assert.ok(equivalent(physical("BracketLeft", "[", ["meta", "shift"]), logical("[", ["meta"])));
  assert.ok(!equivalent(logical("k", ["meta"]), logical("k", ["meta", "shift"])));
});

test("recording: Option letter chords become physical, dead keys are refused", () => {
  assert.deepEqual(recordFromEvent(ev("†", "KeyT", { metaKey: true, altKey: true })), physical("KeyT", "T", ["meta", "alt"]));
  assert.deepEqual(recordFromEvent(ev("j", "KeyJ", { metaKey: true })), logical("j", ["meta"]));
  assert.deepEqual(recordFromEvent(ev("Enter", "Enter")), logical("Enter"));
  assert.deepEqual(recordFromEvent(ev("Dead", "KeyE", { altKey: true })), physical("KeyE", "E", ["alt"]));
  assert.equal(recordFromEvent(ev("Dead", "Quote")), undefined);
  assert.equal(recordFromEvent(ev("Shift", "ShiftLeft", { shiftKey: true })), undefined);
});
