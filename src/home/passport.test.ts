import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repo, Workspace } from "../state/types.ts";
import { HOME_CITY_SLUGS } from "./cityCatalog.ts";
import { PASSPORT_CITIES } from "./passportCities.ts";
import { PASSPORT_COUNTRIES, PASSPORT_GRATICULE } from "./passportWorld.ts";
import { INITIAL_PASSPORT_VIEW, movePassport, passportSelection, passportVisited, passportWorkspaces, projectCity, zoomPassport } from "./passport.ts";

function workspace(id: string, directoryName: string, archived = false): Workspace {
  return { id, name: "Human-readable title", directoryName, branch: "main", status: archived ? "archived" : "idle", createdAt: 0, diff: { added: 0, removed: 0 } };
}
function repo(workspaces: Workspace[]): Repo {
  return { id: "repo", name: "Example", path: "/isolated/example", defaultBranch: "main", workspaces };
}

test("the map covers the same 385 city facts as Home", () => {
  assert.equal(PASSPORT_CITIES.length, 385);
  assert.deepEqual(PASSPORT_CITIES.map((city) => city.slug).sort(), [...HOME_CITY_SLUGS].sort());
  for (const { coordinates } of PASSPORT_CITIES) {
    assert.ok(coordinates[0] >= -180 && coordinates[0] <= 180);
    assert.ok(coordinates[1] >= -90 && coordinates[1] <= 90);
  }
  assert.equal(PASSPORT_COUNTRIES.length, 177);
  assert.ok(PASSPORT_COUNTRIES.every((path) => path.startsWith("M") && !path.includes("NaN")));
  assert.ok(PASSPORT_GRATICULE.startsWith("M"));
});

test("visited counts deduplicate city variants and include archived workspaces", () => {
  const active = workspace("oslo", "oslo-v2");
  const archived = workspace("montpelier", "montpelier", true);
  const workspaces = passportWorkspaces([repo([active, workspace("oslo2", "Oslo"), workspace("unknown", "fix-login")])], [{ repoId: "repo", workspace: archived }]);
  assert.equal(workspaces.length, 3);
  assert.equal(workspaces[0].archived, true);
  const visited = passportVisited(workspaces);
  assert.deepEqual([...visited.cities].sort(), ["montpelier", "oslo"]);
  assert.equal(visited.tiers.rare.size, 1);
  assert.equal(visited.tiers.common.size, 1);
});

test("only an active city opens a workspace, preserving repository and workspace ids", () => {
  const workspaces = passportWorkspaces([repo([workspace("first", "oslo"), workspace("second", "kyoto", true)])]);
  assert.equal(passportSelection(workspaces[0]), null);
  assert.deepEqual(passportSelection(workspaces[1]), { kind: "workspace", repoId: "repo", workspaceId: "first" });
});

test("an active row replaces a stale archived record for the same workspace", () => {
  const workspaces = passportWorkspaces([repo([workspace("same", "oslo")])], [{ repoId: "repo", workspace: workspace("same", "oslo", true) }]);
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].archived, false);
});

test("map zoom is bounded from 1 to 8 and button zoom preserves the center", () => {
  assert.deepEqual(zoomPassport(INITIAL_PASSPORT_VIEW, 1 / 1.5), INITIAL_PASSPORT_VIEW);
  const view = zoomPassport(INITIAL_PASSPORT_VIEW, 1.5);
  assert.deepEqual(view, { zoom: 1.5, x: -200, y: -150 });
  assert.equal(zoomPassport(view, 100).zoom, 8);
  assert.deepEqual(zoomPassport(view, 1 / 1.5), INITIAL_PASSPORT_VIEW);
  assert.deepEqual(zoomPassport(INITIAL_PASSPORT_VIEW, 2, [100, 200]), { zoom: 2, x: -100, y: -200 });
});

test("panning retains zoom and can move past the viewport as the reference's unbounded translate extent", () => {
  assert.deepEqual(movePassport(INITIAL_PASSPORT_VIEW, 40, -20), { zoom: 1, x: 40, y: -20 });
  assert.deepEqual(INITIAL_PASSPORT_VIEW, { zoom: 1, x: 0, y: 0 });
});

test("EqualEarth projects the origin to the map center and is symmetric", () => {
  assert.deepEqual(projectCity([0, 0]), [400, 300]);
  const east = projectCity([45, 30]);
  const west = projectCity([-45, -30]);
  assert.ok(Math.abs(east[0] + west[0] - 800) < 1e-10);
  assert.ok(Math.abs(east[1] + west[1] - 600) < 1e-10);
});
