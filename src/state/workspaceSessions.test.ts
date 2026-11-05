import { test } from "node:test";
import assert from "node:assert/strict";
import { rowStatus } from "./rowStatus.ts";
import { workspaceChatStatuses, workspaceOfChat, workspaceSessionStatus } from "./workspaceSessions.ts";

test("a review chat belongs to the workspace in its id; the main chat is the workspace id", () => {
  assert.equal(workspaceOfChat("ws-1"), "ws-1");
  assert.equal(workspaceOfChat("ws-1:review:abc-1"), "ws-1");
});

test("a workspace's status is its most urgent chat, from any of its chats", () => {
  const s = new Map([
    ["ws-1", "idle"],
    ["ws-1:review:a-1", "working"],
    ["ws-2", "cancelling"],
    ["ws-3", "error"],
  ]);
  assert.equal(workspaceSessionStatus(s, "ws-1"), "working");
  assert.equal(workspaceSessionStatus(s, "ws-2"), "cancelling");
  assert.equal(workspaceSessionStatus(s, "ws-3"), "error");
  assert.equal(workspaceSessionStatus(s, "ws-4"), "idle");
});

test("the row shows a closed workspace's agent: working and cancelling reach the icon, error falls through to the PR", () => {
  const s = new Map([["ws-2", "cancelling"], ["ws-3", "error"]]);
  assert.equal(rowStatus({ workspaceState: "ready", session: workspaceSessionStatus(s, "ws-2"), hasRemote: true }), "cancelling");
  assert.equal(rowStatus({ workspaceState: "ready", session: workspaceSessionStatus(s, "ws-3"), hasRemote: true }), "branch");
});

test("a chat in this window wins over the workspace's status from elsewhere, which fills in when there is none", () => {
  const s = new Map([["ws-1", "idle"], ["ws-2:review:1", "waiting"]]);
  assert.equal(workspaceSessionStatus(s, "ws-1", "working"), "idle");
  assert.equal(workspaceSessionStatus(s, "ws-2", "needs_user_input"), "waiting");
  assert.equal(workspaceSessionStatus(s, "ws-3", "needs_user_permission"), "needs_user_permission");
  assert.equal(workspaceSessionStatus(s, "ws-3"), "idle");
});

test("workspaceChatStatuses lists each chat's status, or the fallback when the window has none", () => {
  const s = new Map([["ws-1", "needs_user_input"], ["ws-1:review:1", "working"], ["ws-2", "idle"]]);
  assert.deepEqual(workspaceChatStatuses(s, "ws-1").sort(), ["needs_user_input", "working"]);
  assert.deepEqual(workspaceChatStatuses(s, "ws-3", "waiting"), ["waiting"]);
  assert.deepEqual(workspaceChatStatuses(s, "ws-2", "waiting"), ["idle"]);
  assert.deepEqual(workspaceChatStatuses(s, "ws-3"), []);
});
