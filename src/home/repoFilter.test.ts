import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PROJECTS,
  ALL_PROJECTS_VALUE,
  createRepoDefault,
  filterRepoGroups,
  filterToValue,
  projectFilterOptions,
  reconcileRepoFilter,
  valueToFilter,
} from "./repoFilter.ts";

const repos = [
  { id: "r1", name: "openconductor" },
  { id: "r2", name: "monorepo" },
  { id: "r3", name: "docs", hidden: true },
];

test("no Filter by project submenu with one repository or none", () => {
  assert.equal(projectFilterOptions([]), null);
  assert.equal(projectFilterOptions([repos[0]]), null);
});

test("options are All projects, then every repository by name in list order", () => {
  assert.deepEqual(projectFilterOptions(repos), [
    { value: ALL_PROJECTS_VALUE, label: ALL_PROJECTS },
    { value: "r1", label: "openconductor" },
    { value: "r2", label: "monorepo" },
    { value: "r3", label: "docs" },
  ]);
});

test("All projects clears the filter; a repository id sets it", () => {
  assert.equal(valueToFilter(ALL_PROJECTS_VALUE), undefined);
  assert.equal(valueToFilter("r2"), "r2");
  assert.equal(filterToValue(undefined), ALL_PROJECTS_VALUE);
  assert.equal(filterToValue("r2"), "r2");
});

test("a filter keeps only the filtered repository's group", () => {
  assert.deepEqual(filterRepoGroups(repos, "r2").map((r) => r.id), ["r2"]);
  assert.deepEqual(filterRepoGroups(repos, undefined).map((r) => r.id), ["r1", "r2", "r3"]);
});

test("a filter on a removed repository is cleared only after repositories load", () => {
  assert.equal(reconcileRepoFilter("gone", repos, false), "gone");
  assert.equal(reconcileRepoFilter("gone", repos, true), undefined);
  assert.equal(reconcileRepoFilter("r1", repos, true), "r1");
  assert.equal(reconcileRepoFilter(undefined, repos, true), undefined);
});

test("createRepoDefault keeps a requested repository", () => {
  assert.equal(createRepoDefault(["r1", "r2", "r3"], "r3", "r2"), "r3");
});

test("createRepoDefault starts on the sidebar's project filter when nothing is requested", () => {
  assert.equal(createRepoDefault(["r1", "r2", "r3"], null, "r2"), "r2");
  assert.equal(createRepoDefault(["r1", "r2", "r3"], undefined, "r2"), "r2");
});

test("createRepoDefault skips a requested or filtered repository that is gone", () => {
  assert.equal(createRepoDefault(["r1", "r2", "r3"], "gone", "r2"), "r2");
  assert.equal(createRepoDefault(["r1", "r2", "r3"], null, "gone"), "r1");
});

test("createRepoDefault falls back to the first repository, or none", () => {
  assert.equal(createRepoDefault(["r1", "r2", "r3"], null, undefined), "r1");
  assert.equal(createRepoDefault([], "r1", "r1"), null);
});
