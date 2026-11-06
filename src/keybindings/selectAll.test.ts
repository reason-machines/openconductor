import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsSelectAll, preventsSelectAll } from "./selectAll.ts";

const key = (k: string, mods: { meta?: boolean; shift?: boolean; alt?: boolean; ctrl?: boolean } = {}) => ({
  key: k,
  code: `Key${k.toUpperCase()}`,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  ctrlKey: mods.ctrl ?? false,
});
const el = (tagName: string, attrs: Record<string, string> = {}) => ({ tagName, getAttribute: (n: string) => attrs[n] ?? null });

test("⌘A outside a text field is swallowed", () => {
  assert.equal(preventsSelectAll(key("a", { meta: true }), el("DIV")), true);
  assert.equal(preventsSelectAll(key("a", { meta: true }), el("BODY")), true);
  assert.equal(preventsSelectAll(key("a", { meta: true }), null), true);
});

test("⌘A in an input, a textarea or a contenteditable element keeps its native meaning", () => {
  assert.equal(preventsSelectAll(key("a", { meta: true }), el("INPUT")), false);
  assert.equal(preventsSelectAll(key("a", { meta: true }), el("TEXTAREA")), false);
  assert.equal(preventsSelectAll(key("a", { meta: true }), el("DIV", { contenteditable: "true" })), false);
  // Conductor tests the attribute for "true" only.
  assert.equal(keepsSelectAll(el("DIV", { contenteditable: "plaintext-only" })), false);
});

test("other keys are left alone", () => {
  assert.equal(preventsSelectAll(key("a"), el("DIV")), false);
  assert.equal(preventsSelectAll(key("a", { meta: true, shift: true }), el("DIV")), false);
  assert.equal(preventsSelectAll(key("c", { meta: true }), el("DIV")), false);
});
