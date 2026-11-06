import { test } from "node:test";
import assert from "node:assert/strict";
import { placeMenu } from "./popoverMenuPlacement.ts";

const vp = { width: 1440, height: 900 };
const size = { width: 128, height: 40 };

test("opens to the right of the pointer with Conductor's offset", () => {
  // Measured in Conductor: right-click at (36, 202) on a settings nav link puts the menu at (38, 202).
  assert.deepEqual(placeMenu({ x: 36, y: 202 }, size, vp, { x: 2, y: 0 }), { left: 38, top: 202, originX: -2, originY: 0 });
  // Link in a row description: pointer (496.7, 188) -> menu (496, 183) for a 128x72 menu.
  const p = placeMenu({ x: 496.7, y: 188 }, { width: 128, height: 72 }, vp, { x: 0, y: -5 });
  assert.equal(p.top, 183);
  assert.ok(Math.abs(p.left - 496) <= 1);
});

test("flips to the pointer's left near the right edge", () => {
  const p = placeMenu({ x: 1400, y: 300 }, size, vp, { x: 2, y: 0 });
  assert.equal(p.left, 1400 - 2 - 128);
  assert.equal(p.originX, 130);
});

test("stays inside the window at the bottom", () => {
  const p = placeMenu({ x: 100, y: 890 }, size, vp);
  assert.equal(p.top, 900 - 5 - 40);
});
