// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileFingerprint, isViewed, loadViewed, pruneViewed, saveViewed, toggleViewed, viewedCount } from "./viewed.ts";
import type { FileDiff } from "./types.ts";

function file(path: string, text: string): FileDiff {
  return {
    path,
    old_path: null,
    status: "modified",
    binary: false,
    additions: 1,
    deletions: 0,
    hunks: [{ old_start: 1, old_lines: 0, new_start: 1, new_lines: 1, section: "", lines: [{ kind: "addition", old_line: null, new_line: 1, text }] }],
  };
}

test("toggling marks and unmarks a file", () => {
  const a = file("a.ts", "x");
  const m1 = toggleViewed({}, a);
  assert.equal(isViewed(m1, a), true);
  assert.equal(isViewed(toggleViewed(m1, a), a), false);
});

test("a viewed file that changes again is no longer viewed", () => {
  const before = file("a.ts", "x");
  const after = file("a.ts", "y");
  assert.notEqual(fileFingerprint(before), fileFingerprint(after));
  assert.equal(isViewed(toggleViewed({}, before), after), false);
});

test("prune drops files that left the diff; count only counts current marks", () => {
  const a = file("a.ts", "x");
  const b = file("b.ts", "x");
  const m = toggleViewed(toggleViewed({}, a), b);
  assert.deepEqual(Object.keys(pruneViewed(m, [a])), ["a.ts"]);
  assert.equal(viewedCount(m, [a, file("b.ts", "changed")]), 1);
});

test("load and save round-trip through storage and survive corrupt data", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const m = toggleViewed({}, file("a.ts", "x"));
  saveViewed(storage, "ws1", m);
  assert.deepEqual(loadViewed(storage, "ws1"), m);
  assert.deepEqual(loadViewed(storage, "other"), {});
  store.set("openconductor.diff.viewed.bad", "{not json");
  assert.deepEqual(loadViewed(storage, "bad"), {});
});
