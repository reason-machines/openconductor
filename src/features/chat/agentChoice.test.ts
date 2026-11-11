import { test } from "node:test";
import assert from "node:assert/strict";
import { saveAgent, savedAgent, initializeChatAgent } from "./agentChoice.ts";
import { DEFAULT_SETTINGS } from "../../settings/types.ts";

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

test("new chats inherit each connected runtime, while explicit picks and old chats remain unchanged", () => {
  for (const agent of ["reason", "claude", "codex"] as const) {
    const storage = memory();
    const settings = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default_agent: agent, default_initialized: true } };
    initializeChatAgent("new-workspace", settings, storage);
    initializeChatAgent("new-tab", settings, storage);
    assert.equal(savedAgent("new-workspace", storage), agent);
    assert.equal(savedAgent("new-tab", storage), agent);
    saveAgent("picked", "codex", storage);
    initializeChatAgent("picked", settings, storage);
    assert.equal(savedAgent("picked", storage), "codex");
    assert.equal(savedAgent("old-unpicked-chat", storage), "reason");
  }
});

test("legacy settings keep Reason as their new-chat runtime", () => {
  const storage = memory();
  initializeChatAgent("legacy-new", DEFAULT_SETTINGS, storage);
  assert.equal(savedAgent("legacy-new", storage), "reason");
});

test("an unknown saved value falls back to Reason", () => {
  const s = memory();
  s.setItem("openconductor.agent.ws1", "gemini");
  assert.equal(savedAgent("ws1", s), "reason");
});
