import { test } from "node:test";
import assert from "node:assert/strict";
import { placeDropdown } from "./dropdownPlacement.ts";

const vp = { width: 1280, height: 820 };
const size = { width: 190, height: 108 };

test("opens below the trigger, left edges aligned, 4px gap", () => {
  const p = placeDropdown({ left: 400, top: 300, right: 420, bottom: 320 }, size, vp);
  assert.deepEqual(p, { left: 400, top: 324, side: "bottom", originX: 10, originY: -4 });
});

test("flips above when the bottom does not fit", () => {
  const p = placeDropdown({ left: 400, top: 760, right: 420, bottom: 780 }, size, vp);
  assert.equal(p.side, "top");
  assert.equal(p.top, 760 - 4 - 108);
  assert.equal(p.originY, 112);
});

test("shifts left to stay in the viewport", () => {
  const p = placeDropdown({ left: 1200, top: 300, right: 1220, bottom: 320 }, size, vp);
  assert.equal(p.left, 1280 - 190);
  assert.equal(p.originX, 1210 - 1090);
});

test("stays below, clamped, when neither side fits", () => {
  const p = placeDropdown({ left: 10, top: 50, right: 30, bottom: 70 }, { width: 190, height: 800 }, vp);
  assert.equal(p.side, "bottom");
  assert.equal(p.top, 20);
});
