import { test } from "node:test";
import assert from "node:assert/strict";
import { placeDropdown } from "./dropdownPlacement.ts";

const vp = { width: 1280, height: 820 };
const size = { width: 190, height: 108 };

test("opens below the trigger, left edges aligned, 4px gap", () => {
  const p = placeDropdown({ left: 400, top: 300, right: 420, bottom: 320 }, size, vp);
  assert.deepEqual(p, { left: 400, top: 324, side: "bottom", originX: 10, originY: -4 });
});

test("end alignment keeps the right edges together without shifting to the window edge", () => {
  const p = placeDropdown({ left: 1240, top: 50, right: 1264, bottom: 74 }, { width: 220, height: 132 }, vp, 4, "end");
  assert.deepEqual(p, { left: 1044, top: 78, side: "bottom", originX: 208, originY: -4 });
});

test("end alignment shifts right when the popup would cross the left edge", () => {
  const p = placeDropdown({ left: 4, top: 50, right: 28, bottom: 74 }, size, vp, 4, "end");
  assert.equal(p.left, 0);
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
