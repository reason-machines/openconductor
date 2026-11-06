import { test } from "node:test";
import assert from "node:assert/strict";
import { countRunningAgents, QUIT_DIALOG, quitDecision } from "./quit.ts";

test("counts every running chat, including review and new chats of one workspace", () => {
  const chats = new Map([
    ["ws-a", "working"],
    ["ws-a:review:1", "working"],
    ["ws-a:chat:2", "idle"],
    ["ws-b", "cancelling"],
    ["ws-c", "needs_user_input"],
  ]);
  assert.equal(countRunningAgents(chats, []), 3);
});

test("a workspace's own status counts only with no chat here and when it is not open (the sidebar's rule)", () => {
  const chats = new Map([
    ["ws-a", "idle"],
    ["ws-d:review:1", "working"],
  ]);
  const workspaces = [
    { id: "ws-a", sessionStatus: "working" }, // has a chat here: the chat wins
    { id: "ws-b", sessionStatus: "working" }, // counts
    { id: "ws-c", sessionStatus: "idle" },
    { id: "ws-d", sessionStatus: "working" }, // its chat is already counted
    { id: "ws-e", sessionStatus: "cancelling" }, // counts unless open
  ];
  assert.equal(countRunningAgents(chats, workspaces), 3);
  assert.equal(countRunningAgents(chats, workspaces, "ws-e"), 2);
  assert.equal(countRunningAgents(new Map(), []), 0);
});

test("quits at once when idle, confirms while agents run", () => {
  assert.equal(quitDecision(0), "quit");
  assert.equal(quitDecision(1), "confirm");
  assert.equal(quitDecision(4), "confirm");
});

test("dialog text follows Conductor's wording for each count", () => {
  assert.equal(QUIT_DIALOG.description(undefined), "Agents may be running and will be stopped.");
  assert.equal(QUIT_DIALOG.description(0), "No agents are running, so it's safe to quit.");
  assert.equal(QUIT_DIALOG.description(1), "1 agent is currently running and will be stopped.");
  assert.equal(QUIT_DIALOG.description(3), "3 agents are currently running and will be stopped.");
});
