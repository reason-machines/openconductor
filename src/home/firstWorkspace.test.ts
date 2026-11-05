import { test } from "node:test";
import assert from "node:assert/strict";
import { firstWorkspaceRequest, toStoreWorkspace } from "./firstWorkspace.ts";
import { toCreateWorkspaceArgs } from "../workspace/createFlow.ts";
import { seededRng } from "../workspace/naming.ts";

const repo = { id: "repo-42", root: "/Users/me/code/my-app", defaultBranch: "main" };

test("first workspace belongs to the registered repository id, not a client-side one", () => {
  const args = toCreateWorkspaceArgs(firstWorkspaceRequest(repo, "", seededRng(1)));
  assert.equal(args.repositoryId, "repo-42");
});

test("first workspace branches from the default branch with a generated name and no first message", () => {
  const request = firstWorkspaceRequest({ ...repo, defaultBranch: "trunk" }, "", seededRng(2));
  const args = toCreateWorkspaceArgs(request);
  assert.equal(args.baseBranch, "trunk");
  assert.equal(args.existingBranch, false);
  assert.ok(args.directoryName.length > 0);
  assert.equal(args.branchName, args.directoryName);
  assert.equal(request.firstSession, null);
  assert.equal(request.naming.placeholder_branch_name, args.branchName);
  assert.equal(request.naming.user_set_workspace_name, false);
});

test("first workspace branch takes the user's branch prefix", () => {
  const args = toCreateWorkspaceArgs(firstWorkspaceRequest(repo, "sven/", seededRng(3)));
  assert.equal(args.branchName, `sven/${args.directoryName}`);
});

test("toStoreWorkspace maps the created worktree into the store's addWorkspace payload", () => {
  const request = firstWorkspaceRequest(repo, "", seededRng(4));
  const ws = toStoreWorkspace(request, {
    workspace: { id: "ws-1", directoryName: "lisbon", branchName: "lisbon", path: "/data/workspaces/my-app/lisbon" },
    number: 1,
  });
  assert.deepEqual(ws, {
    id: "ws-1",
    name: "lisbon",
    branch: "lisbon",
    path: "/data/workspaces/my-app/lisbon",
    placeholderBranchName: "lisbon",
    userSetWorkspaceName: false,
    userSetBranchName: false,
    number: 1,
  });
});
