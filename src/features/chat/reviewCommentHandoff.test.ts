import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatRuntime, type ChatBackend, type ChatHost, type Deliver, type PromptRequest } from "./chatRuntime.ts";
import { applyReasonPayload, type PromptAttachment } from "./reason.ts";
import { localCommentStore } from "../diff/commentStore.ts";
import { newLocalComment, type DiffComment } from "../diff/comments.ts";

type ReviewAttachment = PromptAttachment & { commentId: string };
type HandoffRequest = PromptRequest & { onHandoff?: () => void };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const attachment = (commentId: string): ReviewAttachment => ({ name: `${commentId}.md`, text: `Review ${commentId}`, commentId });

async function fixture(firstState: DiffComment["state"] = "pending") {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const stores = new Map(["one", "two"].map((workspace) => [workspace, localCommentStore(storage, workspace)]));
  for (const [workspace, store] of stores) await store.add({ ...newLocalComment({ id: workspace, workspaceId: workspace, filePath: "example.ts", side: "new", start: 1, body: workspace, now: 1 }), state: workspace === "one" ? firstState : "pending" });
  const committed: { workspace: string; ids: string[] }[] = [];
  const requests: { req: HandoffRequest; resolve: () => void; reject: (reason: Error) => void }[] = [];
  let deliver: Deliver = () => assert.fail("event before listener setup");
  let open: () => Promise<void> = async () => undefined;
  const backend: ChatBackend<null> = {
    canSteer: true, defaultConfig: null,
    sessionKey: (id) => `session.${id}`, configKey: (id) => `config.${id}`, parseConfig: () => null,
    listen: async (listener) => { deliver = listener; },
    open: () => open(),
    prompt: (req) => new Promise((resolve, reject) => { requests.push({ req, resolve: () => resolve({}), reject }); }),
    cancel: () => undefined,
  };
  const host: ChatHost & { onPromptHandoff(workspace: string, attachments: readonly PromptAttachment[]): Promise<void> } = {
    persist: false, storage, invoke: async () => null, recordTurnChanges: () => undefined,
    onPromptHandoff: async (workspace, attachments) => {
      const ids = attachments.flatMap((a) => "commentId" in a && typeof a.commentId === "string" ? [a.commentId] : []);
      committed.push({ workspace, ids });
      const store = stores.get(workspace);
      assert.ok(store);
      await store.markReviewed(ids);
    },
  };
  const runtime = createChatRuntime(backend, host);
  return {
    runtime, requests, committed,
    openWith: (operation: () => Promise<void>) => { open = operation; },
    state: async (workspace = "one") => { const store = stores.get(workspace); assert.ok(store); return (await store.list())[0].state; },
    finish: async (index: number, outcome: "completed" | "failed" | "cancelled" = "completed") => {
      const request = requests[index]; assert.ok(request);
      deliver(request.req.chatId, (state) => applyReasonPayload(state, { chatId: request.req.chatId, type: "turnEnded", end: { outcome } }));
      request.resolve();
      await settle();
    },
  };
}

test("optimistic submission and a completed command do not commit review comments without handoff", async () => {
  const f = await fixture();
  f.runtime.submit("no-handoff", "/ws", { text: "review" }, "queue", [attachment("one")], undefined, "one");
  await settle();
  assert.equal(f.requests.length, 1);
  assert.equal(await f.state(), "pending");
  assert.deepEqual(f.committed, []);
  await f.finish(0);
  assert.equal(await f.state(), "pending");
  assert.deepEqual(f.committed, []);
});

for (const outcome of ["failed", "cancelled"] as const) {
  test(`a successful transport handoff commits once and a later ${outcome} turn does not restore eligibility`, async () => {
    const f = await fixture();
    f.runtime.submit(`after-${outcome}`, "/ws", { text: "review" }, "queue", [attachment("one")], undefined, "one");
    await settle();
    f.requests[0].req.onHandoff?.();
    f.requests[0].req.onHandoff?.();
    await settle();
    assert.deepEqual(f.committed, [{ workspace: "one", ids: ["one"] }]);
    assert.equal(await f.state(), "reviewed");
    await f.finish(0, outcome);
    assert.equal(await f.state(), "reviewed");
    assert.equal(f.committed.length, 1);
  });
}

