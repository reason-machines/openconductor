// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { codexSkillMessage, commandKey, commandLabel, commandSet, completeCommand, isKnownCommand, matchCommands, parseSlashCommand, skillMentions, slashQuery } from "./slashCommands.ts";

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

test("agent skills follow every command under a Skills header; a display name is shown and matched", () => {
  const set = commandSet({
    agent: "codex",
    agentCommands: [{ name: "review", description: "Review uncommitted changes", argumentHint: "instructions" }],
    agentSkills: [
      { name: "oc-fixture", description: "Fixture skill", path: "/h/.codex/skills/oc-fixture/SKILL.md" },
      { name: "pretty", description: "Pretty", path: "/w/.agents/skills/pretty/SKILL.md", displayName: "Pretty Skill" },
      { name: "oc-fixture", description: "dup", path: "/h/.codex/skills/oc-fixture/SKILL.md" },
    ],
  });
  assert.equal(set[0]!.name, "review");
  assert.equal(set[0]!.argumentHint, "instructions");
  const skills = set.filter((c) => c.effect === "skill");
  assert.deepEqual(names(skills), ["oc-fixture", "pretty"]);
  assert.equal(skills[0]!.skillPath, "/h/.codex/skills/oc-fixture/SKILL.md");
  assert.equal(commandLabel(skills[1]!), "Pretty Skill");
  assert.notEqual(commandKey(skills[0]!), commandKey({ ...skills[0]!, effect: "agent" }));

  const all = matchCommands(set, "");
  const first = all.findIndex((m) => m.command.effect === "skill");
  assert.ok(all.slice(0, first).every((m) => m.command.effect !== "skill"), "commands first");
  assert.deepEqual(all.filter((m) => m.showSkillHeader).map((m) => m.command.name), ["oc-fixture"]);

  // Typing filters: a skill that matches better still comes after the matching commands.
  const fix = matchCommands(set, "fix");
  assert.deepEqual(fix.map((m) => m.command.name), ["oc-fixture"]);
  assert.equal(fix[0]!.showSkillHeader, true);
  const r = matchCommands(set, "re").map((m) => m.command.name);
  assert.ok(r.indexOf("review") < r.indexOf("pretty"));
  assert.deepEqual(matchCommands(set, "Pretty S")[0]!.indices.slice(0, 2), [0, 1]);
});

test("Claude Code's own commands (its skills among them) come before Conductor's built-ins", () => {
  const set = commandSet({ agent: "claude", agentCommands: [{ name: "oc-fixture", description: "Fixture skill (user)" }, { name: "ocfix:oc-fixture", description: "(ocfix) Fixture skill" }] });
  assert.deepEqual(names(set).slice(0, 3), ["oc-fixture", "ocfix:oc-fixture", "clear"]);
  assert.equal(slashQuery("/ocfix:oc", 9), "ocfix:oc");
  assert.deepEqual(parseSlashCommand("/ocfix:oc-fixture go", (n) => set.some((c) => c.name === n)), { name: "ocfix:oc-fixture", args: "go" });
});

test("Codex skill mentions: $name of a known skill, once each, in order", () => {
  const skills = [
    { name: "oc-fixture", description: "", path: "/a/SKILL.md" },
    { name: "other", description: "", path: "/b/SKILL.md" },
  ];
  assert.deepEqual(skillMentions("$oc-fixture please, then $other and $oc-fixture again", skills), [
    { name: "oc-fixture", path: "/a/SKILL.md" },
    { name: "other", path: "/b/SKILL.md" },
  ]);
  assert.deepEqual(skillMentions("costs $5 and $unknown, not a$other", skills), []);
  assert.equal(codexSkillMessage("oc-fixture", "say hi"), "$oc-fixture say hi");
  assert.equal(codexSkillMessage("oc-fixture", ""), "$oc-fixture");
});
