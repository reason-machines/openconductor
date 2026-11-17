import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCodexPayload, codexChat, type CodexPayload } from "./codex.ts";

// Match the existing codexChat.test.ts host seam, never a real Codex process.
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,next) {
  try { return await next(s,c); } catch(e) { if(s.startsWith('.') && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s+'.ts',c); throw e; }
}`), import.meta.url);
const callbacks = new Map<number, (event: { payload: unknown }) => void>();
const eventOf = new Map<number, string>();
const store = new Map<string, string>();
const prompts = new Map<string, () => void>();
let next = 1;
const g = globalThis as Record<string, unknown>;
g.isTauri = true;
g.window = globalThis;
g.localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
g.__TAURI_INTERNALS__ = {
  transformCallback(fn: (event: { payload: unknown }) => void) { const id = next++; callbacks.set(id, fn); return id; },
  async invoke(command: string, args: Record<string, unknown> = {}) {
    if (command === "plugin:event|listen") { eventOf.set(args.handler as number, args.event as string); return 1; }
    if (command === "chat_messages_load") return { messages: [], agentSessionId: null };
    if (command === "codex_prompt") return new Promise<void>((resolve) => prompts.set(args.chatId as string, resolve));
    return null;
  },
};
const codex = await import("./codexChat.ts");
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const payload = (chatId: string, context: unknown) => ({ chatId, type: "contextUsage", context }) as unknown as CodexPayload;
function emit(chatId: string, context: unknown) {
  for (const [id, callback] of callbacks) if (eventOf.get(id) === "codex-chat-event") callback({ payload: payload(chatId, context) });
}

test("Codex pure context step is independent of transcript and open turns", () => {
  const state = codexChat("codex-context");
  const result = applyCodexPayload(state, payload(state.chatId, { kind: "sample", totalTokens: 71, contextWindow: 100 }));
  assert.ok(result, "Codex reducer must accept its real additive provider payload");
  assert.deepEqual((result as unknown as { context: unknown }).context, { kind: "sample", totalTokens: 71, contextWindow: 100 });
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
});

test("actual Codex runtime notifies for context-only latest samples, persists reset, and isolates chats", async () => {
  const id = "codex-context-only";
  let notifications = 0;
  codex.subscribeCodex(id, () => notifications++);
  // Open the event listener on another chat, not the context-only target.
  codex.submitCodex("codex-context-bootstrap", "/synthetic", { text: "listen" });
  await settle(); await settle(); await settle();
  const before = notifications;
  emit(id, { kind: "sample", totalTokens: 71, contextWindow: 100 });
  const sample = () => (codex.codexSnapshot(id) as unknown as { contextUsage?: { totalTokens?: number; contextWindow?: number } }).contextUsage;
  assert.equal(sample()?.totalTokens, 71, "native payload must reach the actual Codex snapshot");
  assert.equal(sample()?.contextWindow, 100);
  assert.ok(notifications > before, "context-only payload must publish without a fake transcript event");
  emit(id, { kind: "sample", totalTokens: 19, contextWindow: 100 });
  assert.equal(sample()?.totalTokens, 19, "latest replaces cumulative totals");
  assert.equal(codex.codexSnapshot(id).transcript.messages.length, 0);
  emit(id, { kind: "reset" });
  assert.equal(sample()?.totalTokens, 0);
  // A fresh module instance recreates the actual singleton runtime from storage.
  const reloadPath = "./codexChat.ts?context-reset-reload";
  const reloaded = await import(reloadPath);
  assert.equal((reloaded.codexSnapshot(id) as unknown as { contextUsage?: { totalTokens?: number } }).contextUsage?.totalTokens, 0);
  assert.equal((reloaded.codexSnapshot("another-chat") as unknown as { contextUsage?: unknown }).contextUsage, undefined);
  prompts.get("codex-context-bootstrap")?.();
});