test("pre-handoff rejection keeps eligibility and retry carries the exact review payload", async () => {
  const f = await fixture();
  const attachments = [attachment("one")];
  f.runtime.submit("retry", "/ws", { text: "review" }, "queue", attachments, undefined, "one");
  await settle();
  f.requests[0].reject(new Error("transport write rejected"));
  await settle();
  assert.equal(await f.state(), "pending");
  assert.deepEqual(f.committed, []);
  const user = f.runtime.snapshot("retry").transcript.messages.find((message) => message.role === "user");
  assert.ok(user);
  assert.equal(f.runtime.retryUnsent("retry", "/ws", { text: "review" }, user.turnId), true);
  await settle();
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[1].req.attachments, attachments);
  f.requests[1].req.onHandoff?.();
  await settle();
  assert.deepEqual(f.committed, [{ workspace: "one", ids: ["one"] }]);
  assert.equal(await f.state(), "reviewed");
  await f.finish(1);
});

test("stopping before the prompt transport is reached receives no handoff credit", async () => {
  const f = await fixture();
  let release: () => void = () => assert.fail("open did not begin");
  f.openWith(() => new Promise<void>((resolve) => { release = resolve; }));
  f.runtime.submit("stopped", "/ws", { text: "review" }, "queue", [attachment("one")], undefined, "one");
  await settle();
  f.runtime.stop("stopped");
  release();
  await settle();
  assert.equal(f.requests.length, 0);
  assert.equal(await f.state(), "pending");
  assert.deepEqual(f.committed, []);
});

test("handoff commits the captured workspace and comment, independent of another visible chat", async () => {
  const f = await fixture();
  f.runtime.submit("chat-one", "/one", { text: "review one" }, "queue", [attachment("one")], undefined, "one");
  f.runtime.submit("chat-two", "/two", { text: "review two" }, "queue", [attachment("two")], undefined, "two");
  await settle();
  f.requests.find(({ req }) => req.chatId === "chat-one")?.req.onHandoff?.();
  await settle();
  assert.equal(await f.state("one"), "reviewed");
  assert.equal(await f.state("two"), "pending");
  assert.deepEqual(f.committed, [{ workspace: "one", ids: ["one"] }]);
  await f.finish(0);
  await f.finish(1);
});

test("queue insertion keeps eligibility until that queued prompt actually hands off", async () => {
  const f = await fixture();
  f.runtime.submit("queued", "/ws", { text: "first" }, "queue", [], undefined, "one");
  f.runtime.submit("queued", "/ws", { text: "review second" }, "queue", [attachment("one")], undefined, "one");
  await settle();
  assert.equal(f.requests.length, 1);
  assert.equal(await f.state(), "pending");
  await f.finish(0, "cancelled");
  await settle();
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[1].req.attachments, [attachment("one")]);
  assert.deepEqual(f.committed, []);
  f.requests[1].req.onHandoff?.();
  await settle();
  assert.equal(await f.state(), "reviewed");
  assert.deepEqual(f.committed, [{ workspace: "one", ids: ["one"] }]);
  await f.finish(1);
});

test("a successful handoff does not revive a superseded review comment", async () => {
  const f = await fixture("superseded");
  f.runtime.submit("superseded", "/ws", { text: "review" }, "queue", [attachment("one")], undefined, "one");
  await settle();
  f.requests[0].req.onHandoff?.();
  await settle();
  assert.deepEqual(f.committed, [{ workspace: "one", ids: ["one"] }]);
  assert.equal(await f.state(), "superseded");
  await f.finish(0);
});
