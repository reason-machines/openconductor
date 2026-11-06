import { test } from "node:test";
import assert from "node:assert/strict";
import { filterActive, filterChangedFiles, filterToggleShown, toggleFilter } from "./changesFilter.ts";

const f = (path: string, old_path: string | null = null) => ({ path, old_path });
const files = [f("src/app/main.ts"), f("README.md"), f("src/lib/util.ts", "src/lib/helpers.ts"), f("docs/guide.md")];
const paths = (list: { path: string }[]) => list.map((x) => x.path);

test("a blank or whitespace query keeps every file in order", () => {
  assert.deepEqual(paths(filterChangedFiles(files, "")), paths(files));
  assert.deepEqual(paths(filterChangedFiles(files, "   ")), paths(files));
});

test("matching is fuzzy, case-insensitive and keeps the list order", () => {
  assert.deepEqual(paths(filterChangedFiles(files, "md")), ["README.md", "docs/guide.md"]);
  assert.deepEqual(paths(filterChangedFiles(files, "SRCts")), ["src/app/main.ts", "src/lib/util.ts"]);
  assert.deepEqual(paths(filterChangedFiles(files, "  readme ")), ["README.md"]);
});

test("a rename matches on its old path too", () => {
  assert.deepEqual(paths(filterChangedFiles(files, "helpers")), ["src/lib/util.ts"]);
});

test("no match gives an empty list", () => {
  assert.deepEqual(filterChangedFiles(files, "zzzq"), []);
});

test("the row is active while open or holding text", () => {
  assert.equal(filterActive(false, ""), false);
  assert.equal(filterActive(true, ""), true);
  assert.equal(filterActive(false, "x"), true);
});

test("the toggle needs two files unless the filter is active", () => {
  assert.equal(filterToggleShown(false, 1), false);
  assert.equal(filterToggleShown(false, 2), true);
  assert.equal(filterToggleShown(true, 0), true);
});

test("toggling opens an idle filter and clears an active one", () => {
  assert.deepEqual(toggleFilter(false, ""), { open: true, query: "" });
  assert.deepEqual(toggleFilter(true, ""), { open: false, query: "" });
  assert.deepEqual(toggleFilter(false, "abc"), { open: false, query: "" });
});
