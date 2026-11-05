// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSpans, fileLines, gapBefore, splitRows, unifiedRows } from "./rows.ts";
import { nextUnread } from "./nav.ts";
import type { DiffLine, FileDiff, Hunk, LineKind } from "./types.ts";

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

const at = (new_start: number, new_lines: number): Hunk => ({ old_start: new_start, old_lines: new_lines, new_start, new_lines, section: "", lines: [] });

test("gap rows count the unchanged lines hidden above each hunk", () => {
  const hunks = [at(6, 7), at(20, 4), at(24, 2)];
  assert.deepEqual(hunks.map((_, i) => gapBefore(hunks, i)), [5, 7, 0]);
  // A hunk that starts the file (or a brand-new file) has nothing above it.
  assert.equal(gapBefore([at(1, 3)], 0), 0);
  assert.equal(gapBefore([at(0, 0)], 0), 0);
});

test("entire-file lines are the new version, or the old one for a deleted file", () => {
  const f = (status: FileDiff["status"]): FileDiff => ({ path: "x", old_path: null, status, binary: false, additions: 0, deletions: 0, hunks: [hunk] });
  assert.deepEqual(fileLines(f("modified"), hunk).map((l) => l.text), ["a", "let x = 2;", "b", "tail()"]);
  assert.deepEqual(fileLines(f("deleted"), hunk).map((l) => l.text), ["a", "let x = 1;", "gone()", "b"]);
});

test("next unread skips viewed files, wraps, and is -1 when all are viewed", () => {
  const viewed = [true, false, true, false];
  const v = (i: number) => viewed[i];
  assert.equal(nextUnread(-1, 4, v), 1);
  assert.equal(nextUnread(1, 4, v), 3);
  assert.equal(nextUnread(3, 4, v), 1);
  assert.equal(nextUnread(0, 4, () => true), -1);
  assert.equal(nextUnread(-1, 0, v), -1);
});
