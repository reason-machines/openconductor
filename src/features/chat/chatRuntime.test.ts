// Run: node --test "src/**/*.test.ts"
// The chat runtime against a fake backend: queue -> prompt, steer, Stop
// (hard on the second), a Stop before the prompt was sent, and Reset chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatStatuses, createChatRuntime, hideChat, reportChatStatus, subscribeChatStatuses, type ChatBackend, type ChatHost, type Deliver, type PromptRequest } from "./chatRuntime.ts";
import { applyReasonPayload, type ReasonPayload } from "./reason.ts";
import { onChatAttention } from "./attention.ts";
import type { FileChange } from "../diff/types.ts";
import { submittedUserPrompt, withSentAttachmentDisplay } from "./userContent.ts";
import { writeComposerDraft } from "./composerDocument.ts";
import { restoreEvents, type StoredMessage } from "./persist.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

type Config = string[];

function fakeBackend() {
  let deliver: Deliver = () => assert.fail("event before listen");
  const prompts: { req: PromptRequest; end: (r?: { turnChanges?: FileChange[] }) => void }[] = [];
  const calls = { listen: 0, open: [] as { chatId: string; cwd: string; sessionId: string | null; config: Config }[], reconfigure: [] as { chatId: string; config: Config }[], cancel: [] as boolean[] };
  const backend: ChatBackend<Config> = {
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
    reconfigure(chatId, config) {
      calls.reconfigure.push({ chatId, config });
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

test("real runtime persists each rich sent snapshot without changing provider prompt or attachments", async () => {
  const f = fakeBackend();
  const h = fakeHost();
  const saved: StoredMessage[] = [];
  h.host.persist = true;
  h.host.invoke = async (cmd, args) => {
    if (cmd === "chat_messages_load") return { messages: [], agentSessionId: null };
    if (cmd === "chat_messages_save") saved.push(...args.upserts as StoredMessage[]);
    return null;
  };
  const rt = createChatRuntime(f.backend, h.host);
  const attached = [{ name: ".context/attachments/a.png", text: "provider bytes" }];
  const input = withSentAttachmentDisplay(submittedUserPrompt(writeComposerDraft([{ kind: "text", text: "Review " }, { kind: "file", path: "src/a.ts", label: "Custom", directory: false }])), attached, new Set([attached[0]!.name]));
  const other = { text: input.text, userContent: submittedUserPrompt(writeComposerDraft([{ kind: "file", path: "src/b.ts", label: "Other", directory: false }])).userContent };
  rt.submit("v1-one", "/ws", input, "queue", attached);
  rt.submit("v1-two", "/ws", other, "queue");
  await settle();
  assert.equal(f.prompts[0]?.req.text, input.text);
  assert.deepEqual(f.prompts[0]?.req.attachments, attached);
  assert.ok(!("userContent" in f.prompts[0]!.req));
  assert.deepEqual(rt.snapshot("v1-one").transcript.messages[0]?.userContent, input.userContent);
  assert.deepEqual(rt.snapshot("v1-two").transcript.messages[0]?.userContent, other.userContent);
  rt.submit("v1-one", "/ws", other, "steer");
  await settle();
  assert.deepEqual(rt.snapshot("v1-one").transcript.messages.filter((m) => m.role === "user").map((m) => m.userContent), [input.userContent, other.userContent]);
  f.emit({ chatId: "v1-one", type: "turnEnded", end: { outcome: "cancelled" } });
  f.emit({ chatId: "v1-one", type: "turnEnded", end: { outcome: "cancelled" } });
  f.emit({ chatId: "v1-two", type: "turnEnded", end: { outcome: "cancelled" } });
  for (const prompt of f.prompts) prompt.end();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const rows = saved.filter((row) => JSON.parse(row.fullMessage).sessionId === "v1-one");
  assert.ok(rows.length > 0, "actual ChatSaver persisted the user message");
  assert.equal(rows[0]?.content, input.text + "\n\nAttached: " + attached[0]!.name);
  const restored = applyChatEvents(emptyTranscript("v1-one"), restoreEvents("v1-one", rows.map((row) => row.fullMessage)));
  assert.ok(restored.ok);
  const user = buildRows(restored.transcript).find((row) => row.kind === "user");
  assert.equal(user?.kind, "user");
  if (user?.kind !== "user") assert.fail("missing rendered-model user row");
  assert.deepEqual(user.message.userContent, input.userContent);
  assert.equal(user.cancelled, true);
});

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

  rt.submit("c1", "/ws", { text: "first" }, "queue", [], "/repo", "source-workspace");
  rt.submit("c1", "/ws", { text: "second" }, "queue");
  await settle();
  assert.equal(f.calls.listen, 1);
  assert.deepEqual(f.calls.open, [{ chatId: "c1", cwd: "/ws", sessionId: null, config: ["model=x"] }]);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.prompts[0]!.req.text, "first");
  assert.equal(f.prompts[0]!.req.firstMessage, true);
  assert.equal(f.prompts[0]!.req.repoPath, "/repo");
  assert.equal(f.prompts[0]!.req.workspaceId, "source-workspace");
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
  assert.equal(f.prompts[1]!.req.workspaceId, "source-workspace");
  assert.equal(f.calls.open.length, 1, "the session is opened once");
  assert.deepEqual(rt.snapshot("c1").queue.items, []);
  assert.deepEqual(userTexts(rt, "c1"), ["first", "second"]);
  assert.ok(seen.includes("working"));

  f.emit({ chatId: "c1", type: "text", text: "Second answer" });
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  f.prompts[1]!.end();
  await settle();
  assert.equal(rt.snapshot("c1").queue.status, "idle");
  assert.equal(rt.snapshot("c1").transcript.activeTurn, null);
});

