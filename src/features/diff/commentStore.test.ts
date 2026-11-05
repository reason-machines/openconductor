// Run: node --experimental-strip-types --test src/features/diff/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { newLocalComment, threadKey, threadsOf } from "./comments.ts";
import { localCommentStore, localKey } from "./commentStore.ts";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const base = { workspaceId: "ws", filePath: "a.ts", side: "new" as const, start: 3, now: 0 };

test("local store keeps a thread: add, reply, resolve whole thread, mark sent", async () => {
  const kv = memory();
  let t = 100;
  const store = localCommentStore(kv, "ws", () => ++t);
  const root = newLocalComment({ ...base, id: "r", body: "why?" });
  await store.add(root);
  await store.add(newLocalComment({ ...base, id: "x", body: "because", replyTo: root }));
  let cs = await store.list();
  assert.equal(threadsOf(cs).length, 1);
  assert.equal(threadKey(cs[1]), "r");

  await store.resolve("r", true);
  cs = await store.list();
  assert.deepEqual(cs.map((c) => c.is_resolved), [true, true]);

  await store.markSent(["r"]);
  cs = await store.list();
  assert.deepEqual(cs.map((c) => c.state), ["sent", "pending"]);
  assert.ok(kv.m.has(localKey("ws")));
});

test("local store edits, deletes a root with its replies, and rejects empty bodies", async () => {
  const store = localCommentStore(memory(), "ws", () => 1);
  const root = newLocalComment({ ...base, id: "r", body: "one" });
  await store.add(root);
  await store.add(newLocalComment({ ...base, id: "x", body: "two", replyTo: root }));
  await store.add(newLocalComment({ ...base, id: "y", start: 9, body: "other" }));
  await store.edit("y", "  edited ");
  assert.equal((await store.list()).find((c) => c.id === "y")?.body, "edited");
  await assert.rejects(store.edit("y", "   "));
  await assert.rejects(store.add(newLocalComment({ ...base, id: "z", body: " " })));
  await store.remove("r");
  assert.deepEqual((await store.list()).map((c) => c.id), ["y"]);
});

test("local store ignores corrupt storage", async () => {
  const kv = memory();
  kv.setItem(localKey("ws"), "{not json");
  assert.deepEqual(await localCommentStore(kv, "ws").list(), []);
});
