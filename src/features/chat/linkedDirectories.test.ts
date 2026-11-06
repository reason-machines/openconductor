import test from "node:test";
import assert from "node:assert/strict";
import type { Repo, Workspace } from "../../state/types.ts";
import { linkedDirectoryGroups, localDirectoryPath } from "./linkedDirectories.ts";
import { chooseLinkedDirectory, type LinkedDirectoryServices } from "./linkedDirectoryApi.ts";

function workspace(id: string, changes: Partial<Workspace> = {}): Workspace {
  return { id, name: id, branch: `ada/${id}`, path: `/fixture/${id}`, status: "idle", createdAt: 0, diff: { added: 0, removed: 0 }, ...changes };
}
const repos: Repo[] = [
  { id: "current", name: "tide-web", path: "/fixture/web", defaultBranch: "main", workspaces: [workspace("current")] },
  { id: "api", name: "tide-api", path: "/fixture/api", defaultBranch: "main", workspaces: [workspace("accra"), workspace("tallinn"), workspace("archived", { status: "archived" }), workspace("missing", { path: undefined }), workspace("remote", { path: "https://example.invalid/workspace" })] },
  { id: "dot", name: "dotfiles", path: "/fixture/dotfiles", defaultBranch: "main", workspaces: [workspace("bergen")] },
];

test("only eligible local workspaces from other repositories are grouped in input order", () => {
  const groups = linkedDirectoryGroups({ repos, repositoryId: "current", query: "" });
  assert.deepEqual(groups.map((group) => [group.name, group.workspaces.map((row) => row.id)]), [["tide-api", ["accra", "tallinn"]], ["dotfiles", ["bergen"]]]);
});

test("search matches directory, branch or repository case-insensitively, not display title", () => {
  for (const query of ["ACCRA", "ada/acc", "TIDE-API"]) {
    const groups = linkedDirectoryGroups({ repos, repositoryId: "current", query });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, "tide-api");
  }
  assert.equal(linkedDirectoryGroups({ repos, repositoryId: "current", query: "  " }).length, 2);
  assert.equal(linkedDirectoryGroups({ repos, repositoryId: "current", query: "absent" }).length, 0);
});

test("excluded paths hide already selected rows and empty groups", () => {
  assert.deepEqual(linkedDirectoryGroups({ repos, repositoryId: "current", query: "", excludedPaths: ["/fixture/accra/", "/fixture/tallinn", "/fixture/bergen"] }), []);
});

test("local path validation rejects URLs, relative paths, traversal and controls without trimming names", () => {
  for (const path of ["", "~/work", "relative/work", "https://example.invalid", "file:///tmp/work", "/tmp/../work", "/tmp/./work", "/tmp/a\0b", "/tmp/a\nb"]) assert.equal(localDirectoryPath(path), null);
  assert.equal(localDirectoryPath("/tmp//a folder///"), "/tmp/a folder");
  assert.equal(localDirectoryPath("/tmp/space "), "/tmp/space ");
  assert.equal(localDirectoryPath("/"), "/");
});

test("choosing an existing directory returns only its validated local path", async () => {
  const checked: string[] = [];
  const services: LinkedDirectoryServices = { browse: async () => "/tmp//folder/", isDirectory: async (path) => { checked.push(path); return true; } };
  assert.equal(await chooseLinkedDirectory({ services }), "/tmp/folder");
  assert.deepEqual(checked, ["/tmp/folder"]);
  assert.equal(await chooseLinkedDirectory({ path: "/tmp/known", services }), "/tmp/known");
});

test("cancel does not inspect, and invalid or excluded selections cannot escape validation", async () => {
  let inspections = 0;
  const services: LinkedDirectoryServices = { browse: async () => null, isDirectory: async () => { inspections++; return true; } };
  assert.equal(await chooseLinkedDirectory({ services }), null);
  await assert.rejects(chooseLinkedDirectory({ path: "remote:folder", services }), /absolute local/);
  await assert.rejects(chooseLinkedDirectory({ path: "/tmp/linked/", excludedPaths: ["/tmp/linked"], services }), /already linked/);
  assert.equal(inspections, 0);
});

test("deleted directories and inspection failures do not become selections", async () => {
  const services: LinkedDirectoryServices = { browse: async () => "/tmp/gone", isDirectory: async () => false };
  await assert.rejects(chooseLinkedDirectory({ services }), /no longer exists/);
  await assert.rejects(chooseLinkedDirectory({ services: { ...services, isDirectory: async () => { throw new Error("permission denied"); } } }), /permission denied/);
});
