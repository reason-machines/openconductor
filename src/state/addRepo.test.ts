import { test } from "node:test";
import assert from "node:assert/strict";
import { sameRepoRecord } from "./addRepo.ts";
import type { Repo } from "./types.ts";

const repo = (id: string, path: string, remote?: string): Repo => ({ id, name: id, path, remote, defaultBranch: "main", workspaces: [] });
const repos = [repo("a", "/src/app", "https://github.com/acme/app.git")];

test("a second clone of an added remote is a new project", () => {
  // Conductor clones into app-v1 and inserts a new repos row; nothing refuses it.
  assert.equal(sameRepoRecord(repos, { id: "b", path: "/src/app-v1" }), undefined);
  assert.equal(sameRepoRecord(repos, { path: "/src/app-v1" }), undefined);
});

test("the same backend id or folder is the same project", () => {
  assert.equal(sameRepoRecord(repos, { id: "a", path: "/elsewhere" })?.id, "a");
  assert.equal(sameRepoRecord(repos, { path: "/src/app/" })?.id, "a");
});

test("with a backend id, a folder match alone does not decide", () => {
  assert.equal(sameRepoRecord(repos, { id: "b", path: "/src/app" }), undefined);
});
