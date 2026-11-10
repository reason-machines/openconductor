import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOverrides } from "../keybindings/overrides.ts";
import { helpShortcutHints } from "./helpShortcutHints.ts";

const commandId = "openKeyboardShortcuts";
const remapped = parseOverrides(JSON.stringify({
  version: 1,
  overrides: {
    [commandId]: [
      { key: { kind: "logical", value: "y" }, modifiers: ["meta", "shift"] },
      { key: { kind: "logical", value: "k" }, modifiers: ["meta"] },
    ],
  },
}));

test("Help shows the default shortcut without an override", () => {
  assert.deepEqual(helpShortcutHints(commandId, {}), ["⌘⌥/"]);
});

test("Help displays saved replacement shortcuts, not the default", () => {
  assert.ok(remapped[commandId], "fixture must be accepted by the persisted override parser");
  assert.deepEqual(helpShortcutHints(commandId, remapped), ["⌘⇧Y", "⌘K"]);
});

test("Help reflects a changed override snapshot and a reset to defaults", () => {
  const changed = parseOverrides(JSON.stringify({ version: 1, overrides: {
    [commandId]: { key: { kind: "logical", value: "j" }, modifiers: ["meta"] },
  } }));
  assert.deepEqual(helpShortcutHints(commandId, remapped), ["⌘⇧Y", "⌘K"]);
  assert.deepEqual(helpShortcutHints(commandId, changed), ["⌘J"]);
  assert.deepEqual(helpShortcutHints(commandId, {}), ["⌘⌥/"]);
});