test("an empty Reason completion fails the queue visibly and preserves the prompt for retry", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  rt.submit("empty-reply", "/ws", { text: "sda" }, "queue");
  await settle();
  f.emit({ chatId: "empty-reply", type: "turnEnded", end: { outcome: "completed" } });
  f.prompts[0]!.end();
  await settle();
  const snap = rt.snapshot("empty-reply");
  assert.equal(snap.queue.status, "error");
  assert.match(Object.values(snap.transcript.turns)[0]?.error ?? "", /no reply/i);
  assert.deepEqual(userTexts(rt, "empty-reply"), ["sda"]);
  assert.equal(snap.transcript.messages.filter((m) => m.role === "assistant").length, 0);
});

test("a pick in a chat whose session is open goes to that session; before it opens, open carries it", async () => {
  const f = fakeBackend();
  const h = fakeHost();
  const rt = createChatRuntime(f.backend, h.host);
  rt.configure("c1", ["model=a"]);
  assert.deepEqual(f.calls.reconfigure, [], "no session yet: the pick waits for open");

  rt.submit("c1", "/ws", { text: "first" }, "queue");
  await settle();
  assert.deepEqual(f.calls.open.map((o) => o.config), [["model=a"]]);
  f.emit({ chatId: "c1", type: "sessionStarted", sessionId: "agent-1" });
  f.prompts[0]!.end();
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  await settle();

  // Conductor switches the running session's model (reconcileSessionConfig);
  // the chip and the agent agree without a Reset chat.
  rt.configure("c1", ["model=b"]);
  assert.deepEqual(f.calls.reconfigure, [{ chatId: "c1", config: ["model=b"] }]);
  rt.submit("c1", "/ws", { text: "second" }, "queue");
  await settle();
  assert.equal(f.calls.open.length, 1, "the same session continues");
  assert.equal(f.prompts.length, 2);
  assert.deepEqual(await rt.config("c1"), ["model=b"]);
});

test("a steered follow-up goes to the backend while the turn runs", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  assert.equal(rt.canSteer, true);

  rt.submit("c1", "/ws", { text: "first" }, "steer");
  await settle();
  rt.submit("c1", "/ws", { text: "also this" }, "steer");
  await settle();
  assert.deepEqual(f.prompts.map((p) => p.req.text), ["first", "also this"]);
  assert.deepEqual(rt.snapshot("c1").queue.items, []);

  // The earlier prompt ends superseded; the steered turn keeps the session working.
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "superseded" } });
  assert.equal(rt.snapshot("c1").queue.status, "working");
  f.emit({ chatId: "c1", type: "text", text: "Follow-up answer" });
  f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
  assert.equal(rt.snapshot("c1").queue.status, "idle");
});

test("Stop cancels, a second Stop cancels hard, and the queue moves on", async () => {
  const f = fakeBackend();
  const rt = createChatRuntime(f.backend, fakeHost().host);
  rt.submit("c1", "/ws", { text: "long task" }, "queue");
  rt.submit("c1", "/ws", { text: "next" }, "queue");
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
  rt.submit("c1", "/ws", { text: "never sent" }, "queue");
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
  rt.submit("c1", "/ws", { text: "hi" }, "queue");
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
    rt.submit("c1", "/ws", { text }, "queue");
    await settle();
    f.emit({ chatId: "c1", type: "turnEnded", end: { outcome: "completed" } });
    f.prompts.at(-1)!.end();
    await settle();
  }
  const firstTurn = rt.snapshot("c1").transcript.messages[0]!.turnId!;

  rt.submit("c1", "/ws", { text: "three" }, "queue");
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
  ra.submit("status-a", "/ws", { text: "hi" }, "queue");
  rb.submit("status-b", "/ws", { text: "hi" }, "queue");
  await settle();
  assert.equal(chatStatuses().get("status-a"), "working");
  assert.equal(chatStatuses().get("status-b"), "working");
  assert.equal(changes, 2);

  b.emit({ chatId: "status-b", type: "text", text: "Done" });
  b.emit({ chatId: "status-b", type: "turnEnded", end: { outcome: "completed" } });
  assert.equal(chatStatuses().get("status-b"), "idle");
  hideChat("status-b");
  assert.equal(chatStatuses().has("status-b"), false);
  assert.equal(chatStatuses().get("status-a"), "working");
  off();
});

test("a chat entering plan review or user input asks for attention once, as Conductor's _p after updateSessionStatus", () => {
  const asked: string[] = [];
  const off = onChatAttention((id) => id.startsWith("wait-") && asked.push(id));
  reportChatStatus("wait-plan", "working");
  reportChatStatus("wait-plan", "needs_plan_response");
  reportChatStatus("wait-plan", "needs_plan_response");
  assert.deepEqual(asked, ["wait-plan"], "ExitPlanMode's plan review, reported once");
  reportChatStatus("wait-question", "working");
  reportChatStatus("wait-question", "needs_user_input");
  assert.deepEqual(asked, ["wait-plan", "wait-question"], "AskUserQuestion or an MCP elicitation");
  // A tool approval signals per request (permissionEvents), not from its status.
  reportChatStatus("wait-tool", "working");
  reportChatStatus("wait-tool", "needs_user_permission");
  assert.deepEqual(asked, ["wait-plan", "wait-question"]);
  // Answered and asked again: a new wait.
  reportChatStatus("wait-plan", "working");
  reportChatStatus("wait-plan", "needs_plan_response");
  assert.deepEqual(asked, ["wait-plan", "wait-question", "wait-plan"]);
  // A closed chat tab no longer asks.
  hideChat("wait-hidden");
  reportChatStatus("wait-hidden", "needs_user_input");
  assert.deepEqual(asked, ["wait-plan", "wait-question", "wait-plan"]);
  off();
});
