// Run: node --test "src/**/*.test.ts"
// The chat runtime against a fake backend: queue -> prompt, steer, Stop
// (hard on the second), a Stop before the prompt was sent, and Reset chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportChatStatus } from "./chatStatusRegistry.ts";
import { chatStatuses, createChatRuntime, hideChat, subscribeChatStatuses, type ChatBackend, type ChatHost, type Deliver, type PromptRequest } from "./chatRuntime.ts";
import { applyReasonPayload, type ReasonPayload } from "./reason.ts";
import type { FileChange } from "../diff/types.ts";

type Config = string[];

function fakeBackend() {
  let deliver: Deliver = () => assert.fail("event before listen");
  const prompts: { req: PromptRequest; end: (r?: { turnChanges?: FileChange[] }) => void }[] = [];
  const calls = { listen: 0, open: [] as { chatId: string; cwd: string; sessionId: string | null; config: Config }[], cancel: [] as boolean[] };
  const backend: ChatBackend<Config> = {
    agent: "reason",
    canSteer: true,
    defaultConfig: ["default"],
    sessionKey: (chatId) => `fake.session.${chatId}`,
    configKey: (chatId) => `fake.config.${chatId}`,
    parseConfig: (v) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null),
    async listen(d) {
      calls.listen++;
      deliver = d;
    },
    async open(chatId, cwd, sessionId, config) {
      calls.open.push({ chatId, cwd, sessionId, config });
    },
    prompt(req) {
      return new Promise((resolve) => prompts.push({ req, end: (r = {}) => resolve(r) }));
    },
    cancel(_chatId, hard) {
      calls.cancel.push(hard);
    },
  };
  const emit = (p: ReasonPayload) => deliver(p.chatId, (s) => applyReasonPayload(s, p));
  return { backend, prompts, calls, emit };
}

function fakeHost() {
  const store = new Map<string, string>();
  const invoked: [string, Record<string, unknown>][] = [];
  const recorded: { turn: { sessionId: string; turnId: string }; files: FileChange[] }[] = [];
  const host: ChatHost = {
    persist: false,
    async invoke(cmd, args) {
      invoked.push([cmd, args]);
      return cmd === "checkpoint_exists" ? true : null;
    },
    recordTurnChanges: (turn, files) => recorded.push({ turn, files }),
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
  };
  return { host, store, invoked, recorded };
}

const settle = () => new Promise((r) => setImmediate(r));
const userTexts = (rt: ReturnType<typeof createChatRuntime>, chatId: string) =>
  rt.snapshot(chatId).transcript.messages.filter((m) => m.role === "user").map((m) => (m.blocks[0] as { text: string }).text);

test("a queued message is prompted once the running turn ends", async () => {
  const f = fakeBackend();
  const h = fakeHost();
  const rt = createChatRuntime(f.backend, h.host);
  const seen: string[] = [];
  rt.subscribe("c1", (s) => seen.push(s.queue.status));
  rt.configure("c1", ["model=x"]);

  rt.submit("c1", "/ws", "first", "queue", [], "/repo");
  rt.submit("c1", "/ws", "second", "queue");
  await settle();
  assert.equal(f.calls.listen, 1);
  assert.deepEqual(f.calls.open, [{ chatId: "c1", cwd: "/ws", sessionId: null, config: ["model=x"] }]);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.prompts[0]!.req.text, "first");
  assert.equal(f.prompts[0]!.req.firstMessage, true);
  assert.equal(f.prompts[0]!.req.repoPath, "/repo");
  assert.deepEqual(rt.snapshot("c1").queue.items.map((m) => m.text), ["second"]);
  assert.equal(rt.snapshot("c1").queue.status, "working");

  f.emit({ chatId: "c1", type: "sessionStarted", sessionId: "agent-1" });
  assert.equal(h.store.get("fake.session.c1"), "agent-1");
  f.emit({ chatId: "c1", type: "text", text: "done" });
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  const files: FileChange[] = [{ path: "a.ts", status: "modified", additions: 1, deletions: 0 } as unknown as FileChange];
  f.prompts[0]!.end({ turnChanges: files });
  await settle();

  assert.deepEqual(h.recorded, [{ turn: f.prompts[0]!.req.turn, files }]);
  assert.equal(f.prompts.length, 2);
  assert.equal(f.prompts[1]!.req.text, "second");
  assert.equal(f.prompts[1]!.req.firstMessage, false);
  assert.equal(f.calls.open.length, 1, "the session is opened once");
  assert.deepEqual(rt.snapshot("c1").queue.items, []);
  assert.deepEqual(userTexts(rt, "c1"), ["first", "second"]);
  assert.ok(seen.includes("working"));

  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  f.prompts[1]!.end();
  await settle();
  assert.equal(rt.snapshot("c1").queue.status, "idle");
  assert.equal(rt.snapshot("c1").transcript.activeTurn, null);
});

