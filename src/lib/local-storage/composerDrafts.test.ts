// Run: node --test src/lib/local-storage/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageClient, type Invoke } from "./client.ts";
import { ComposerDrafts, draftMessage } from "./composerDrafts.ts";
import { memoryInvoke } from "./memory.ts";
import { restoreComposerAttachments } from "../../features/chat/composerAttachments.ts";

function setup() {
  const calls: string[] = [];
  const inner = memoryInvoke();
  const spy: Invoke = (cmd, args) => {
    calls.push(cmd);
    return inner(cmd, args);
  };
  const client = new LocalStorageClient(spy);
  const logs: string[] = [];
  return { client, inner, calls, logs, drafts: new ComposerDrafts(client, (m) => logs.push(m)) };
}

test("a draft survives a new store (a relaunch) and is keyed by session", async () => {
  const { client, inner, drafts } = setup();
  assert.equal(await drafts.load("ws-1"), "");
  assert.equal(await drafts.save("ws-1", "fix the bug"), true);
  const after = new ComposerDrafts(client);
  assert.equal(await after.load("ws-1"), "fix the bug");
  assert.equal(await after.load("ws-2"), "");
  // Stored as the plain string when there are no attachments.
  assert.equal(await client.getEntry({ subsystem: "composer-drafts", id: "ws-1" }), "fix the bug");
  assert.equal(inner.subsystem("composer-drafts")?.sizeLimit, 5 * 1024 * 1024);
});

test("unchanged drafts are not rewritten and sent drafts are removed", async () => {
  const { drafts, calls, client } = setup();
  await drafts.save("s", "a");
  await drafts.save("s", "a");
  assert.equal(calls.filter((c) => c === "local_storage_set_entry").length, 1);
  await drafts.clear("s");
  assert.deepEqual(await client.listEntries("composer-drafts"), []);
  await drafts.clear("never-saved");
  assert.equal(calls.filter((c) => c === "local_storage_remove_entry").length, 1);
});

test("writes run in call order", async () => {
  const { drafts, client } = setup();
  await Promise.all([drafts.save("s", "1"), drafts.save("s", "12"), drafts.save("s", "123")]);
  assert.equal(await client.getEntry({ subsystem: "composer-drafts", id: "s" }), "123");
});

test("the reference's attachment shape is read; other values are dropped", async () => {
  const { client, drafts, logs } = setup();
  await client.setEntry({ subsystem: "composer-drafts", sizeLimit: 100, id: "a", content: { message: "hi", attachments: [] } });
  await client.setEntry({ subsystem: "composer-drafts", sizeLimit: 100, id: "b", content: 42 });
  assert.deepEqual(await drafts.load("a"), { message: "hi", attachments: [] });
  assert.equal(await drafts.load("b"), "");
  assert.equal(logs.length, 1);
  assert.equal(draftMessage({ message: "x" }), undefined);
});

test("staged attachment metadata survives a new store, even without draft text", async () => {
  const { client, drafts } = setup();
  const attachments = [{ name: ".context/attachments/abc123/notes.txt", text: "notes", label: "notes.txt", staged: ".context/attachments/abc123/notes.txt" }];
  await drafts.save("workspace-a", "", attachments);
  const after = new ComposerDrafts(client);
  assert.deepEqual(await after.load("workspace-a"), { message: "", attachments });
  assert.equal(await after.load("workspace-b"), "");
});

test("persisted attachment chips round-trip through the consumer decoder", async () => {
  const { client, drafts } = setup();
  const attachments = [{ name: ".context/attachments/abc123/notes.txt", text: "notes", label: "notes.txt", staged: ".context/attachments/abc123/notes.txt" }, { name: "review", text: "review comment" }];
  await drafts.save("a", "draft", attachments);
  const loaded = await new ComposerDrafts(client).load("a");
  assert.notEqual(typeof loaded, "string");
  if (typeof loaded === "string") throw new Error("attachment metadata lost");
  assert.deepEqual(restoreComposerAttachments(loaded.attachments), attachments);
  await drafts.save("a", "draft", attachments);
});

test("attachment removal persists without changing text and clear removes the whole draft", async () => {
  const { client, drafts, calls } = setup();
  const attachments = [{ name: ".context/attachments/abc123/notes.txt", text: "notes" }];
  await drafts.save("a", "same text", attachments);
  await drafts.save("b", "other draft", attachments);
  await drafts.save("a", "same text", []);
  const after = new ComposerDrafts(client);
  assert.equal(await after.load("a"), "same text");
  assert.deepEqual(await after.load("b"), { message: "other draft", attachments });
  assert.equal(calls.filter((c) => c === "local_storage_set_entry").length, 3);
  await after.clear("b");
  assert.equal(await new ComposerDrafts(client).load("b"), "");
  assert.equal(await new ComposerDrafts(client).load("a"), "same text");
});

test("a refused write reports false and logs", async () => {
  const { drafts, logs } = setup();
  assert.equal(await drafts.save("s", "x".repeat(5 * 1024 * 1024)), false);
  assert.match(logs[0], /Failed to persist composer draft for session s: entryTooLarge/);
});
