import { test } from "node:test";
import assert from "node:assert/strict";
import { fileIconName, folderIconName, materialIconUrl } from "./fileIconNames.ts";

test("file types map to Conductor's material icons", () => {
  assert.equal(fileIconName(".gitignore"), "git");
  assert.equal(fileIconName("tools/gen.py"), "python");
  assert.equal(fileIconName("docs/notes.md"), "markdown");
  assert.equal(fileIconName("scripts/setup.sh"), "console");
  assert.equal(fileIconName("src/util.js"), "javascript");
  assert.equal(fileIconName("src/backend.ts"), "typescript");
  assert.equal(fileIconName("src/App.tsx"), "react_ts");
  assert.equal(fileIconName("data/seed.json"), "json");
  assert.equal(fileIconName("package.json"), "nodejs");
  assert.equal(fileIconName("README.md"), "readme");
  assert.equal(fileIconName("notes.unknownext"), "file");
  assert.equal(fileIconName(""), "file");
});

test("folders use the generic folder, open while expanded", () => {
  assert.equal(folderIconName(false), "folder");
  assert.equal(folderIconName(true), "folder-open");
});

test("icons are served at Conductor's path", () => {
  assert.equal(materialIconUrl("git"), "/material-icons/git.svg");
});
