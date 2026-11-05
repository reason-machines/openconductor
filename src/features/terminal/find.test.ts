// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { counterText, findMatches, matchesKey, nextIndex, previousIndex, scrollRow, searchableLines, type BufferLike, type LineLike } from "./find.ts";

/** A row of cells; "＊" style wide characters take two cells (the second has width 0). */
function row(text: string, cols: number, isWrapped = false): LineLike {
  const cells: { chars: string; width: number }[] = [];
  for (const ch of text) {
    const wide = /[\u3000-\u9fff\uff00-\uffef]/.test(ch);
    cells.push({ chars: ch, width: wide ? 2 : 1 });
    if (wide) cells.push({ chars: "", width: 0 });
  }
  while (cells.length < cols) cells.push({ chars: "", width: 1 });
  return {
    isWrapped,
    length: cols,
    getCell: (x) => (cells[x] ? { getWidth: () => cells[x].width, getChars: () => cells[x].chars } : undefined),
  };
}
const buffer = (rows: LineLike[]): BufferLike => ({ length: rows.length, getLine: (y) => rows[y] });

test("matches ignore case and come back in buffer order", () => {
  const b = buffer([row("Error: one", 20), row("ok", 20), row("error two ERROR", 20)]);
  assert.deepEqual(findMatches(searchableLines(b), "error"), [
    { lineIndex: 0, column: 0, length: 5 },
    { lineIndex: 2, column: 0, length: 5 },
    { lineIndex: 2, column: 10, length: 5 },
  ]);
});

test("a match across a wrapped row starts on the first row and spans onto the next", () => {
  const b = buffer([row("npm run dev", 11), row("server", 11, true)]);
  const lines = searchableLines(b);
  assert.equal(lines.length, 1);
  assert.deepEqual(findMatches(lines, "devserver"), [{ lineIndex: 0, column: 8, length: 9 }]);
});

test("rows that are not wrapped never join", () => {
  const b = buffer([row("dev", 3), row("server", 6)]);
  assert.deepEqual(findMatches(searchableLines(b), "devserver"), []);
});

test("wide characters count as two cells", () => {
  const b = buffer([row("ab漢字cd", 10)]);
  assert.deepEqual(findMatches(searchableLines(b), "漢字c"), [{ lineIndex: 0, column: 2, length: 5 }]);
  assert.deepEqual(findMatches(searchableLines(b), "cd"), [{ lineIndex: 0, column: 6, length: 2 }]);
});

test("matches do not overlap", () => {
  assert.equal(findMatches(searchableLines(buffer([row("aaaa", 4)])), "aa").length, 2);
});

test("an empty term finds nothing", () => {
  assert.deepEqual(findMatches(searchableLines(buffer([row("x", 1)])), ""), []);
});

test("counter, wrap-around and scroll row", () => {
  assert.equal(counterText(0, 0), "0 of 0");
  assert.equal(counterText(5, 1), "2 of 5");
  assert.equal(nextIndex(4, 5), 0);
  assert.equal(previousIndex(0, 5), 4);
  assert.equal(nextIndex(0, 0), 0);
  // 100-row buffer, 24 visible rows: the last page starts at row 76.
  assert.equal(scrollRow(10, 100, 24), 10);
  assert.equal(scrollRow(90, 100, 24), 76);
  assert.equal(scrollRow(3, 10, 24), 0);
  assert.equal(matchesKey([{ lineIndex: 1, column: 2, length: 3 }]), "1:2:3");
});
