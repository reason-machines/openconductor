import assert from "node:assert/strict";
import { test } from "node:test";
import { fileCopyPaths } from "./fileCopyPaths.ts";

for (const worktree of [null, undefined, ""]) {
  test(`Copy path falls back to the file path without a worktree (${String(worktree)})`, () => {
    assert.deepEqual(fileCopyPaths("src/file with spaces.ts", worktree), {
      path: "src/file with spaces.ts",
      relativePath: undefined,
    });
  });
}

test("Copy path uses the worktree and Copy relative path uses the file path", () => {
  assert.deepEqual(fileCopyPaths("src/main.ts", "/work/project"), {
    path: "/work/project/src/main.ts",
    relativePath: "src/main.ts",
  });
});

test("trailing worktree slashes do not change either copy target", () => {
  assert.deepEqual(fileCopyPaths("README.md", "/work/project///"), {
    path: "/work/project/README.md",
    relativePath: "README.md",
  });
});

test("the filesystem root remains an absolute copy target", () => {
  assert.deepEqual(fileCopyPaths("src/main.ts", "/"), {
    path: "/src/main.ts",
    relativePath: "src/main.ts",
  });
});

test("worktree and filename spaces are preserved", () => {
  assert.deepEqual(fileCopyPaths("nested folder/file with spaces.ts", "/work/project with spaces/"), {
    path: "/work/project with spaces/nested folder/file with spaces.ts",
    relativePath: "nested folder/file with spaces.ts",
  });
});
