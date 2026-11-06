import { test } from "node:test";
import assert from "node:assert/strict";
import { CITY_TOTAL, visitedCities } from "./cities.ts";
import type { Repo, Workspace } from "../state/types";

function ws(name: string): Workspace {
  return {
    id: name,
    name,
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

test("the total is the size of the city catalogue", () => {
  assert.ok(CITY_TOTAL > 0);
});
