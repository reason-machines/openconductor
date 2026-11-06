import { test } from "node:test";
import assert from "node:assert/strict";
import { absolutePath, buildTree, visibleRows } from "./tree.ts";

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
