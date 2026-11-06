import { test } from "node:test";
import assert from "node:assert/strict";
import { absolutePath, allDirs, ancestors, buildTree, filterPaths, newFilePath, visibleRows } from "./tree.ts";

const files = ["src/lib/auth.ts", "README.md", "src/lib/auth.test.ts", "src/main.ts", ".gitignore", "docs/a.md"];

test("folders start collapsed and sort with files by name", () => {
  const rows = visibleRows(buildTree(files), new Set());
  assert.deepEqual(
    rows.map((r) => `${r.kind}:${r.path}`),
    ["file:.gitignore", "dir:docs", "file:README.md", "dir:src"],
  );
});

test("expanding a folder shows its children one level deeper", () => {
  const rows = visibleRows(buildTree(files), new Set(["src", "src/lib"]));
  assert.deepEqual(
    rows.map((r) => `${r.depth}:${r.name}`),
    ["0:.gitignore", "0:docs", "0:README.md", "0:src", "1:lib", "2:auth.test.ts", "2:auth.ts", "1:main.ts"],
  );
  assert.equal(rows.find((r) => r.name === "auth.ts")?.path, "src/lib/auth.ts");
  assert.equal(rows.find((r) => r.name === "src")?.expanded, true);
});

test("a collapsed parent hides an expanded child", () => {
  const rows = visibleRows(buildTree(files), new Set(["src/lib"]));
  assert.equal(rows.some((r) => r.path === "src/lib/auth.ts"), false);
});

test("absolute paths join the worktree once", () => {
  assert.equal(absolutePath("/w/lisbon/", "src/a.ts"), "/w/lisbon/src/a.ts");
});

test("a filter keeps paths containing every word, ignoring case", () => {
  assert.deepEqual(filterPaths(files, "AUTH"), ["src/lib/auth.ts", "src/lib/auth.test.ts"]);
  assert.deepEqual(filterPaths(files, "lib test"), ["src/lib/auth.test.ts"]);
  assert.deepEqual(filterPaths(files, "  "), files);
  assert.deepEqual(filterPaths(files, "nope"), []);
});

test("allDirs lists every folder, nested ones too", () => {
  assert.deepEqual([...allDirs(buildTree(files))].sort(), ["docs", "src", "src/lib"]);
});

test("ancestors are the folders above a path", () => {
  assert.deepEqual(ancestors("src/lib/auth.ts"), ["src", "src/lib"]);
  assert.deepEqual(ancestors("README.md"), []);
});

test("a new file path stays inside the worktree and never replaces a file", () => {
  assert.deepEqual(newFilePath("", "notes.md", files), { path: "notes.md" });
  assert.deepEqual(newFilePath("src/lib", " token.ts ", files), { path: "src/lib/token.ts" });
  assert.deepEqual(newFilePath("src", "lib/auth.ts", files), { error: "src/lib/auth.ts already exists" });
  assert.deepEqual(newFilePath("", "", files), { error: "Enter a file name" });
  for (const bad of ["../x", "/etc/x", "a//b", "a/", "./a"]) assert.ok("error" in newFilePath("", bad, files), bad);
});
