import { test } from "node:test";
import assert from "node:assert/strict";
import { CITY_TOTAL, cityOf, visitedCities } from "./cities.ts";
import type { Repo, Workspace } from "../state/types";

function ws(name: string, directoryName?: string): Workspace {
  return {
    id: name,
    name,
    directoryName,
    branch: name,
    status: "idle",
    diff: { added: 0, removed: 0 },
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Workspace;
}

function repo(workspaces: Workspace[]): Repo {
  return { id: "r", name: "r", workspaces } as unknown as Repo;
}

test("no repositories means no visited cities", () => {
  assert.deepEqual(visitedCities([]), []);
});

test("a city counts once however many workspaces carry its name, in catalogue order", () => {
  const repos = [repo([ws("tallinn"), ws("osaka")]), repo([ws("Tallinn"), ws("not-a-city")])];
  assert.deepEqual(visitedCities(repos), ["osaka", "tallinn"]);
});

test("Home recognizes the complete 385-city catalogue, independently of the name generator", () => {
  assert.equal(CITY_TOTAL, 385);
  assert.equal(cityOf("Troy-v2"), "troy");
  assert.equal(cityOf("nukualofa"), "nukualofa");
  assert.equal(cityOf("atlantis"), null);
});

test("a -vN suffix and letter case still name the city", () => {
  assert.equal(cityOf("oslo"), "oslo");
  assert.equal(cityOf("Oslo-v2"), "oslo");
  assert.equal(cityOf("fix-login"), null);
});

test("a renamed workspace counts by its directory name, as Conductor's does", () => {
  const repos = [repo([ws("Oslo PR title", "oslo"), ws("oslo-v1"), ws("fix-login")]), repo([ws("lima")])];
  assert.deepEqual(visitedCities(repos), ["lima", "oslo"]);
});
