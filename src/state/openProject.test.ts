import { test } from "node:test";
import assert from "node:assert/strict";
import { addRegisteredRepo, decideOpenProject, failedToAddMessage, projectName } from "./openProject.ts";
import { sameRepoRecord } from "./addRepo.ts";
import type { Repo } from "./types.ts";

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

test("Open project on an already-added folder adds the backend's second project, <name>-v1, beside the first", () => {
  // Conductor's g2t: no duplicate check, a new repos row named makeRepoNameUnique(<folder>, null).
  const path = "/src/app";
  const decided = decideOpenProject(path, { isDir: true, hasGit: true, origin: "git@github.com:acme/app.git" });
  assert.deepEqual(decided, { kind: "add", name: "app", path, remote: "file:///src/app" });
  const added: Repo[] = [{ id: "app", name: "app", path, remote: "file:///src/app", defaultBranch: "main", workspaces: [] }];
  const action = addRegisteredRepo({ id: "app-v1", name: "app-v1", root: path, defaultBranch: "main" }, "file:///src/app");
  assert.deepEqual(action, { type: "addRepo", id: "app-v1", repo: { name: "app-v1", path, remote: "file:///src/app", defaultBranch: "main" } });
  // The reducer drops an addRepo only for the same record; a new backend id on the same folder is kept.
  assert.ok(action.type === "addRepo");
  assert.equal(sameRepoRecord(added, { id: action.id, path: action.repo.path }), undefined);
});

test("a project registered after Create GitHub repo takes the backend's name, not the folder's", () => {
  const action = addRegisteredRepo({ id: "my-notes-v1", name: "My Notes-v1", root: "/Users/you/code/My Notes", defaultBranch: "main" }, "https://github.com/you/my-notes.git");
  assert.ok(action.type === "addRepo");
  assert.equal(action.repo.name, "My Notes-v1");
});
