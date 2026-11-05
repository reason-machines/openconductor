import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOpenProject, failedToAddMessage, projectName } from "./openProject.ts";

test("project name is the last path segment, or untitled", () => {
  assert.equal(projectName("/Users/me/code/widgets"), "widgets");
  assert.equal(projectName("/Users/me/code/widgets/"), "widgets");
  assert.equal(projectName("C:\\code\\widgets"), "widgets");
  assert.equal(projectName("/"), "untitled");
  assert.equal(projectName(""), "untitled");
});

test("a git folder with an origin is added as a file:// remote", () => {
  const r = decideOpenProject("/code/widgets", { isDir: true, hasGit: true, origin: "git@github.com:acme/widgets.git" });
  assert.deepEqual(r, { kind: "add", name: "widgets", path: "/code/widgets", remote: "file:///code/widgets" });
});

test("a folder without .git or without origin asks for a GitHub repo", () => {
  assert.deepEqual(decideOpenProject("/code/notes", { isDir: true, hasGit: false, origin: null }), {
    kind: "needsGitHubRepo", name: "notes", path: "/code/notes", needsGitInit: true,
  });
  assert.deepEqual(decideOpenProject("/code/notes", { isDir: true, hasGit: true, origin: null }), {
    kind: "needsGitHubRepo", name: "notes", path: "/code/notes", needsGitInit: false,
  });
});

test("a path that is not a folder is an error, shown as a failed-to-add toast", () => {
  const r = decideOpenProject("/gone", { isDir: false, hasGit: false, origin: null });
  assert.deepEqual(r, { kind: "error", message: "/gone is not a folder" });
  assert.equal(failedToAddMessage(new Error("/gone is not a folder")), "Failed to add project: /gone is not a folder");
  assert.equal(failedToAddMessage("boom"), "Failed to add project: boom");
});
