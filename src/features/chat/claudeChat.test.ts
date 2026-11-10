import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) {
    if (s.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s + ".ts", c);
    throw e;
  }
}`),
  import.meta.url,
);

const store = new Map<string, string>();
const calls: { command: string; args: Record<string, unknown> }[] = [];
Object.assign(globalThis, {
  isTauri: true,
  window: globalThis,
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: Record<string, unknown> = {}) => {
      calls.push({ command, args });
      return {};
    },
  },
});

const { claudeBackend, claudeChatId } = await import("./claudeChat.ts");

async function prompt(workspaceId: string) {
  await claudeBackend.prompt({
    chatId: claudeChatId(workspaceId),
    cwd: "/ws",
    text: "hello",
    attachments: [],
    turn: { sessionId: workspaceId, turnId: "t1" },
    firstMessage: false,
    repoPath: null,
    workspaceId,
  });
  const call = calls.at(-1);
  assert.equal(call?.command, "claude_prompt");
  assert.ok(call);
  return call.args;
}

test("Claude sends base-chat local loadout picks on every prompt without changing another chat", async () => {
  const workspaceId = "claude-picked-options";
  const key = `openconductor.composer.model.${workspaceId}`;
  const otherKey = "openconductor.composer.model.other";
  store.set(key, JSON.stringify({ agent: "claude", model: "dynamic-claude", effort: "max" }));
  store.set(otherKey, JSON.stringify({ agent: "claude", model: "other-claude", effort: "low" }));
  const first = await prompt(workspaceId);
  assert.equal(first.chatId, `${workspaceId}:claude`);
  assert.deepEqual(first.options, { model: "dynamic-claude", effort: "max" });

  store.set(key, JSON.stringify({ agent: "claude", model: "next-claude", effort: null }));
  const next = await prompt(workspaceId);
  assert.deepEqual(next.options, { model: "next-claude" }, "no static effort is invented");
  const other = await prompt("other");
  assert.deepEqual(other.options, { model: "other-claude", effort: "low" });
});

test("Claude ignores a saved selection belonging to another agent", async () => {
  const workspaceId = "claude-unmatched-options";
  store.set(`openconductor.composer.model.${workspaceId}`, JSON.stringify({ agent: "codex", model: "dynamic-claude", effort: "high" }));
  const args = await prompt(workspaceId);
  assert.deepEqual(args.options, {});
});
