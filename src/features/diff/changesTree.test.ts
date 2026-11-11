import { test } from "node:test";
import assert from "node:assert/strict";
import { changeRows, type ChangesView } from "./changesTree.ts";
import type { FileDiff } from "./types.ts";
import { isViewed, setViewed, type ViewedMap } from "./viewed.ts";

const file = (path: string, additions = 1, deletions = 0, last_modified_time?: number): FileDiff => ({ path, additions, deletions, status: "modified", old_path: null, binary: false, hunks: [], last_modified_time });
const rows = (files: FileDiff[], view: ChangesView, collapsed = new Set<string>(), viewed: ViewedMap = {}) => changeRows(files, view, collapsed, (file) => isViewed(viewed, file));

test("flat changes sort by path and retain file identity", () => {
  const files = [file("src/lib/auth.ts"), file("src/lib/auth.test.ts")];
  const actual = rows(files, "flat");
  assert.deepEqual(actual.map((r) => r.kind === "file" && r.file.path), [files[1].path, files[0].path]);
  assert.equal(actual[0].kind === "file" && actual[0].file, files[1]);
  assert.equal(actual[0].name, "src/lib/auth.test.ts");
});

test("flat changes put unviewed files first and sort paths within each group", () => {
  const files = [file("d.ts", 1, 0, 100), file("c.ts", 1, 0, 100), file("b.ts", 1, 0, 100), file("a.ts", 1, 0, 100)];
  const viewed = { "a.ts": 200, "c.ts": 200 };
  const actual = rows(files, "flat", new Set(), viewed);
  assert.deepEqual(actual.map((row) => row.name), ["b.ts", "d.ts", "a.ts", "c.ts"]);
  assert.deepEqual(actual, [files[2], files[0], files[3], files[1]].map((file) => ({ kind: "file", file, name: file.path, depth: 0 })));
  for (const row of actual) assert.ok(row.kind === "file" && files.includes(row.file));
  assert.deepEqual(files.map((file) => file.path), ["d.ts", "c.ts", "b.ts", "a.ts"]);
  assert.deepEqual(viewed, { "a.ts": 200, "c.ts": 200 });
});

test("flat changes keep path ordering when all files have the same viewed state", () => {
  const files = [file("z.ts", 1, 0, 100), file("a.ts", 1, 0, 100)];
  const states: ViewedMap[] = [{}, { "a.ts": 200, "z.ts": 200 }];
  for (const viewed of states) {
    assert.deepEqual(rows(files, "flat", new Set(), viewed).map((row) => row.name), ["a.ts", "z.ts"]);
  }
});

test("flat changes handle empty and singleton lists with either viewed state", () => {
  const only = file("only.ts", 1, 0, 100);
  assert.deepEqual(rows([], "flat"), []);
  const states: ViewedMap[] = [{}, { "only.ts": 100 }];
  for (const viewed of states) {
    assert.deepEqual(rows([only], "flat", new Set(), viewed), [{ kind: "file", file: only, name: "only.ts", depth: 0 }]);
  }
});

test("flat ordering uses the production viewed timestamp predicate including zero and missing metadata", () => {
  const files: FileDiff[] = [
    file("a-equal.ts", 1, 0, 200),
    file("b-older.ts", 1, 0, 100),
    { ...file("c-deleted.ts", 0, 1, 0), status: "deleted" },
    file("d-zero.ts", 1, 0, 0),
    file("e-newer.ts", 1, 0, 201),
    file("f-missing.ts"),
    file("g-unmarked.ts", 1, 0, 100),
  ];
  const viewed = { "a-equal.ts": 200, "b-older.ts": 200, "c-deleted.ts": 0, "d-zero.ts": 0, "e-newer.ts": 200, "f-missing.ts": 200 };
  assert.deepEqual(rows(files, "flat", new Set(), viewed).map((row) => row.name), [
    "e-newer.ts", "f-missing.ts", "g-unmarked.ts", "a-equal.ts", "b-older.ts", "c-deleted.ts", "d-zero.ts",
  ]);
});

test("marking, unmarking and newer modifications reorder flat rows without changing file identity", () => {
  const a = file("a.ts", 1, 0, 100);
  const b = file("b.ts", 1, 0, 100);
  const files = [a, b];
  const marked = setViewed({}, a, true);
  const afterMark = rows(files, "flat", new Set(), marked);
  assert.deepEqual(afterMark.map((row) => row.name), ["b.ts", "a.ts"]);
  assert.equal(afterMark[1].kind === "file" && afterMark[1].file, a);
  assert.deepEqual(rows(files, "flat", new Set(), setViewed(marked, a, false)).map((row) => row.name), ["a.ts", "b.ts"]);
  const modified = { ...a, last_modified_time: marked[a.path] + 1 };
  const afterModify = rows([modified, b], "flat", new Set(), marked);
  assert.deepEqual(afterModify.map((row) => row.name), ["a.ts", "b.ts"]);
  assert.equal(afterModify[0].kind === "file" && afterModify[0].file, modified);
});

test("a filtered subset keeps viewed grouping, rename metadata and file identity", () => {
  const renamed: FileDiff = { ...file("a.ts", 3, 2, 100), status: "renamed", old_path: "old-a.ts" };
  const files = [renamed, file("b.ts", 1, 0, 100), file("c.ts", 1, 0, 100)];
  const shown = files.filter((file) => file.path !== "c.ts");
  const actual = rows(shown, "flat", new Set(), { "a.ts": 200 });
  assert.deepEqual(actual.map((row) => row.name), ["b.ts", "a.ts"]);
  assert.equal(actual[1].kind === "file" && actual[1].file, renamed);
  assert.equal(actual[1].kind === "file" && actual[1].file.old_path, "old-a.ts");
});

test("tree rows and collapsed totals ignore viewed classification", () => {
  const files = [file("src/a.ts", 2, 1, 100), file("src/b.ts", 4, 3, 100), file("README.md", 1, 0, 100)];
  const viewed = { "src/a.ts": 200, "README.md": 200 };
  for (const collapsed of [new Set<string>(), new Set(["src"])]) {
    assert.deepEqual(rows(files, "tree", collapsed, viewed), rows(files, "tree", collapsed));
  }
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
