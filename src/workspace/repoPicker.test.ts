import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repo } from "../state/types.ts";
import { REPO_EXISTS, cloneDestination, cloneFailedMessage, findExistingRepo, parseCloneUrl, remoteKeyOf } from "./repoPicker.ts";

const repo = (id: string, path: string, remote?: string): Repo => ({ id, name: id, path, remote, defaultBranch: "main", workspaces: [] }) as Repo;

test("parses https, ssh, scp-style and owner/name clone URLs", () => {
  assert.deepEqual(parseCloneUrl("https://github.com/acme/web.git"), { url: "https://github.com/acme/web.git", name: "web", key: "github.com/acme/web" });
  assert.deepEqual(parseCloneUrl("git@github.com:Acme/Web.git"), { url: "git@github.com:Acme/Web.git", name: "Web", key: "github.com/acme/web" });
  assert.deepEqual(parseCloneUrl("ssh://git@gitlab.com:2222/group/sub/tool"), { url: "ssh://git@gitlab.com:2222/group/sub/tool", name: "tool", key: "gitlab.com/group/sub/tool" });
  assert.deepEqual(parseCloneUrl("  acme/cli  "), { url: "https://github.com/acme/cli", name: "cli", key: "github.com/acme/cli" });
});

test("rejects input git clone should not get", () => {
  for (const bad of ["", "acme", "https://github.com/acme", "acme/web; rm -rf /", "../etc/passwd", "https://github.com/acme/..", "not a url"]) {
    assert.equal(parseCloneUrl(bad), null, bad);
  }
});

test("the same repository over https and ssh is one repository", () => {
  assert.equal(remoteKeyOf("https://www.github.com/acme/web/"), remoteKeyOf("git@github.com:acme/web.git"));
  assert.equal(remoteKeyOf(undefined), null);
});

test("findExistingRepo matches by remote or by path", () => {
  const repos = [repo("a", "/code/web/", "https://github.com/acme/web"), repo("b", "/code/tool")];
  assert.equal(findExistingRepo(repos, { remote: parseCloneUrl("git@github.com:acme/web.git")!.url })?.id, "a");
  assert.equal(findExistingRepo(repos, { path: "/code/web" })?.id, "a");
  assert.equal(findExistingRepo(repos, { path: "/code/tool/" })?.id, "b");
  assert.equal(findExistingRepo(repos, { remote: "acme/other", path: "/code/other" }), undefined);
  assert.equal(REPO_EXISTS, "This repository already exists.");
});

test("clone destination and failure message", () => {
  assert.equal(cloneDestination("/Users/me/code/", "web"), "/Users/me/code/web");
  assert.equal(cloneFailedMessage("destination already exists: /x/web"), "Failed to clone repository: destination already exists: /x/web");
  assert.equal(cloneFailedMessage(undefined), "Failed to clone repository");
});
