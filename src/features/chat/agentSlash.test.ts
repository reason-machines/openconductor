// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAgentSlash, fetchAgentSlash } from "./agentSlash.ts";

test("one lookup per agent and folder while fresh; a failure resolves with the error", async () => {
  clearAgentSlash();
  const calls: unknown[] = [];
  const call = async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    return { slashCommands: [{ name: "review", description: "Review", argumentHint: "x" }], skills: [{ name: "s", description: "d", path: "/s/SKILL.md" }] };
  };
  const a = await fetchAgentSlash("codex", "/w", call, 1000);
  await fetchAgentSlash("codex", "/w", call, 2000);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["fetch_slash_commands", { agentType: "codex", cwd: "/w" }]);
  assert.equal(a.skills[0]!.name, "s");
  await fetchAgentSlash("claude", "/w", call, 2000);
  await fetchAgentSlash("codex", "/w", call, 1000 + 31_000);
  assert.equal(calls.length, 3);

  const failed = await fetchAgentSlash("reason", "/w", async () => Promise.reject(new Error("no reason")), 0);
  assert.deepEqual(failed, { slashCommands: [], skills: [], error: "Error: no reason" });
  const partial = await fetchAgentSlash("reason", "/x", async () => ({ skills: [], slashCommands: [], error: "not signed in" }), 0);
  assert.equal(partial.error, "not signed in");
});
