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
/** Listener callback id → the event it listens to, as Tauri routes events by name. */
const eventOf = new Map<number, string>();
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
    if (cmd === "plugin:event|listen") {
      eventOf.set(args.handler as number, args.event as string);
      return 1;
    }
    const h = handlers.get(cmd);
    return h ? h(args) : null;
  },
};

// conductor.db's stored statuses, read once when reasonChat connects the status store at import.
handlers.set("session_statuses", () => [
  { chatId: "ws-stored", workspaceId: "ws-stored", status: "needs_user_input" },
  { chatId: "ws-stored:review:1", workspaceId: "ws-stored", status: "waiting" },
]);
const rc = await import("./reasonChat.ts");
const runtime = await import("./chatRuntime.ts");

function emitTo(event: string, payload: Record<string, unknown>) {
  for (const [id, fn] of callbacks) if (eventOf.get(id) === event) fn({ event, payload });
}

function emit(payload: Record<string, unknown>) {
  emitTo("reason-chat-event", payload);
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

test("a turn that completes with nothing queued asks for attention; one with a follow-up queued does not", async () => {
  const { onChatAttention } = await import("./attention.ts");
  const chatId = "attention-1";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();
  const asked: string[] = [];
  const off = onChatAttention((id) => id === chatId && asked.push(id));

  rc.submitChat(chatId, "/w", "first", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 1, "first prompt");
  rc.submitChat(chatId, "/w", "second", "queue");
  ends.shift()!();
  await until(() => callsOf("reason_prompt", chatId).length === 2, "queued prompt starts");
  assert.deepEqual(asked, [], "the queued follow-up runs next, so the chat has not settled");

  ends.shift()!();
  await until(() => asked.length === 1, "attention after the last turn");
  assert.deepEqual(asked, [chatId]);
  off();
});

test("a new permission request asks for attention once, while the turn still runs", async () => {
  const { onChatAttention } = await import("./attention.ts");
  const chatId = "attention-perm";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();
  const asked: string[] = [];
  const off = onChatAttention((id) => id === chatId && asked.push(id));

  rc.submitChat(chatId, "/w", "permission", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");
  emit({ chatId, type: "permissionRequest", requestId: "permission-a", title: "t", options: [] });
  assert.deepEqual(asked, [chatId], "the request is a wait on the user");
  // The same request again (a re-send) is not a new wait.
  emit({ chatId, type: "permissionRequest", requestId: "permission-a", title: "t", options: [] });
  assert.deepEqual(asked, [chatId]);
  emit({ chatId, type: "permissionResolved", requestId: "permission-a" });
  ends.shift()!();
  await until(() => asked.length === 2, "attention when the turn settles");
  off();
});

function emitStatus(payload: Record<string, unknown>) {
  emitTo("session-status", payload);
}

/** session_set_status echoes each write back as a session-status event, as the backend does. */
function statusWritesEcho() {
  handlers.set("session_set_status", (a) => {
    setTimeout(() => emitStatus({ chatId: a.chatId, workspaceId: a.workspaceId, status: a.status }), 0);
    return null;
  });
}

test("stored statuses show at start, outside writes are applied and the chat's own writes do not echo", async () => {
  statusWritesEcho();
  const unsubscribe = runtime.subscribeChatStatuses(() => {});
  await until(() => runtime.chatStatuses().get("ws-stored") === "needs_user_input", "the stored status");
  assert.equal(runtime.chatStatuses().get("ws-stored:review:1"), "waiting");

  // Another writer (a test driver, another window) changes a chat.
  emitStatus({ chatId: "ws-stored", workspaceId: "ws-stored", status: "needs_plan_response" });
  assert.equal(runtime.chatStatuses().get("ws-stored"), "needs_plan_response");
  emitStatus({ chatId: "ws-stored", workspaceId: "ws-stored", status: "idle" });
  assert.equal(runtime.chatStatuses().get("ws-stored"), "idle", "an idle chat no longer counts as busy");

  // A closed chat no longer counts.
  runtime.hideChat("ws-stored:review:1");
  assert.equal(runtime.chatStatuses().has("ws-stored:review:1"), false);
  emitStatus({ chatId: "ws-stored:review:1", workspaceId: "ws-stored", status: "working" });
  assert.equal(runtime.chatStatuses().has("ws-stored:review:1"), false);
  unsubscribe();
});

test("a permission request makes the chat needs_user_permission until it is answered, and each status is stored", async () => {
  const chatId = "ws-perm:review:2";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  statusWritesEcho();
  const ends = promptsEndOnDemand();
  handlers.set("reason_answer_permission", (a) => {
    setTimeout(() => emit({ chatId: a.chatId, type: "permissionResolved", requestId: a.requestId }), 0);
    return true;
  });
  rc.submitChat(chatId, "/w", "permission", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");

  emit({ chatId, type: "permissionRequest", requestId: "permission-1", title: "bash: rm -rf build", options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }] });
  let snap = rc.chatSnapshot(chatId);
  assert.equal(snap.queue.status, "needs_user_permission");
  assert.deepEqual(snap.permissions.map((p) => p.title), ["bash: rm -rf build"]);
  assert.equal(runtime.chatStatuses().get(chatId), "needs_user_permission");
  await until(() => callsOf("session_set_status", chatId).some((c) => c.args.status === "needs_user_permission"), "the stored status");
  assert.equal(callsOf("session_set_status", chatId)[0].args.workspaceId, "ws-perm", "a review chat is stored under its workspace");

  await rc.answerPermission(chatId, "permission-1", "allow");
  assert.deepEqual(callsOf("reason_answer_permission", chatId)[0].args, { chatId, requestId: "permission-1", optionId: "allow" });
  await until(() => rc.chatSnapshot(chatId).queue.status === "working", "working again");
  snap = rc.chatSnapshot(chatId);
  assert.equal(snap.permissions.length, 0);

  ends.shift()!();
  await until(() => rc.chatSnapshot(chatId).queue.status === "idle", "idle");
  // The echoes of earlier writes never put back an old status.
  await until(() => callsOf("session_set_status", chatId).at(-1)?.args.status === "idle", "idle stored");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runtime.chatStatuses().get(chatId), "idle");
  assert.deepEqual(callsOf("session_set_status", chatId).map((c) => c.args.status), ["working", "needs_user_permission", "working", "idle"]);
});

