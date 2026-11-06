import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_ITEMS, nextIndex, versionLine } from "./helpMenuItems.ts";

test("items follow Conductor's order", () => {
  assert.deepEqual(HELP_ITEMS.map((i) => i.label), ["Keyboard shortcuts", "Docs", "Best practices", "Changelog", "Send feedback", "Submit a prompt", "Diagnostics", "Open debug tools"]);
});

test("keyboard shortcuts opens the dialog and shows its shortcut", () => {
  const k = HELP_ITEMS[0];
  assert.deepEqual(k.action, { kind: "shortcuts" });
  assert.equal(k.commandId, "openKeyboardShortcuts");
});

test("external items open https links", () => {
  for (const item of HELP_ITEMS.filter((i) => i.external)) {
    assert.equal(item.action.kind, "url");
    if (item.action.kind === "url") assert.match(item.action.url, /^https:\/\//);
  }
});

test("the last three items open the prompt dialog, the Diagnostics page and the web inspector", () => {
  const tail = HELP_ITEMS.slice(-3).map((i) => [i.label, i.action.kind, i.icon ?? null, !!i.external]);
  assert.deepEqual(tail, [
    ["Submit a prompt", "submitPrompt", null, false],
    ["Diagnostics", "diagnostics", "stethoscope", false],
    ["Open debug tools", "devtools", null, false],
  ]);
});

test("version line shows the app version, or ... while unknown", () => {
  assert.equal(versionLine("0.1.0"), "OpenConductor v0.1.0");
  assert.equal(versionLine(undefined), "OpenConductor v...");
});

test("arrow keys wrap around the menu", () => {
  assert.equal(nextIndex(4, 5, "ArrowDown"), 0);
  assert.equal(nextIndex(0, 5, "ArrowUp"), 4);
  assert.equal(nextIndex(1, 5, "ArrowDown"), 2);
  assert.equal(nextIndex(-1, 5, "ArrowDown"), -1);
});