test("a steered follow-up goes to the backend while the turn runs", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  assert.equal(rt.canSteer, true);

  rt.submit("c1", "/ws", "first", "steer");
  await settle();
  rt.submit("c1", "/ws", "also this", "steer");
  await settle();
  assert.deepEqual(f.prompts.map((p) => p.req.text), ["first", "also this"]);
  assert.deepEqual(rt.snapshot("c1").queue.items, []);

  // The earlier prompt ends superseded; the steered turn keeps the session working.
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "superseded" } });
  assert.equal(rt.snapshot("c1").queue.status, "working");
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  assert.equal(rt.snapshot("c1").queue.status, "idle");
});

test("Stop cancels, a second Stop cancels hard, and the queue moves on", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  rt.submit("c1", "/ws", "long task", "queue");
  rt.submit("c1", "/ws", "next", "queue");
  await settle();

  rt.stop("c1");
  assert.deepEqual(f.calls.cancel, [false]);
  assert.equal(rt.snapshot("c1").queue.status, "cancelling");
  rt.stop("c1");
  assert.deepEqual(f.calls.cancel, [false, true]);

  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "cancelled" } });
  f.prompts[0]!.end();
  await settle();
  const first = rt.snapshot("c1").transcript.messages.find((m) => m.role === "user");
  assert.ok(first?.cancelledAt, "the stopped prompt is marked cancelled");
  assert.deepEqual(f.prompts.map((p) => p.req.text), ["long task", "next"]);
});

test("a Stop before the prompt reached the backend ends the turn cancelled without sending it", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  rt.submit("c1", "/ws", "never sent", "queue");
  rt.stop("c1");
  await settle();
  assert.deepEqual(f.calls.cancel, [false]);
  assert.equal(f.prompts.length, 0);
  const t = rt.snapshot("c1").transcript;
  assert.equal(t.activeTurn, null);
  assert.equal(Object.values(t.turns)[0]?.status, "cancelled");
  assert.equal(rt.snapshot("c1").queue.status, "idle");
});

test("a prompt the backend rejects fails its turn", async () => {
  const f = fakeBackend();
  f.backend.prompt = async () => {
    throw new Error("no CLI");
  };
  const rt = createChatRuntime(f.backend, fakeHost().host);
  rt.configureDefault("c1", Promise.reject(new Error("lookup failed")));
  rt.submit("c1", "/ws", "hi", "queue");
  await settle();
  assert.deepEqual(f.calls.open[0]?.config, ["default"], "a failed default lookup leaves the backend default");
  const turn = Object.values(rt.snapshot("c1").transcript.turns)[0];
  assert.equal(turn?.status, "failed");
  assert.match(turn?.error ?? "", /no CLI/);
  assert.equal(rt.snapshot("c1").queue.status, "error");
});

test("Reset chat restores the turn's end checkpoint, then drops later turns", async () => {
  const f = fakeBackend();
  const h = fakeHost();
  const rt = createChatRuntime(f.backend, h.host);
  for (const text of ["one", "two"]) {
    rt.submit("c1", "/ws", text, "queue");
    await settle();
    f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
    f.prompts.at(-1)!.end();
    await settle();
  }
  const firstTurn = rt.snapshot("c1").transcript.messages[0]!.turnId!;

  rt.submit("c1", "/ws", "three", "queue");
  await settle();
  await assert.rejects(rt.reset("c1", "/ws", firstTurn, true), /Stop the agent/);
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });

  await rt.reset("c1", "/ws", firstTurn, true);
  assert.deepEqual(h.invoked.map(([cmd]) => cmd), ["checkpoint_exists", "checkpoint_restore"]);
  assert.equal(h.invoked[0]![1].workspacePath, "/ws");
  assert.deepEqual(userTexts(rt, "c1"), ["one"]);
});

test("chat statuses span runtimes, and a hidden chat drops out", async () => {
  const a = fakeBackend();
  const b = fakeBackend();
  const ra = createChatRuntime(a.backend, fakeHost().host);
  const rb = createChatRuntime(b.backend, fakeHost().host);
  let changes = 0;
  const off = subscribeChatStatuses(() => changes++);
  ra.submit("status-a", "/ws", "hi", "queue");
  rb.submit("status-b", "/ws", "hi", "queue");
  await settle();
  assert.equal(chatStatuses().get("status-a"), "working");
  assert.equal(chatStatuses().get("status-b"), "working");
  assert.equal(changes, 2);

  b.emit({ chatId: "status-b", type: "turnEnded", end: { outcome: "completed" } });
  assert.equal(chatStatuses().get("status-b"), "idle");
  hideChat("status-b");
  assert.equal(chatStatuses().has("status-b"), false);
  assert.equal(chatStatuses().get("status-a"), "working");
  off();
});

test("a new chat is listed idle, and folds with another agent's status for the same chat", async () => {
  const rt = createChatRuntime(fakeBackend().backend, fakeHost().host);
  rt.snapshot("status-new");
  assert.equal(chatStatuses().has("status-new"), false, "listed after the current render");
  await settle();
  assert.equal(chatStatuses().get("status-new"), "idle");
  reportChatStatus("status-new", "codex", "needs_user_permission");
  assert.equal(chatStatuses().get("status-new"), "needs_user_permission");
});