test("a request Reason no longer holds closes at once", async () => {
  const chatId = "ws-perm-gone";
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  const ends = promptsEndOnDemand();
  handlers.set("reason_answer_permission", () => false);
  rc.submitChat(chatId, "/w", "permission", "queue");
  await until(() => callsOf("reason_prompt", chatId).length === 1, "reason_prompt");
  emit({ chatId, type: "permissionRequest", requestId: "permission-9", title: "t", options: [] });
  await rc.answerPermission(chatId, "permission-9", null);
  assert.equal(rc.chatSnapshot(chatId).permissions.length, 0);
  assert.equal(rc.chatSnapshot(chatId).queue.status, "working");
  ends.shift()!();
});

test("needs_user_permission never outlives its request: Stop withdraws it, and a turn that ends unanswered clears it", async () => {
  handlers.set("chat_messages_load", () => ({ messages: [], agentSessionId: null }));
  statusWritesEcho();

  // Stop: the backend answers the request cancelled (permissionResolved), then the turn ends cancelled.
  const stopped = "ws-perm-stop";
  handlers.set("reason_prompt", (args) => {
    const d = deferred<object>();
    handlers.set("reason_cancel", () => {
      emit({ chatId: args.chatId, type: "permissionResolved", requestId: "permission-s" });
      emit({ chatId: args.chatId, type: "turnEnded", end: { outcome: "cancelled" } });
      d.resolve({ outcome: "cancelled" });
      return null;
    });
    return d.promise;
  });
  rc.submitChat(stopped, "/w", "permission", "queue");
  await until(() => callsOf("reason_prompt", stopped).length === 1, "reason_prompt");
  emit({ chatId: stopped, type: "permissionRequest", requestId: "permission-s", title: "t", options: [] });
  assert.equal(runtime.chatStatuses().get(stopped), "needs_user_permission");
  rc.stopChat(stopped);
  await until(() => rc.chatSnapshot(stopped).queue.status === "idle", "idle after Stop");
  assert.equal(rc.chatSnapshot(stopped).permissions.length, 0);
  assert.equal(runtime.chatStatuses().get(stopped), "idle");

  // The turn ends with the request still listed (no permissionResolved came).
  const ended = "ws-perm-ended";
  const ends = promptsEndOnDemand();
  rc.submitChat(ended, "/w", "permission", "queue");
  await until(() => callsOf("reason_prompt", ended).length === 1, "reason_prompt");
  emit({ chatId: ended, type: "permissionRequest", requestId: "permission-e", title: "t", options: [] });
  assert.equal(rc.chatSnapshot(ended).queue.status, "needs_user_permission");
  ends.shift()!();
  await until(() => rc.chatSnapshot(ended).queue.status === "idle", "idle after the turn");
  assert.equal(rc.chatSnapshot(ended).permissions.length, 0);
  assert.equal(runtime.chatStatuses().get(ended), "idle");
  await until(() => callsOf("session_set_status", ended).at(-1)?.args.status === "idle", "idle stored");
});
