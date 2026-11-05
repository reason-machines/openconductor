import { test } from "node:test";
import assert from "node:assert/strict";
import { citiesLine, citiesVisited } from "./citiesLine.ts";
import type { Repo, Workspace } from "../state/types.ts";

function ws(name: string, status: Workspace["status"] = "idle"): Workspace {
  return { id: name, name, branch: name, status, diff: { added: 0, removed: 0 }, createdAt: 0 } as Workspace;
}

function repo(workspaces: Workspace[]): Repo {
  return { id: "r", name: "r", path: "", defaultBranch: "main", workspaces } as Repo;
}

test("no line when no workspace is named after a city", () => {
  const repos = [repo([ws("feature-x")])];
  assert.deepEqual(citiesVisited(repos), []);
  assert.equal(citiesLine(repos), null);
});

test("lists matching cities once and skips archived workspaces", () => {
  const repos = [repo([ws("oslo"), ws("tallinn", "archived")]), repo([ws("Oslo"), ws("lisbon")])];
  const names = citiesVisited(repos);
  assert.deepEqual(names.filter((n) => n === "oslo" || n === "Oslo").length, 1);
  assert.ok(names.includes("lisbon"));
  assert.ok(!names.includes("tallinn"));
  assert.equal(citiesLine(repos), `Cities visited: ${names.join(", ")}`);
});
