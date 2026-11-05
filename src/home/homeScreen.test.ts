import { test } from "node:test";
import assert from "node:assert/strict";
import { citiesVisited, cityOf } from "./citiesVisited.ts";
import { GLYPH_PITCH, pixelWordmark } from "./pixelWordmark.ts";
import { CITIES } from "../workspace/naming.ts";
import type { Repo, Workspace } from "../state/types";

const ws = (name: string, directoryName?: string): Workspace => ({
  id: name,
  name,
  directoryName,
  branch: name,
  status: "idle",
  diff: { added: 0, removed: 0 },
  createdAt: 0,
});
const repo = (workspaces: Workspace[]): Repo => ({ id: "r", name: "r", path: "/r", defaultBranch: "main", workspaces });

test("a -vN suffix and letter case still name the city", () => {
  assert.equal(cityOf("oslo"), "oslo");
  assert.equal(cityOf("Oslo-v2"), "oslo");
  assert.equal(cityOf("fix-login"), null);
});

test("cities visited counts distinct cities over the whole list", () => {
  const repos = [repo([ws("Oslo PR title", "oslo"), ws("oslo-v1"), ws("fix-login")]), repo([ws("lima")])];
  assert.deepEqual(citiesVisited(repos), { visited: 2, total: CITIES.length });
  assert.equal(citiesVisited([]).visited, 0);
});

test("the wordmark spells OPENCONDUCTOR on Conductor's grid", () => {
  const mark = pixelWordmark("OPENCONDUCTOR");
  assert.equal(mark.width, 12 * GLYPH_PITCH + 6);
  assert.equal(mark.height, 9.5);
  // Every bar stays inside its glyph cell and on a whole-unit grid.
  for (const b of mark.bars) {
    const cell = Math.floor(b.x / GLYPH_PITCH);
    assert.ok(b.x + b.width <= cell * GLYPH_PITCH + 6, `bar at ${b.x} spills out of glyph ${cell}`);
    assert.ok(Number.isInteger(b.x) && [0, 2, 4, 6, 8].includes(b.y));
  }
  assert.throws(() => pixelWordmark("Z"));
});
