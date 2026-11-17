import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatSaver } from "../../../src/features/chat/persist.ts";
import { applyChatEvents, emptyTranscript } from "../../../src/features/chat/reducer.ts";
import { LocalStorageClient, type Invoke } from "../../../src/lib/local-storage/client.ts";
import { memoryInvoke } from "../../../src/lib/local-storage/memory.ts";
import { COMPOSER_DRAFTS } from "../../../src/lib/local-storage/subsystems.ts";
import { ComposerDrafts } from "../../../src/lib/local-storage/composerDrafts.ts";
import { ComposerSession } from "../../../src/features/chat/composerSession.ts";

function deferred<T>() {
  let resolve: (value: T) => void = () => assert.fail("resolver not initialized");
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function transcript(text: string) {
  const result = applyChatEvents(emptyTranscript("fixture"), [{
    type: "upsert",
    message: { id: "user", sessionId: "fixture", turnId: "turn", role: "user", createdAt: "2026-11-12T00:00:00Z", blocks: [{ type: "text", text }] },
  }]);
  assert.ok(result.ok);
  return result.transcript;
}

function pending(promise: Promise<unknown>) {
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  return async () => { await Promise.resolve(); assert.equal(settled, false, "acknowledgment must remain pending"); };
}

test("actual ChatSaver drain waits for a write already started by background flush", { timeout: 3000 }, async () => {
  const saving = deferred<void>();
  const started = deferred<void>();
  const saver = new ChatSaver(async () => { started.resolve(); await saving.promise; }, 60000);
  saver.update(transcript("first"));
  const writing = saver.flush();
  await started.promise;
  const drain = saver.drain();
  try {
    await pending(drain)();
    saving.resolve();
    await drain;
    await writing;
  } finally { saving.resolve(); await writing; await saver.flush(); }
});

test("actual ChatSaver drain includes a transcript queued while its first save is active", { timeout: 3000 }, async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  const secondStarted = deferred<void>();
  const writes: string[] = [];
  const saver = new ChatSaver(async (batch) => {
    writes.push(batch.upserts[0]?.content ?? "");
    if (writes.length === 1) await first.promise;
    else { secondStarted.resolve(); await second.promise; }
  }, 60000);
  saver.update(transcript("first"));
  const writing = saver.flush();
  saver.update(transcript("second"));
  const drain = saver.drain();
  try {
    first.resolve();
    await secondStarted.promise;
    await pending(drain)();
    second.resolve();
    await drain;
    assert.deepEqual(writes, ["first", "second"]);
  } finally { first.resolve(); second.resolve(); await writing; await saver.flush(); }
});

test("actual ChatSaver drain reports a rejected save without changing background retry policy", { timeout: 3000 }, async () => {
  let failing = true;
  let writes = 0;
  const saver = new ChatSaver(async () => { writes++; if (failing) throw new Error("synthetic save failure"); }, 60000);
  saver.update(transcript("first"));
  await saver.flush();
  await assert.rejects(saver.drain(), /synthetic save failure/);
  assert.equal(writes, 1, "drain must not silently retry a failed write");
  failing = false;
  saver.update(transcript("second"));
  await saver.flush();
  await saver.drain();
  assert.equal(writes, 2, "a later normal change can acknowledge recovery");
});

test("actual LocalStorageClient drain waits for an in-flight mutating IPC", { timeout: 3000 }, async () => {
  const saving = deferred<void>();
  const store = memoryInvoke();
  const invoke: Invoke = async <T>(name: string, args?: Record<string, unknown>) => {
    assert.equal(name, "local_storage_set_entry");
    await saving.promise;
    return store<T>(name, args);
  };
  const client = new LocalStorageClient(invoke);
  const write = client.setEntry({ subsystem: "fixture", sizeLimit: 1000, id: "entry", content: "first" });
  const drain = client.drain();
  try {
    await pending(drain)();
    saving.resolve();
    await write;
    await drain;
  } finally { saving.resolve(); await write; }
});

test("actual LocalStorageClient drain cannot translate a logical refusal into success", { timeout: 3000 }, async () => {
  const client = new LocalStorageClient(memoryInvoke());
  assert.deepEqual(await client.setEntry({ subsystem: "fixture", sizeLimit: 0, id: "entry", content: "first" }), { success: false, reason: "entryTooLarge" });
  await assert.rejects(client.drain(), /entryTooLarge/);
});

test("actual ComposerDrafts drain includes work queued before the local-storage client sees it", { timeout: 3000 }, async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  const secondStarted = deferred<void>();
  const store = memoryInvoke();
  let writes = 0;
  const invoke: Invoke = async <T>(name: string, args?: Record<string, unknown>) => {
    assert.equal(name, "local_storage_set_entry");
    writes++;
    if (writes === 1) await first.promise;
    else { secondStarted.resolve(); await second.promise; }
    return store<T>(name, args);
  };
  const drafts = new ComposerDrafts(new LocalStorageClient(invoke));
  const saveFirst = drafts.save("first-chat", "first");
  const saveSecond = drafts.save("second-chat", "second");
  const drain = drafts.drain();
  try {
    await pending(drain)();
    first.resolve();
    await secondStarted.promise;
    await pending(drain)();
    second.resolve();
    await Promise.all([saveFirst, saveSecond, drain]);
    assert.equal(writes, 2);
  } finally { first.resolve(); second.resolve(); await Promise.all([saveFirst, saveSecond]); }
});

test("actual ComposerDrafts drain preserves a false save result despite its fulfilled continuation tail", { timeout: 3000 }, async () => {
  const drafts = new ComposerDrafts(new LocalStorageClient(memoryInvoke()), () => {});
  assert.equal(await drafts.save("chat", "x".repeat(COMPOSER_DRAFTS.sizeLimit + 1)), false);
  await assert.rejects(drafts.drain());
});

test("actual ComposerSession drain submits its debounced text and waits for acknowledgment", { timeout: 3000 }, async () => {
  const saving = deferred<boolean>();
  const started = deferred<void>();
  const values: string[] = [];
  const session = new ComposerSession("chat", {
    load: async () => "",
    save: async (_id, value) => { values.push(value); started.resolve(); return saving.promise; },
    clear: async () => {},
  });
  await session.connect();
  session.setDraft("latest draft");
  const drain = session.drain();
  try {
    await started.promise;
    await pending(drain)();
    saving.resolve(true);
    await drain;
    assert.deepEqual(values, ["latest draft"]);
  } finally { saving.resolve(true); session.disconnect(); }
});

test("actual ComposerSession drain treats a refused draft save as unsafe", { timeout: 3000 }, async () => {
  const session = new ComposerSession("chat", { load: async () => "", save: async () => false, clear: async () => {} });
  await session.connect();
  session.setDraft("not persisted");
  try { await assert.rejects(session.drain()); }
  finally { session.disconnect(); }
});

test("actual ComposerSession disconnect cannot erase a pending persistence obligation", { timeout: 3000 }, async () => {
  const saving = deferred<boolean>();
  const started = deferred<void>();
  const session = new ComposerSession("chat", {
    load: async () => "", save: async () => { started.resolve(); return saving.promise; }, clear: async () => {},
  });
  await session.connect();
  session.setDraft("keep after unmount");
  session.disconnect();
  await started.promise;
  const drain = session.drain();
  try {
    await pending(drain)();
    saving.resolve(true);
    await drain;
  } finally { saving.resolve(true); }
});
