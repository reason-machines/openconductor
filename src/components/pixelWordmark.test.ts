import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPixelWordmark, pixelWordmarkPath } from "./pixelWordmark.ts";

test("lays letters out with one blank column between glyphs", () => {
  const mark = buildPixelWordmark("T");
  assert.equal(mark.cols, 5);
  assert.equal(mark.rows, 7);
  // T top bar: five filled cells on row 0.
  const top = mark.cells.filter((c) => c.row === 0).map((c) => c.col);
  assert.deepEqual(top, [0, 1, 2, 3, 4]);
});

test("advances six columns per letter", () => {
  const mark = buildPixelWordmark("TT");
  assert.equal(mark.cols, 11);
  const secondStem = mark.cells.find((c) => c.row === 6 && c.col >= 6);
  assert.equal(secondStem?.col, 8);
});

test("rejects characters outside the font instead of drawing a gap", () => {
  assert.throws(() => buildPixelWordmark("OPEN-CONDUCTOR"), /no pixel glyph for "-"/);
});

test("the product wordmark covers every letter it names", () => {
  const mark = buildPixelWordmark("OPENCONDUCTOR");
  assert.equal("OPENCONDUCTOR".length, 13);
  assert.equal(mark.cols, 13 * 6 - 1);
  assert.ok(mark.cells.length > 0);
});

test("path has one square per cell", () => {
  const mark = buildPixelWordmark("UN");
  const squares = pixelWordmarkPath(mark).split("M").length - 1;
  assert.equal(squares, mark.cells.length);
});
