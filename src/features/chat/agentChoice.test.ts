import { test } from "node:test";
import assert from "node:assert/strict";
import { saveAgent, savedAgent } from "./agentChoice.ts";

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

test("a chat runs Reason until another agent is picked", () => {
  assert.equal(savedAgent("ws1", memory()), "reason");
});

test("the pick is kept per chat under main's key, so Codex picks made before Claude Code existed still hold", () => {
  const s = memory();
  s.setItem("openconductor.agent.ws1", "codex");
  saveAgent("ws1:review:1", "claude", s);
  assert.equal(savedAgent("ws1", s), "codex");
  assert.equal(savedAgent("ws1:review:1", s), "claude");
  assert.equal(savedAgent("ws2", s), "reason");
});

test("an unknown saved value falls back to Reason", () => {
  const s = memory();
  s.setItem("openconductor.agent.ws1", "gemini");
  assert.equal(savedAgent("ws1", s), "reason");
});
