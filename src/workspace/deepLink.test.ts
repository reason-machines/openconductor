// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppState, Repo } from "../state/types.ts";
import { lastWorkspaceLink, openWorkspaceLinkActions, parseWorkspaceLink } from "./deepLink.ts";

const repo = (id: string, workspaces: Repo["workspaces"]): Repo => ({ id, name: id, path: `/r/${id}`, workspaces }) as Repo;
const ws = (id: string, unread?: boolean): Repo["workspaces"][number] =>
  ({ id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, unread }) as Repo["workspaces"][number];

const state = (): AppState =>
  ({ repos: [repo("r1", [ws("w1")]), repo("r2", [ws("w2", true), ws("w3")])], selection: { kind: "home" } }) as unknown as AppState;

const open = (s: AppState, url: string) => {
  const link = parseWorkspaceLink(url);
  assert.ok(link, url);
  return openWorkspaceLinkActions(s, link);
};

test("Copy link's URL parses to its workspace (and session)", () => {
  assert.deepEqual(parseWorkspaceLink("openconductor://workspace?id=8f2c1e6a-1b2c"), { workspaceId: "8f2c1e6a-1b2c" });
  assert.deepEqual(parseWorkspaceLink("openconductor://workspace?id=w1&session=s9"), { workspaceId: "w1", sessionId: "s9" });
  assert.deepEqual(parseWorkspaceLink("openconductor://workspace?id=a+b%26c"), { workspaceId: "a b&c" });
});

test("other URLs are not workspace links", () => {
  for (const url of [
    "conductor://workspace?id=w1",
    "https://app.conductor.build/workspace/w1",
    "openconductor://settings?id=w1",
    "openconductor://workspace",
    "openconductor://workspace?id=",
    "not a url",
  ]) assert.equal(parseWorkspaceLink(url), null, url);
});

test("opening a link selects that workspace in its repository and clears unread", () => {
  // The same actions a click on the sidebar row dispatches (useWorkspaceRows onSelect).
  assert.deepEqual(open(state(), "openconductor://workspace?id=w2"), [
    { type: "select", selection: { kind: "workspace", repoId: "r2", workspaceId: "w2" } },
    { type: "setWorkspaceUnread", repoId: "r2", workspaceId: "w2", unread: false },
  ]);
  assert.deepEqual(open(state(), "openconductor://workspace?id=w1&session=s1"), [
    { type: "select", selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" } },
  ]);
});

test("a link to a workspace that is not loaded selects nothing yet", () => {
  assert.equal(openWorkspaceLinkActions(state(), { workspaceId: "missing" }), null);
});

test("of several URLs the OS hands over, the last workspace link wins", () => {
  assert.deepEqual(lastWorkspaceLink(["openconductor://workspace?id=w1", "https://x.test", "openconductor://workspace?id=w3"]), { workspaceId: "w3" });
  assert.equal(lastWorkspaceLink(null), null);
  assert.equal(lastWorkspaceLink(["https://x.test"]), null);
});
