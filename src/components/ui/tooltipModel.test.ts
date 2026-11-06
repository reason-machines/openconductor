import { test } from "node:test";
import assert from "node:assert/strict";
import { logical } from "../../keybindings/types.ts";
import { hintParts, hintShortcuts, labelWithShortcut } from "./tooltipModel.ts";

test("the hint follows Conductor's default binding for a command", () => {
  // nav.newTab is ⌘T in Conductor's registry: "New chat, same files ⌘T".
  assert.deepEqual(hintShortcuts("nav.newTab").map(hintParts), [["⌘", "T"]]);
  assert.equal(labelWithShortcut("New chat, same files", "nav.newTab"), "New chat, same files ⌘T");
});

test("a user remap replaces the default in the hint", () => {
  const overrides = { "nav.newTab": [logical("n", ["meta", "shift"])] };
  assert.deepEqual(hintShortcuts("nav.newTab", overrides).map(hintParts), [["⌘", "⇧", "N"]]);
  assert.equal(labelWithShortcut("New chat, same files", "nav.newTab", overrides), "New chat, same files ⌘⇧N");
});

test("an unbound command shows no hint, like Ss returning null", () => {
  const overrides = { "nav.newTab": [] };
  assert.deepEqual(hintShortcuts("nav.newTab", overrides), []);
  assert.equal(labelWithShortcut("New chat, same files", "nav.newTab", overrides), "New chat, same files");
});

test("enter stays a token for the icon; other keys use Conductor's glyphs", () => {
  assert.deepEqual(hintParts(logical("Enter", ["meta"])), ["⌘", "enter"]);
  assert.deepEqual(hintParts(logical("Backspace", ["meta", "shift"])), ["⌘", "⇧", "⌫"]);
});
