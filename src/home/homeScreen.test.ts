import { test } from "node:test";
import assert from "node:assert/strict";
import { GLYPH_PITCH, pixelWordmark } from "./pixelWordmark.ts";

test("the wordmark spells OPENCONDUCTOR on Conductor's grid", () => {
  const mark = pixelWordmark("OPENCONDUCTOR");
  assert.equal(mark.width, 12 * GLYPH_PITCH + 6);
  assert.equal(mark.height, 9.5);
  // Every bar stays inside its glyph cell and on a whole-unit grid.
  for (const b of mark.bars) {
    const cell = Math.floor(b.x / GLYPH_PITCH);
    assert.ok(b.x + b.width <= cell * GLYPH_PITCH + 6, `bar at ${b.x} spills out of glyph ${cell}`);
    assert.ok(Number.isInteger(b.x) && [0, 2, 4, 6, 8].includes(b.y));
  }
  assert.throws(() => pixelWordmark("Z"));
});
