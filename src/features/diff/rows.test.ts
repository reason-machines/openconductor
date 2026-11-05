// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSpans, splitRows, unifiedRows } from "./rows.ts";
import type { DiffLine, Hunk, LineKind } from "./types.ts";

function l(kind: LineKind, text: string, old_line: number | null, new_line: number | null): DiffLine {
  return { kind, text, old_line, new_line };
}

const hunk: Hunk = {
  old_start: 1,
  old_lines: 4,
  new_start: 1,
  new_lines: 4,
  section: "",
  lines: [
    l("context", "a", 1, 1),
    l("deletion", "let x = 1;", 2, null),
    l("deletion", "gone()", 3, null),
    l("addition", "let x = 2;", null, 2),
    l("context", "b", 4, 3),
    l("addition", "tail()", null, 4),
  ],
};

test("split rows pair deletions with additions and pad the rest", () => {
  const rows = splitRows(hunk);
  assert.deepEqual(
    rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null]),
    [
      ["a", "a"],
      ["let x = 1;", "let x = 2;"],
      ["gone()", null],
      ["b", "b"],
      [null, "tail()"],
    ],
  );
  assert.deepEqual(rows[1].leftEmphasis, [8, 9]);
  assert.deepEqual(rows[1].rightEmphasis, [8, 9]);
  assert.equal(rows[2].leftEmphasis, undefined);
});

test("unified rows keep git order and carry emphasis for paired lines", () => {
  const rows = unifiedRows(hunk);
  assert.deepEqual(
    rows.map((r) => r.line.text),
    ["a", "let x = 1;", "gone()", "let x = 2;", "b", "tail()"],
  );
  assert.deepEqual(rows[1].emphasis, [8, 9]);
  assert.deepEqual(rows[3].emphasis, [8, 9]);
  assert.equal(rows[2].emphasis, undefined);
});

test("changedSpans trims common prefix and suffix and skips whole-line rewrites", () => {
  assert.deepEqual(changedSpans("foo(bar)", "foo(baz)"), { before: [6, 7], after: [6, 7] });
  assert.deepEqual(changedSpans("ab", "aXb"), { before: [1, 1], after: [1, 2] });
  assert.equal(changedSpans("same", "same"), null);
  assert.equal(changedSpans("completely", "different!"), null);
});
