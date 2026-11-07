import { test } from "node:test";
import assert from "node:assert/strict";
import { changeRows, type ChangesView } from "./changesTree.ts";
import type { FileDiff } from "./types.ts";

const file = (path: string, additions = 1, deletions = 0): FileDiff => ({ path, additions, deletions, status: "modified", old_path: null, binary: false, hunks: [] });
const rows = (files: FileDiff[], view: ChangesView, collapsed = new Set<string>()) => changeRows(files, view, collapsed);

test("flat changes sort by path and retain file identity", () => {
  const files = [file("src/lib/auth.ts"), file("src/lib/auth.test.ts")];
  const actual = rows(files, "flat");
  assert.deepEqual(actual.map((r) => r.kind === "file" && r.file.path), [files[1].path, files[0].path]);
  assert.equal(actual[0].kind === "file" && actual[0].file, files[1]);
  assert.equal(actual[0].name, "src/lib/auth.test.ts");
});

test("tree compresses single-directory chains and starts expanded", () => {
  const actual = rows([file("src/lib/auth.ts"), file("src/lib/auth.test.ts")], "tree");
  assert.deepEqual(actual.map(({ kind, name, depth }) => [kind, name, depth]), [["directory", "src / lib", 0], ["file", "auth.test.ts", 1], ["file", "auth.ts", 1]]);
  assert.equal(actual[0].kind === "directory" && actual[0].path, "src/lib");
});

test("collapsed directories hide descendants and retain aggregate counts", () => {
  const actual = rows([file("src/lib/auth.ts", 2, 1), file("src/lib/auth.test.ts", 14)], "tree", new Set(["src/lib"]));
  assert.deepEqual(actual, [{ kind: "directory", path: "src/lib", name: "src / lib", depth: 0, expanded: false, additions: 16, deletions: 1 }]);
});

test("tree sorts directories before files without compressing through a file", () => {
  const actual = rows([file("src/z.ts"), file("src/lib/a.ts"), file("README.md")], "tree");
  assert.deepEqual(actual.map(({ kind, name, depth }) => [kind, name, depth]), [["directory", "src", 0], ["directory", "lib", 1], ["file", "a.ts", 2], ["file", "z.ts", 1], ["file", "README.md", 0]]);
});

test("filtered files do not retain unrelated folders or aggregates", () => {
  const actual = rows([file("src/lib/auth.test.ts", 14)], "tree");
  assert.equal(actual.length, 2);
  assert.equal(actual[0].kind === "directory" && actual[0].additions, 14);
  assert.deepEqual(rows([], "tree"), []);
});
