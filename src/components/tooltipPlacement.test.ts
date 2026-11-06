import { test } from "node:test";
import assert from "node:assert/strict";
import { placeTooltip, titleWithShortcut } from "./tooltipPlacement.ts";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const vp = { width: 1280, height: 800 };

test("native titles read like Conductor's HH: label, space, shortcut", () => {
  assert.equal(titleWithShortcut("Go back", "⌘["), "Go back ⌘[");
  assert.equal(titleWithShortcut("Toggle left sidebar", "⌘B"), "Toggle left sidebar ⌘B");
  assert.equal(titleWithShortcut("Home", ""), "Home");
  assert.equal(titleWithShortcut("Home", undefined), "Home");
});

test("top placement, centred, 4 px above the trigger", () => {
  const p = placeTooltip(rect(200, 700, 24, 24), { width: 80, height: 24 }, vp);
  assert.deepEqual(p, { left: 172, top: 672, side: "top" });
});

test("flips to the bottom when the top would leave the window (collision padding 8)", () => {
  const p = placeTooltip(rect(200, 10, 24, 24), { width: 80, height: 24 }, vp);
  assert.equal(p.side, "bottom");
  assert.equal(p.top, 38);
});

test("clamps inside the window with 8 px padding", () => {
  const p = placeTooltip(rect(2, 700, 16, 16), { width: 120, height: 24 }, vp);
  assert.equal(p.left, 8);
});
