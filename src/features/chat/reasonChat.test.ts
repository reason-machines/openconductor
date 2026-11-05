// Run: node --test "src/**/*.test.ts"
// The chat runtime against a fake Tauri: `invoke` answers from per-test
// handlers and `reason-chat-event` payloads are emitted by hand. Chats are
// module singletons, so each test uses its own chat id.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

// reasonChat's imports omit `.ts` in places (Vite resolves them); resolve those here.
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

type Handler = (args: Record<string, unknown>) => unknown;
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const handlers = new Map<string, Handler>();
const callbacks = new Map<number, (e: { event: string; payload: unknown }) => void>();
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
    calls.push({ cmd, args });
    if (cmd === "plugin:event|listen") return 1;
    const h = handlers.get(cmd);
    return h ? h(args) : null;
  },
};

const rc = await import("./reasonChat.ts");

function emit(payload: Record<string, unknown>) {
  for (const fn of callbacks.values()) fn({ event: "reason-chat-event", payload });
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean, what: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const callsOf = (cmd: string, chatId: string) => calls.filter((c) => c.cmd === cmd && c.args.chatId === chatId);

/** A stored `full_message` row. */
function row(chatId: string, turnId: string, id: string, role: "user" | "assistant", text: string, turn?: object) {
  return JSON.stringify({ id, sessionId: chatId, turnId, role, createdAt: "2026-11-01T10:00:00.000Z", blocks: [{ type: "text", text }], ...(turn ? { turn } : {}) });
}

/** reason_prompt resolves once the test ends the turn. */
function promptsEndOnDemand() {
  const ends: (() => void)[] = [];
  handlers.set("reason_prompt", (args) => {
    const d = deferred<object>();
    ends.push(() => {
      emit({ chatId: args.chatId, type: "turnEnded", end: { outcome: "completed" } });
      d.resolve({ outcome: "completed" });
    });
    return d.promise;
  });
  return ends;
}

test("a prompt sent while the stored transcript loads waits for it, then runs after the stored turns on the stored Session", async () => {
  const chatId = "race-1";
  const load = deferred<{ messages: string[]; agentSessionId: string | null }>();
  handlers.set("chat_messages_load", (a) => (a.chatId === chatId ? load.promise : { messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();

  rc.submitChat(chatId, "/w", "new prompt", "queue");
  await tick();
  assert.equal(callsOf("reason_prompt", chatId).length, 0, "nothing is sent before the stored transcript is in");

  const turn = { status: "completed", startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T10:00:01.000Z" };
  load.resolve({
    messages: [row(chatId, `${chatId}:old`, "u1", "user", "old prompt", turn), row(chatId, `${chatId}:old`, "a1", "assistant", "old answer")],
    agentSessionId: "sess-old",
  });
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");

  const open = callsOf("reason_open_chat", chatId);
  assert.equal(open.length, 1);
  assert.equal(open[0].args.sessionId, "sess-old", "the stored Session is resumed, not replaced");
  assert.equal(callsOf("reason_prompt", chatId)[0].args.text, "new prompt");
  const texts = rc.chatSnapshot(chatId).transcript.messages.map((m) => m.blocks[0]?.type === "text" ? m.blocks[0].text : "");
  assert.deepEqual(texts.slice(0, 3), ["old prompt", "old answer", "new prompt"]);
  ends.shift()!();
});

test("Stop while the stored transcript loads cancels the prompt without sending it", async () => {
  const chatId = "race-2";
  const load = deferred<{ messages: string[]; agentSessionId: string | null }>();
  handlers.set("chat_messages_load", (a) => (a.chatId === chatId ? load.promise : { messages: [], agentSessionId: null }));
  promptsEndOnDemand();

  rc.submitChat(chatId, "/w", "never sent", "queue");
  await tick();
  rc.stopChat(chatId);
  load.resolve({ messages: [], agentSessionId: null });
  await until(() => rc.chatSnapshot(chatId).transcript.activeTurn === null && rc.chatSnapshot(chatId).transcript.messages.length > 0, "the cancelled turn");

  assert.equal(callsOf("reason_prompt", chatId).length, 0);
  const t = rc.chatSnapshot(chatId).transcript;
  assert.equal(Object.values(t.turns)[0]?.status, "cancelled");
  assert.equal(rc.chatSnapshot(chatId).queue.status, "idle");
});

test("the chat's Session is created with its model and effort, waiting for options still being read", async () => {
  const chatId = "config-1";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();
  const settings = deferred<{ id: string; value: string }[]>();
  rc.configureReasonDefault(chatId, settings.promise);

  rc.submitChat(chatId, "/w", "hello", "queue");
  await tick();
  assert.equal(callsOf("reason_open_chat", chatId).length, 0, "the Session waits for its options");
  settings.resolve([{ id: "model", value: "byok:anthropic:claude-opus-5-5" }, { id: "reasoning_effort", value: "high" }]);
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");
  assert.deepEqual(callsOf("reason_open_chat", chatId)[0].args.config, [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "high" },
  ]);
  ends.shift()!();
});

test("a chat's picked options win over the Settings defaults and are kept for a later Session", async () => {
  const chatId = "config-2";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();
  const own = [{ id: "model", value: "byok:openai-codex:gpt-5.6-sol" }];
  rc.configureReason(chatId, own);
  rc.configureReasonDefault(chatId, Promise.resolve([{ id: "model", value: "byok:anthropic:claude-opus-5" }]));

  rc.submitChat(chatId, "/w", "hello", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");
  assert.deepEqual(callsOf("reason_open_chat", chatId)[0].args.config, own);
  assert.deepEqual(JSON.parse(store.get(`openconductor.reason.config.${chatId}`) ?? "null"), own);
  ends.shift()!();
});

test("Reset chat rewinds the agent: the next prompt opens a new Session that carries only the kept turns", async () => {
  const chatId = "reset-1";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const saves: Record<string, unknown>[] = [];
  handlers.set("chat_messages_save", (a) => void (a.chatId === chatId && saves.push(a)));
  const ends = promptsEndOnDemand();
  const turn = async (text: string, answer: string) => {
    const before = callsOf("reason_prompt", chatId).length;
    rc.submitChat(chatId, "/w", text, "queue");
    await until(() => callsOf("reason_prompt", chatId).length === before + 1, `prompt "${text}"`);
    if (!store.get(`openconductor.reason.session.${chatId}`)) emit({ chatId, type: "sessionStarted", sessionId: "sess-1" });
    emit({ chatId, type: "text", text: answer });
    ends.shift()!();
    await until(() => rc.chatSnapshot(chatId).transcript.activeTurn === null, "turn end");
  };
  await turn("first", "first answer");
  await turn("second", "second answer");
  assert.equal(callsOf("reason_open_chat", chatId).length, 1);

  const firstTurn = rc.chatSnapshot(chatId).transcript.messages[0].turnId;
  await rc.resetReasonChat(chatId, "/w", firstTurn, false);
  assert.equal(store.get(`openconductor.reason.session.${chatId}`), undefined);
  await until(() => saves.some((s) => s.rewindTo !== undefined), "the rewind write");
  const rewind = saves.find((s) => s.rewindTo !== undefined)!;
  const kept = rc.chatSnapshot(chatId).transcript.messages;
  assert.equal(rewind.rewindTo, kept[kept.length - 1].id);
  assert.equal(rewind.agentSessionId, null);
  assert.ok(!JSON.stringify(rewind.upserts).includes("second"), "the deleted turn is not written back");

  rc.submitChat(chatId, "/w", "third", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 3, "the prompt after the reset");
  const open = callsOf("reason_open_chat", chatId);
  assert.equal(open.length, 2);
  assert.equal(open[1].args.sessionId, null, "a new Session, not the one that remembers the deleted turn");
  const sent = callsOf("reason_prompt", chatId)[2].args;
  assert.equal(sent.text, "third");
  const [carried] = sent.attachments as { name: string; text: string }[];
  assert.equal(carried.name, "Earlier conversation.md");
  assert.match(carried.text, /first answer/);
  assert.doesNotMatch(carried.text, /second/);
  ends.shift()!();
});
