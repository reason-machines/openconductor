import { test } from "node:test";
import assert from "node:assert/strict";
import { placeMenu } from "./contextMenuPlacement.ts";

const view = { width: 1440, height: 900 };

test("opens 2px right of the pointer, top aligned, scaling from the top left", () => {
  assert.deepEqual(placeMenu({ x: 100, y: 200 }, 200, 150, view), { left: 102, top: 200, originX: "left", originY: "top" });
});

test("flips to the pointer's left when it would leave the window", () => {
  assert.deepEqual(placeMenu({ x: 1400, y: 200 }, 200, 150, view), { left: 1198, top: 200, originX: "right", originY: "top" });
});

test("shifts up to stay inside the window near the bottom edge", () => {
  assert.deepEqual(placeMenu({ x: 100, y: 850 }, 200, 150, view), { left: 102, top: 750, originX: "left", originY: "bottom" });
});

test("a submenu sits flush beside its trigger (sideOffset 0)", () => {
  assert.equal(placeMenu({ x: 300, y: 40 }, 180, 100, view, 0).left, 300);
});
