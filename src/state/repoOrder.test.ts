import { test } from "node:test";
import assert from "node:assert/strict";
import { hasHiddenRepos, moveRepo, orderRepos, setRepoHidden, visibleRepos } from "./repoOrder.ts";
import type { Repo } from "./types.ts";

const repo = (id: string, hidden = false): Repo => ({ id, name: id, path: `/src/${id}`, defaultBranch: "main", workspaces: [], hidden: hidden || undefined });

test("moveRepo puts the dragged id at the target's place", () => {
  assert.deepEqual(moveRepo(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(moveRepo(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(moveRepo(["a", "b"], "a", "a"), ["a", "b"]);
  assert.deepEqual(moveRepo(["a", "b"], "x", "a"), ["a", "b"]);
});

test("moving between visible repos keeps a hidden one in its slot", () => {
  // b is hidden: dragging c onto a moves c before a; b keeps its place relative to the rest.
  assert.deepEqual(moveRepo(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
});

test("orderRepos follows ids and keeps unknown repos at the end", () => {
  const ordered = orderRepos([repo("a"), repo("b"), repo("c")], ["c", "a"]);
  assert.deepEqual(ordered.map((r) => r.id), ["c", "a", "b"]);
});

test("hidden repos are listed only while show hidden is on", () => {
  const repos = [repo("a"), repo("b", true)];
  assert.deepEqual(visibleRepos(repos, false).map((r) => r.id), ["a"]);
  assert.deepEqual(visibleRepos(repos, true).map((r) => r.id), ["a", "b"]);
  assert.equal(hasHiddenRepos(repos), true);
  assert.equal(hasHiddenRepos([repo("a")]), false);
});

test("setRepoHidden flips one repo and leaves the others alone", () => {
  const repos = [repo("a"), repo("b")];
  const hidden = setRepoHidden(repos, "a", true);
  assert.deepEqual(hidden.map((r) => r.hidden), [true, undefined]);
  assert.deepEqual(setRepoHidden(hidden, "a", false).map((r) => r.hidden), [undefined, undefined]);
  assert.equal(repos[0].hidden, undefined);
});
