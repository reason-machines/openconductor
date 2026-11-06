// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedAgentCommands, clearAgentCommandsCache, fetchAgentCommands, linkCodexSkills, type AgentCommands } from "./slashCompletions.ts";

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
