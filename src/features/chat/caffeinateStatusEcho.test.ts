import assert from "node:assert/strict";
import { before, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { onChatAttention } from "./attention.ts";
import { chatStatuses, connectStatusStore, hideChat, reportChatStatus, showChat, subscribeChatStatuses, type StatusStoreHost } from "./chatRuntime.ts";

type StatusWrite = { chatId: string; workspaceId: string; status: string };
type StatusPayload = Pick<StatusWrite, "chatId" | "status">;

function nativeStatusBoundary() {
  const listeners = new Map<string, Set<(wire: string) => void>>();
  const writes: StatusWrite[] = [];
  const pending: { write: StatusWrite; complete(): void }[] = [];
  let reads = 0;

  function emit(event: string, payload: StatusPayload) {
    const wire = JSON.stringify({ event, payload });
    for (const receive of listeners.get(event) ?? []) receive(wire);
  }

  const host: StatusStoreHost = {
    invoke(command, args) {
      if (command === "session_statuses") {
        reads++;
        return Promise.resolve([]);
      }
      assert.equal(command, "session_set_status", `Unexpected status boundary ${command}`);
      const { chatId, workspaceId, status } = args;
      assert.ok(typeof chatId === "string");
      assert.ok(typeof workspaceId === "string");
      assert.ok(typeof status === "string");
      const write = { chatId, workspaceId, status };
      writes.push(write);
      return new Promise<void>((resolve) => {
        pending.push({
          write,
          complete() {
            emit("session-status", { chatId, status });
            resolve();
          },
        });
      });
    },
    async listen<T>(event: string, fn: (e: { event: string; payload: T }) => void) {
      const receive = (wire: string) => fn(JSON.parse(wire));
      const callbacks = listeners.get(event) ?? new Set<(wire: string) => void>();
      listeners.set(event, callbacks);
      callbacks.add(receive);
      return () => callbacks.delete(receive);
    },
  };

  return {
    host,
    emit,
    writesFor: (chatId: string) => writes.filter((write) => write.chatId === chatId),
    pendingFor: (chatId: string) => pending.filter(({ write }) => write.chatId === chatId).map(({ write }) => write.status),
    get reads() { return reads; },
    get listenerCount() { return listeners.get("session-status")?.size ?? 0; },
    acknowledge(chatId: string, status: string) {
      const index = pending.findIndex(({ write }) => write.chatId === chatId);
      assert.notEqual(index, -1, `Missing pending native write for ${chatId}`);
      const [entry] = pending.splice(index, 1);
      assert.ok(entry);
      assert.equal(entry.write.status, status, "Native writes must reach the boundary in order");
      entry.complete();
    },
  };
}

const native = nativeStatusBoundary();
const settled = async () => { await setImmediate(); };
const statusesWritten = (id: string) => native.writesFor(id).map((write) => write.status);

async function acknowledgeWrites(id: string, statuses: readonly string[]) {
  for (const status of statuses) {
    await settled();
    assert.deepEqual(native.pendingFor(id), [status], "Only one native write per chat may be outstanding");
    native.acknowledge(id, status);
  }
  await settled();
  assert.deepEqual(native.pendingFor(id), []);
}

before(async () => {
  connectStatusStore(native.host);
  await settled();
  assert.equal(native.listenerCount, 1, "The canonical store must register the native callback");
  assert.equal(native.reads, 1, "The canonical store must finish its initial empty hydration");
});

test("hidden own-write echoes drain before the first external update after reopening", async () => {
  const id = "caffeinate-echo-hidden:review:1";
  const presentation: (string | undefined)[] = [];
  const attention: string[] = [];
  const offStatuses = subscribeChatStatuses(() => presentation.push(chatStatuses().get(id)));
  const offAttention = onChatAttention((chatId) => attention.push(chatId));
  try {
    hideChat(id);
    reportChatStatus(id, "working");
    reportChatStatus(id, "working");
    reportChatStatus(id, "waiting");
    await acknowledgeWrites(id, ["working", "waiting"]);
    assert.deepEqual(native.writesFor(id), [
      { chatId: id, workspaceId: "caffeinate-echo-hidden", status: "working" },
      { chatId: id, workspaceId: "caffeinate-echo-hidden", status: "waiting" },
    ]);
    assert.equal(chatStatuses().has(id), false);
    assert.deepEqual(presentation, []);
    assert.deepEqual(attention, []);

    showChat(id);
    native.emit("session-status", { chatId: id, status: "idle" });
    assert.equal(chatStatuses().get(id), "idle", "A drained hidden echo must not mask the first external update");
    native.emit("session-status", { chatId: id, status: "working" });
    assert.equal(chatStatuses().get(id), "working");
    assert.deepEqual(presentation, ["idle", "working"]);
    assert.deepEqual(attention, []);
  } finally {
    offStatuses();
    offAttention();
  }
});

test("visible writes stay ordered and their echoes never replace the latest local presentation", async () => {
  const id = "caffeinate-echo-visible:review:2";
  const presentation: (string | undefined)[] = [];
  const off = subscribeChatStatuses(() => presentation.push(chatStatuses().get(id)));
  try {
    reportChatStatus(id, "working");
    reportChatStatus(id, "working");
    reportChatStatus(id, "waiting");
    reportChatStatus(id, "idle");
    assert.equal(chatStatuses().get(id), "idle");
    for (const status of ["working", "waiting", "idle"]) {
      await settled();
      assert.deepEqual(native.pendingFor(id), [status]);
      native.acknowledge(id, status);
      assert.equal(chatStatuses().get(id), "idle", "An own-write echo must not regress the visible status");
    }
    await settled();
    assert.deepEqual(statusesWritten(id), ["working", "waiting", "idle"]);
    assert.deepEqual(presentation, ["working", "waiting", "idle"]);
    native.emit("session-status", { chatId: id, status: "waiting" });
    assert.equal(chatStatuses().get(id), "waiting");
    assert.deepEqual(presentation, ["working", "waiting", "idle", "waiting"]);
    assert.deepEqual(statusesWritten(id), ["working", "waiting", "idle"], "Native receipt must not persist a write back");
  } finally {
    off();
  }
});

test("closing while a write is pending drains its hidden echo before reopening", async () => {
  const id = "caffeinate-echo-close";
  reportChatStatus(id, "working");
  await settled();
  assert.deepEqual(native.pendingFor(id), ["working"]);
  hideChat(id);
  await acknowledgeWrites(id, ["working"]);
  assert.equal(chatStatuses().has(id), false, "A late own echo must not restore a hidden row");
  showChat(id);
  native.emit("session-status", { chatId: id, status: "waiting" });
  assert.equal(chatStatuses().get(id), "waiting", "The hidden acknowledgment must not consume this external update");
});

test("invalid native statuses do not consume a pending own-write echo", async () => {
  const id = "caffeinate-echo-invalid";
  reportChatStatus(id, "working");
  await settled();
  hideChat(id);
  showChat(id);
  native.emit("session-status", { chatId: id, status: "not-a-session-status" });
  native.emit("unrelated-event", { chatId: id, status: "idle" });
  assert.equal(chatStatuses().has(id), false);
  await acknowledgeWrites(id, ["working"]);
  assert.equal(chatStatuses().has(id), false, "Invalid input must not spend the suppression reserved for the genuine echo");
  native.emit("session-status", { chatId: id, status: "waiting" });
  assert.equal(chatStatuses().get(id), "waiting");
  assert.deepEqual(statusesWritten(id), ["working"]);
});

test("external hidden statuses never restore presentation, persist writes or request attention", () => {
  const id = "caffeinate-echo-hidden-external";
  const presentation: (string | undefined)[] = [];
  const attention: string[] = [];
  const offStatuses = subscribeChatStatuses(() => presentation.push(chatStatuses().get(id)));
  const offAttention = onChatAttention((chatId) => attention.push(chatId));
  try {
    hideChat(id);
    for (const status of ["working", "waiting", "needs_plan_response", "needs_user_input", "needs_user_permission", "invalid", "idle"]) {
      native.emit("session-status", { chatId: id, status });
      assert.equal(chatStatuses().has(id), false);
    }
    assert.deepEqual(presentation, []);
    assert.deepEqual(attention, []);
    assert.deepEqual(native.writesFor(id), []);
    showChat(id);
    native.emit("session-status", { chatId: id, status: "needs_user_input" });
    assert.equal(chatStatuses().get(id), "needs_user_input");
    assert.deepEqual(presentation, ["needs_user_input"]);
    assert.deepEqual(attention, [], "Native status receipt alone must not synthesize local attention");
  } finally {
    offStatuses();
    offAttention();
  }
});

test("local attention still signals genuine visible waits but not duplicates, own echoes or hidden writes", async () => {
  const id = "caffeinate-echo-attention";
  const attention: string[] = [];
  const off = onChatAttention((chatId) => attention.push(chatId));
  try {
    reportChatStatus(id, "working");
    reportChatStatus(id, "needs_plan_response");
    reportChatStatus(id, "needs_plan_response");
    assert.deepEqual(attention, [id]);
    reportChatStatus(id, "needs_user_permission");
    reportChatStatus(id, "needs_user_input");
    assert.deepEqual(attention, [id], "Leaving a higher-priority permission wait must not request attention twice");
    reportChatStatus(id, "working");
    reportChatStatus(id, "needs_user_input");
    assert.deepEqual(attention, [id, id], "A fresh visible input wait must still request attention");
    await acknowledgeWrites(id, ["working", "needs_plan_response", "needs_user_permission", "needs_user_input", "working", "needs_user_input"]);
    assert.deepEqual(attention, [id, id], "Own native echoes must not repeat attention");

    hideChat(id);
    reportChatStatus(id, "needs_plan_response");
    reportChatStatus(id, "needs_user_input");
    await acknowledgeWrites(id, ["needs_plan_response", "needs_user_input"]);
    assert.equal(chatStatuses().has(id), false);
    assert.deepEqual(attention, [id, id], "Hidden status persistence must remain silent");
  } finally {
    off();
  }
});
