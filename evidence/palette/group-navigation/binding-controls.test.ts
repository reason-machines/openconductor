import assert from "node:assert/strict";
import test from "node:test";
import { paletteCommandFor } from "../../../src/palette/state.ts";
import { logical } from "../../../src/keybindings/types.ts";
import type { Overrides } from "../../../src/keybindings/overrides.ts";

// Supplemental preservation controls; the 36-case regression is unchanged.
for (const { key, overrides, expected } of [
  { key: "ArrowDown", overrides: { "commandPalette.nextTab": [logical("ArrowDown", ["alt"])] }, expected: "next-tab" },
  { key: "ArrowUp", overrides: { "commandPalette.previousTab": [logical("ArrowUp", ["alt"])] }, expected: "prev-tab" },
  { key: "ArrowDown", overrides: { toggleCommandPalette: [logical("ArrowDown", ["alt"])] }, expected: "close" },
  { key: "ArrowDown", overrides: {}, expected: "next-group" },
  { key: "ArrowUp", overrides: {}, expected: "prev-group" },
] satisfies { key: string; overrides: Overrides; expected: string }[]) {
  test(`binding control: ${key} ${JSON.stringify(overrides)} resolves to ${expected}`, () => {
    const event = { key, code: "", metaKey: false, ctrlKey: false, altKey: true, shiftKey: false };
    assert.equal(paletteCommandFor(event, overrides), expected);
  });
}
