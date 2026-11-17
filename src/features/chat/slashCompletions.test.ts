// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedAgentCommands, clearAgentCommandsCache, fetchAgentCommands, linkCodexSkills, type AgentCommands } from "./slashCompletions.ts";
import { commandSet, completeInsert } from "./slashCommands.ts";

const skills = [
  { name: "deploy", description: "Ship", path: "/u/.codex/skills/deploy/SKILL.md" },
  { name: "yc-cli", description: "YC", path: "reason-skill:s1" },
];

test("a known $skill becomes a link to its SKILL.md; others stay as typed", () => {
  assert.equal(linkCodexSkills("$deploy to staging", skills), "[$deploy](/u/.codex/skills/deploy/SKILL.md) to staging");
  assert.equal(linkCodexSkills("run $deploy.", skills), "run [$deploy](/u/.codex/skills/deploy/SKILL.md).");
  assert.equal(linkCodexSkills("costs $5 and $deployed", skills), "costs $5 and $deployed");
  // A Reason skill has no SKILL.md on disk, so it is never linked.
  assert.equal(linkCodexSkills("$yc-cli", skills), "$yc-cli");
  assert.equal(linkCodexSkills("a$deploy", skills), "a$deploy");
  assert.equal(linkCodexSkills("plain", []), "plain");
});

const duplicateSkills = [
  { name: "deploy", displayName: "Deploy", description: "User skill", path: "/u/.codex/skills/deploy/SKILL.md" },
  { name: "deploy", displayName: "Deploy", description: "Project skill", path: "/r/.agents/skills/deploy/SKILL.md" },
];

test("picking either same-name Codex skill preserves its path through draft completion and send conversion", () => {
  for (const available of [duplicateSkills, [...duplicateSkills].reverse()]) {
    const commands = commandSet({ agent: "codex", skills: available }).filter((command) => command.effect === "skill");
    assert.equal(commands.length, 2);
    for (const [index, command] of commands.entries()) {
      const selected = available[index]!;
      assert.equal(command.id, `skill:deploy|${encodeURIComponent(selected.path)}`);
      assert.equal(command.name, "Deploy");
      assert.ok(command.insert);
      const draft = completeInsert("/dep retain suffix", command.insert);
      const expected = `[$deploy](${selected.path}) retain suffix`;
      assert.equal(draft, expected, "the selected menu row must carry its path, not only its name");
      assert.equal(linkCodexSkills(draft, available), expected);
      assert.equal(linkCodexSkills(draft, [...available].reverse()), expected, "metadata reordering must not retarget a picked skill");
      assert.equal(linkCodexSkills(draft, []), expected, "an already picked path must survive absent metadata");
    }
  }
});

test("an explicit picked skill is preserved beside a typed name and typed names keep their existing first-match rule", () => {
  const picked = commandSet({ agent: "codex", skills: duplicateSkills }).filter((command) => command.effect === "skill")[1]!;
  assert.ok(picked.insert);
  const draft = `${picked.insert} then $deploy.`;
  assert.equal(linkCodexSkills(draft, duplicateSkills), `[$deploy](${duplicateSkills[1]!.path}) then [$deploy](${duplicateSkills[0]!.path}).`);
  assert.equal(linkCodexSkills("$deploy", duplicateSkills), `[$deploy](${duplicateSkills[0]!.path})`);
  assert.equal(linkCodexSkills("$deploy", [...duplicateSkills].reverse()), `[$deploy](${duplicateSkills[1]!.path})`);
});

test("Claude and Reason skill insertion keeps its existing slash form", () => {
  for (const agent of ["claude", "acp"] as const) {
    const commands = commandSet({ agent, skills: duplicateSkills }).filter((command) => command.effect === "skill");
    assert.equal(commands.length, 2);
    for (const command of commands) {
      assert.equal(command.insert, "/deploy");
      assert.equal(completeInsert("/dep retain suffix", command.insert!), "/deploy retain suffix");
    }
  }
});

test("one backend call per agent and folder; the answer is cached", async () => {
  clearAgentCommandsCache();
  const answer: AgentCommands = { slashCommands: [{ name: "review", description: "Review", argumentHint: "" }], skills, source: "agent" };
  const calls: unknown[] = [];
  const invoke = async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    return answer;
  };
  const [a, b] = await Promise.all([fetchAgentCommands("codex", "/ws", invoke), fetchAgentCommands("codex", "/ws", invoke)]);
  assert.equal(a, answer);
  assert.equal(b, answer);
  assert.deepEqual(calls, [["agent_slash_commands", { agentType: "codex", cwd: "/ws" }]]);
  assert.equal(cachedAgentCommands("codex", "/ws"), answer);
  assert.equal(cachedAgentCommands("claude", "/ws"), undefined);
  await fetchAgentCommands("claude", "/ws", invoke);
  assert.equal(calls.length, 2);
});

test("a failed call is not cached", async () => {
  clearAgentCommandsCache();
  let n = 0;
  const invoke = async () => {
    n++;
    if (n === 1) throw new Error("no CLI");
    return { slashCommands: [], skills: [], source: "scan" } satisfies AgentCommands;
  };
  await assert.rejects(fetchAgentCommands("reason", "/ws", invoke));
  assert.equal((await fetchAgentCommands("reason", "/ws", invoke)).source, "scan");
});
