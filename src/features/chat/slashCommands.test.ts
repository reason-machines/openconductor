// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { commandSet, completeCommand, isKnownCommand, matchCommands, parseSlashCommand, slashQuery } from "./slashCommands.ts";

const names = (cs: { name: string }[]) => cs.map((c) => c.name);

test("Claude's '/' menu lists Conductor's commands in its order, then fast", () => {
  // The order Conductor's menu shows for an Opus 5 chat (evidence/chat/composer/composer--slash-menu--dark.png).
  assert.deepEqual(names(commandSet({ agent: "claude", planMode: { isPlanMode: false }, fastMode: { isFastMode: false } })), [
    "clear",
    "restart",
    "add-dir",
    "mcp-status",
    "mcp",
    "agents",
    "hooks",
    "memory",
    "permissions",
    "plugins",
    "compact",
    "ultracode",
    "plan",
    "fast",
  ]);
});

test("Codex gets personality, goal only when enabled, no Claude-only commands", () => {
  assert.deepEqual(names(commandSet({ agent: "codex" })), ["clear", "restart", "add-dir", "personality", "mcp-status", "mcp", "compact"]);
  assert.ok(names(commandSet({ agent: "codex", goalsEnabled: true })).includes("goal"));
});

test("an ACP agent (Reason) sees only its own commands, plan and fast", () => {
  assert.deepEqual(names(commandSet({ agent: "acp" })), []);
  const set = commandSet({ agent: "acp", agentCommands: [{ name: "review", description: "Review the diff" }], planMode: { isPlanMode: true } });
  assert.deepEqual(names(set), ["review", "plan"]);
  assert.equal(set[1]!.description, "Exit plan mode");
});

test("agent commands come first and hide a built-in of the same name; cloud drops add-dir", () => {
  const set = commandSet({ agent: "claude", agentCommands: [{ name: "compact", description: "Agent compact" }], isCloudWorkspace: true });
  assert.equal(set[0]!.description, "Agent compact");
  assert.equal(names(set).filter((n) => n === "compact").length, 1);
  assert.ok(!names(set).includes("add-dir"));
});

test("matching: empty query keeps order, exact name first", () => {
  const set = commandSet({ agent: "claude" });
  assert.deepEqual(names(matchCommands(set, "").map((m) => m.command)), names(set));
  const mcp = matchCommands(set, "mcp").map((m) => m.command.name);
  assert.equal(mcp[0], "mcp");
  assert.ok(mcp.includes("mcp-status"));
  assert.deepEqual(matchCommands(set, "zzz"), []);
  assert.deepEqual(matchCommands(set, "cle")[0]!.indices, [0, 1, 2]);
});

test("the menu is open while the caret is in a leading /word", () => {
  assert.equal(slashQuery("/", 1), "");
  assert.equal(slashQuery("/com", 4), "com");
  assert.equal(slashQuery("/compact now", 12), null);
  assert.equal(slashQuery("hi /com", 7), null);
  assert.equal(slashQuery("/com", 0), null);
});

test("picking completes the name and keeps arguments", () => {
  assert.equal(completeCommand("/co", "compact"), "/compact ");
  assert.equal(completeCommand("/go fix the tests", "goal"), "/goal fix the tests");
});

test("parse: /name args and /[name](command) args", () => {
  assert.deepEqual(parseSlashCommand("/compact", isKnownCommand), { name: "compact", args: "" });
  assert.deepEqual(parseSlashCommand("/goal ship it", isKnownCommand), { name: "goal", args: "ship it" });
  assert.deepEqual(parseSlashCommand("/[plan](command) now", isKnownCommand), { name: "plan", args: "now" });
  assert.equal(parseSlashCommand("/usr/bin is a path", isKnownCommand), null);
  assert.equal(parseSlashCommand("no slash", isKnownCommand), null);
});
