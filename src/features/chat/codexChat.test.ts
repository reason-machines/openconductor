// Run: node --test "src/**/*.test.ts"
// The Codex chat against a fake Tauri: `invoke` answers from per-test
// handlers and `codex-chat-event` payloads are emitted by hand, as the
// backend sends them. Chats are module singletons, so each test uses its own
// chat id.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

// Some chat imports omit `.ts` (Vite resolves them); resolve those here.
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

const callbacks = new Map<number, (e: { event: string; payload: unknown }) => void>();
const eventOf = new Map<number, string>();
const prompts = new Map<string, () => void>();
let nextCallback = 1;
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.isTauri = true;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
g.window = globalThis;
g.__TAURI_INTERNALS__ = {
  transformCallback: (fn: (e: { event: string; payload: unknown }) => void) => {
    const id = nextCallback++;
    callbacks.set(id, fn);
    return id;
  },
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    if (cmd === "plugin:event|listen") {
      eventOf.set(args.handler as number, args.event as string);
      return 1;
    }
    // A prompt resolves when its turn ends, as `codex_prompt` does.
    if (cmd === "codex_prompt") return new Promise<void>((resolve) => prompts.set(args.chatId as string, resolve));
    return null;
  },
};

const codex = await import("./codexChat.ts");
const { onChatAttention } = await import("./attention.ts");

function emit(payload: Record<string, unknown>) {
  for (const [id, fn] of callbacks) if (eventOf.get(id) === "codex-chat-event") fn({ event: "codex-chat-event", payload });
}

async function until(cond: () => boolean, what: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

const consent = (chatId: string, requestId: number, kind: "elicitation" | "permissions") => ({
  chatId,
  type: "consent",
  requestId,
  kind,
  turnId: "t1",
  serverName: kind === "permissions" ? "codex" : "linear",
  message: "Which team?",
  mode: kind === "elicitation" ? "form" : null,
  requestedSchema: kind === "elicitation" ? { type: "object", properties: {} } : null,
  url: null,
  reason: null,
  cwd: null,
  permissions: kind === "permissions" ? { network: { enabled: true } } : null,
});

async function running(chatId: string) {
  codex.submitCodex(chatId, "/ws", "hi");
  await until(() => prompts.has(chatId), "codex_prompt");
  emit({ chatId, type: "turnStarted", turnId: "t1" });
}

test("an MCP elicitation asks for attention once; a second one while it waits asks again; a re-send does not", async () => {
  const chatId = "codex-elicit";
  const asked: string[] = [];
  const off = onChatAttention((id) => id === chatId && asked.push(id));
  await running(chatId);
  assert.deepEqual(asked, []);

  emit(consent(chatId, 7, "elicitation"));
  assert.equal(codex.codexSnapshot(chatId).queue.status, "needs_user_input");
  assert.deepEqual(asked, [chatId], "Conductor's _p after CODEX_MCP_ELICITATION");
  emit(consent(chatId, 7, "elicitation"));
  assert.deepEqual(asked, [chatId], "the same request again is not a new wait");
  emit(consent(chatId, 8, "permissions"));
  assert.deepEqual(asked, [chatId, chatId], "Conductor's _p after CODEX_PERMISSION_APPROVAL");
  off();
});

test("a consent while a tool approval waits asks for attention, as does the approval", async () => {
  const chatId = "codex-approval-consent";
  const asked: string[] = [];
  const off = onChatAttention((id) => id === chatId && asked.push(id));
  await running(chatId);

  emit({ chatId, type: "approval", requestId: 1, kind: "command", itemId: "exec-1", command: "ls", cwd: "/ws", reason: null, decisions: ["accept", "cancel"] });
  assert.equal(codex.codexSnapshot(chatId).queue.status, "needs_user_permission");
  assert.deepEqual(asked, [chatId]);
  emit(consent(chatId, 9, "elicitation"));
  assert.equal(codex.codexSnapshot(chatId).queue.status, "needs_user_permission", "the approval outranks the consent");
  assert.deepEqual(asked, [chatId, chatId]);
  off();
});
