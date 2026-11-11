import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatRuntime, type ChatBackend, type ChatHost, type Deliver, type PromptRequest } from "./chatRuntime.ts";
import { applyReasonPayload, type ReasonPayload } from "./reason.ts";
import { turnCheckpointRef } from "./checkpoints.ts";
import type { ChatMessage } from "./types.ts";
import { retryUserPrompt } from "./userContent.ts";

const tick = () => new Promise<void>((done) => setImmediate(done));

function fixture(chatId: string) {
  let connected = false;
  let deliver: Deliver = () => assert.fail("event before listen");
  const prompts: PromptRequest[] = [];
  const storage = new Map<string, string>();
  const backend: ChatBackend<null> = {
    canSteer: true,
    defaultConfig: null,
    parseConfig: () => null,
    sessionKey: (id) => `retry-queue.session.${id}`,
    configKey: (id) => `retry-queue.config.${id}`,
    async listen(next) { deliver = next; },
    async open() { if (!connected) throw new Error("Authentication required"); },
    async prompt(request) { prompts.push(request); return {}; },
    cancel() {},
  };
  const host: ChatHost = {
    persist: false,
    async invoke(command) { return command === "checkpoint_exists" ? true : null; },
    recordTurnChanges() {},
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: (key) => { storage.delete(key); },
    },
  };
  const runtime = createChatRuntime(backend, host);
  const emit = (payload: ReasonPayload) => deliver(chatId, (state) => applyReasonPayload(state, payload));
  return {
    runtime, prompts,
    connect() { connected = true; },
    snapshot: () => runtime.snapshot(chatId),
    async fail(text: string) {
      runtime.submit(chatId, "/synthetic/retry-queue", { text }, "queue");
      await tick();
      const snapshot = runtime.snapshot(chatId);
      const user = snapshot.transcript.messages.at(-1);
      assert.ok(user && user.role === "user");
      assert.equal(snapshot.transcript.turns[user.turnId]?.status, "failed");
      return user;
    },
    retry(user: ChatMessage) { return runtime.retryUnsent(chatId, "/synthetic/retry-queue", retryUserPrompt(user), user.turnId); },
    async finish(failed = false) {
      if (!failed) emit({ chatId, type: "text", text: "Synthetic reply" });
      emit({ chatId, type: "turnEnded", end: failed ? { outcome: "failed", message: "Synthetic retry failure" } : { outcome: "completed" } });
      await tick();
    },
  };
}

test("accepted retries keep original turns, deduplicate and stay ahead of later submissions", async () => {
  const f = fixture("retry-queue-order");
  const first = await f.fail("first");
  const second = await f.fail("second");
  f.connect();
  assert.equal(f.retry(first), true);
  assert.equal(f.retry(second), true);
  assert.equal(f.retry(second), false);
  f.runtime.submit("retry-queue-order", "/synthetic/retry-queue", { text: "later" }, "queue");
  await tick();
  assert.deepEqual(f.prompts.map((request) => request.text), ["first"]);
  await f.finish();
  assert.deepEqual(f.prompts.map((request) => request.text), ["first", "second"]);
  assert.deepEqual(f.prompts[1]?.turn, turnCheckpointRef("retry-queue-order", second.turnId));
  f.runtime.queueAction("retry-queue-order", { kind: "pause" });
  await f.finish();
  assert.equal(f.prompts.length, 2);
  f.runtime.queueAction("retry-queue-order", { kind: "resume" });
  await tick();
  assert.deepEqual(f.prompts.map((request) => request.text), ["first", "second", "later"]);
  assert.equal(f.snapshot().transcript.messages.filter((message) => message.role === "user").length, 3);
  await f.finish();
});

test("a failed continuation pauses the remaining retry until the existing resume action", async () => {
  const f = fixture("retry-queue-failure");
  const first = await f.fail("first");
  const second = await f.fail("second");
  f.connect();
  f.retry(first);
  f.retry(second);
  await tick();
  await f.finish(true);
  assert.equal(f.snapshot().queue.paused, true);
  assert.equal(f.prompts.length, 1);
  f.runtime.queueAction("retry-queue-failure", { kind: "resume" });
  await tick();
  assert.deepEqual(f.prompts[1]?.turn, turnCheckpointRef("retry-queue-failure", second.turnId));
  await f.finish();
});

test("deleting an accepted queued retry prevents its delivery", async () => {
  const f = fixture("retry-queue-remove");
  const first = await f.fail("first");
  const second = await f.fail("second");
  f.connect();
  f.retry(first);
  f.retry(second);
  const queued = f.snapshot().queue.items[0];
  assert.ok(queued);
  f.runtime.queueAction("retry-queue-remove", { kind: "delete", id: queued.id });
  await tick();
  await f.finish();
  assert.equal(f.prompts.length, 1);
  assert.equal(f.snapshot().queue.status, "idle");
  assert.equal(f.snapshot().transcript.turns[second.turnId]?.status, "failed");
});

test("a saved edit becomes a new turn without rewriting the original failed message", async () => {
  const f = fixture("retry-queue-edit");
  const first = await f.fail("first");
  const second = await f.fail("original second");
  f.connect();
  f.retry(first);
  f.retry(second);
  const queued = f.snapshot().queue.items[0];
  assert.ok(queued);
  f.runtime.queueAction("retry-queue-edit", { kind: "edit", id: queued.id });
  f.runtime.queueAction("retry-queue-edit", { kind: "saveEdit", input: { text: "edited second" }, steer: false });
  await tick();
  await f.finish();
  assert.equal(f.prompts[1]?.text, "edited second");
  assert.notDeepEqual(f.prompts[1]?.turn, turnCheckpointRef("retry-queue-edit", second.turnId));
  assert.equal(f.snapshot().transcript.turns[second.turnId]?.status, "failed");
  const original = f.snapshot().transcript.messages.find((message) => message.id === second.id);
  assert.ok(original);
  assert.equal(retryUserPrompt(original).text, "original second");
  await f.finish();
});

test("a retry whose original turn was reset away cannot leave the queue working", async () => {
  const f = fixture("retry-queue-reset");
  const first = await f.fail("first");
  const second = await f.fail("second");
  f.connect();
  f.retry(first);
  f.retry(second);
  await tick();
  await f.finish(true);
  await f.runtime.reset("retry-queue-reset", "/synthetic/retry-queue", first.turnId, false);
  assert.equal(f.snapshot().transcript.turns[second.turnId], undefined);
  f.runtime.queueAction("retry-queue-reset", { kind: "resume" });
  await tick();
  assert.equal(f.prompts.length, 1);
  assert.equal(f.snapshot().queue.status, "idle");
  assert.equal(f.snapshot().queue.items.length, 0);
});

test("explicitly steering a queued retry preserves its original turn identity", async () => {
  const f = fixture("retry-queue-steer");
  const first = await f.fail("first");
  const second = await f.fail("second");
  f.connect();
  f.retry(first);
  f.retry(second);
  const queued = f.snapshot().queue.items[0];
  assert.ok(queued);
  f.runtime.queueAction("retry-queue-steer", { kind: "steer", id: queued.id });
  await tick();
  assert.deepEqual(f.prompts.map((request) => request.turn), [first, second].map((user) => turnCheckpointRef("retry-queue-steer", user.turnId)));
  assert.equal(f.snapshot().transcript.messages.filter((message) => message.role === "user").length, 2);
  await f.finish();
  await f.finish();
});
