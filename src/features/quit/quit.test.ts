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

test("a workspace reporting working counts once, unless its chats already report", () => {
  const chats = new Map([["ws-a", "idle"]]);
  const workspaces = [
    { id: "ws-a", status: "working" },
    { id: "ws-b", status: "working" },
    { id: "ws-c", status: "idle" },
  ];
  assert.equal(countRunningAgents(chats, workspaces), 1);
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
