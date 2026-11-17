// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { commandSet, completeCommand, completeInsert, isKnownCommand, matchCommands, parseSlashCommand, slashQuery } from "./slashCommands.ts";

const names = (cs: { name: string }[]) => cs.map((c) => c.name);

test("Claude's '/' menu lists implemented commands in order, then plan and fast", () => {
  // Only commands with working WorkspaceView handlers are listed (M13 fix: unimplemented commands
  // removed to prevent silent draft-clear-without-action on submit).
  assert.deepEqual(names(commandSet({ agent: "claude", planMode: { isPlanMode: false }, fastMode: { isFastMode: false } })), [
    "clear",
    "add-dir",
    "mcp-status",
    "plan",
    "fast",
  ]);
});

test("Codex gets only implemented commands; unimplemented ones removed", () => {
  // personality, goal, restart, mcp, compact removed (M13 fix).
  assert.deepEqual(names(commandSet({ agent: "codex" })), ["clear", "add-dir", "mcp-status"]);
  // goalsEnabled no longer adds goal since it is not wired.
  assert.ok(!names(commandSet({ agent: "codex", goalsEnabled: true })).includes("goal"));
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
  // "mcp" is removed; mcp-status is the only match.
  assert.equal(mcp[0], "mcp-status");
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
  // compact and goal are no longer in BUILTIN_COMMANDS so not recognised by isKnownCommand.
  assert.equal(parseSlashCommand("/compact", isKnownCommand), null);
  assert.equal(parseSlashCommand("/goal ship it", isKnownCommand), null);
  // plan and fast are special-cased in isKnownCommand regardless of BUILTIN_COMMANDS.
  assert.deepEqual(parseSlashCommand("/[plan](command) now", isKnownCommand), { name: "plan", args: "now" });
  assert.deepEqual(parseSlashCommand("/clear", isKnownCommand), { name: "clear", args: "" });
  assert.equal(parseSlashCommand("/usr/bin is a path", isKnownCommand), null);
  assert.equal(parseSlashCommand("no slash", isKnownCommand), null);
});

test("skills follow every command, keyed by name and path, and Codex inserts the selected path", () => {
  const skills = [
    { name: "deploy", description: "Ship it", path: "/u/.codex/skills/deploy/SKILL.md", displayName: "Deploy" },
    { name: "deploy", description: "Ship it", path: "/u/.codex/skills/deploy/SKILL.md" },
    { name: "notes", description: "Take notes", path: "/r/.agents/skills/notes/SKILL.md" },
  ];
  const codex = commandSet({ agent: "codex", agentCommands: [{ name: "review", description: "Review", argumentHint: "instructions" }], skills });
  assert.deepEqual(names(codex), ["review", "clear", "add-dir", "mcp-status", "Deploy", "notes"]);
  const deploy = codex.find((c) => c.name === "Deploy")!;
  assert.equal(deploy.effect, "skill");
  assert.equal(deploy.insert, "[$deploy](/u/.codex/skills/deploy/SKILL.md)");
  assert.equal(deploy.id, `skill:deploy|${encodeURIComponent("/u/.codex/skills/deploy/SKILL.md")}`);
  assert.equal(codex[0]!.argumentHint, "instructions");
  const reason = commandSet({ agent: "acp", skills: [{ name: "yc-cli", description: "YC", path: "reason-skill:s1" }] });
  assert.deepEqual(names(reason), ["yc-cli"]);
  assert.equal(reason[0]!.insert, "/yc-cli");
  assert.equal(completeInsert("/yc", "/yc-cli"), "/yc-cli ");
  assert.equal(completeInsert("/dep now", "$deploy"), "$deploy now");
});

test("filtering keeps commands before skills (Conductor's jNi)", () => {
  const set = commandSet({
    agent: "claude",
    agentCommands: [{ name: "compact", description: "Compact" }],
    skills: [{ name: "compact-notes", description: "A skill", path: "/s/compact-notes/SKILL.md" }],
  });
  // The skill matches "comp" better than the command would rank it, but commands come first.
  assert.deepEqual(
    matchCommands(set, "comp").map((m) => m.command.name),
    ["compact", "compact-notes"],
  );
  assert.deepEqual(names(matchCommands(set, "notes").map((m) => m.command)), ["compact-notes"]);
  assert.equal(matchCommands(set, "zzz").length, 0);
  // The empty query lists skills last too.
  assert.equal(matchCommands(set, "").at(-1)!.command.name, "compact-notes");
});
