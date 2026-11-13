import { test } from "node:test";
import assert from "node:assert/strict";
import { composerPrompt, readComposerDraft, writeComposerDraft, type ComposerPart } from "./composerDocument.ts";
import { editedUserPrompt, parseSentUserContent, queuedUserDraft, retryUserPrompt, sentFileTarget, submittedUserPrompt, withSentAttachmentDisplay, type UserPrompt } from "./userContent.ts";
import * as Q from "./queue.ts";
import { plainText, type ChatMessage } from "./types.ts";
import { diffForSave, restoreEvents } from "./persist.ts";
import { applyChatEvents, emptyTranscript, truncateAfterTurn } from "./reducer.ts";
import { buildRows } from "./view.ts";
import { completeTranscript, forkTranscript } from "./fork.ts";
import { earlierConversation } from "./rewind.ts";

const file = (path = "src/a file.ts", label = "Custom label", directory = false): Extract<ComposerPart, { kind: "file" }> => ({ kind: "file", path, label, directory });
const rich = (path?: string): UserPrompt => submittedUserPrompt(writeComposerDraft([{ kind: "text", text: "  Review " }, file(path), { kind: "text", text: " now  " }]));
const message = (id: string, input: UserPrompt): ChatMessage => ({
  id, sessionId: "chat", turnId: id, role: "user", createdAt: "2026-11-10T06:00:00.000Z",
  blocks: [{ type: "text", text: input.text }], ...(input.userContent ? { userContent: input.userContent } : {}),
});

test("submission captures ordered atoms, duplicate labels, spaces and directory flags without changing provider text", () => {
  const parts: ComposerPart[] = [{ kind: "text", text: "  Review " }, file(), { kind: "text", text: " + " }, file(), file("src", "Directory", true), { kind: "text", text: "  " }];
  const draft = writeComposerDraft(parts);
  const input = submittedUserPrompt(draft);
  assert.equal(input.text, composerPrompt(draft).trim());
  assert.deepEqual(input.userContent?.parts, [{ kind: "text", text: "Review " }, file(), { kind: "text", text: " + " }, file(), file("src", "Directory", true), { kind: "text", text: "" }]);
  parts[1] = file("changed.ts");
  assert.equal(input.userContent?.parts.filter((part) => part.kind === "file").length, 3);
});

test("literal at-path, email, token-like text and malformed stored envelopes do not become file metadata", () => {
  for (const text of ["@src/a.ts", "person@example.com", "<file path='a.ts'>", "\u001eOpenConductorComposer:1\ninvalid", "/help"]) {
    assert.deepEqual(submittedUserPrompt(text), { text: text.trim() });
    const draft = queuedUserDraft({ text });
    assert.deepEqual(readComposerDraft(draft), [{ kind: "text", text }]);
  }
  const storedLooking = writeComposerDraft([file()]);
  assert.deepEqual(readComposerDraft(queuedUserDraft({ text: storedLooking })), [{ kind: "text", text: storedLooking }]);
});

test("queue start, steer, drain, pause, reorder, move and steerQueued keep each input's isolated snapshot", () => {
  const first = rich("first.ts"), second = rich("second.ts"), third = rich("third.ts");
  const started = Q.submit(Q.emptyQueue(), first, "queue");
  assert.deepEqual(started.effects[0], { kind: "start", ...first, attachments: [] });
  assert.deepEqual(Q.submit(started.queue, second, "steer").effects[0], { kind: "steer", ...second, attachments: [] });
  let q = Q.submit(started.queue, second, "queue").queue;
  q = Q.submit(q, third, "queue").queue;
  const expected = structuredClone(second.userContent);
  const originalPart = second.userContent?.parts.find((part) => part.kind === "file");
  if (originalPart?.kind === "file") originalPart.path = "mutated.ts";
  assert.deepEqual(q.items[0]?.userContent, expected);
  q = Q.pause(Q.move(q, q.items[1]!.id, -1));
  q = Q.reorder(q, [q.items[1]!.id, q.items[0]!.id]);
  const ended = Q.turnEnded(q, "completed");
  assert.deepEqual(ended.effects, []);
  const resumed = Q.resume(ended.queue);
  assert.deepEqual(resumed.effects[0], { kind: "start", text: second.text, userContent: expected, attachments: [] });
  const steered = Q.steerQueued(resumed.queue, resumed.queue.items[0]!.id);
  assert.deepEqual(steered.effects[0], { kind: "steer", ...third, attachments: [] });
});

test("queue editing replaces body metadata, keeps transport/display attachments, and drops deleted atoms", () => {
  const copied = ".context/attachments/abc123/image.png";
  const attachments = [{ name: copied, text: "original bytes" }, { name: "generated.md", text: "notes" }];
  const original = withSentAttachmentDisplay(rich(), attachments, new Set([copied]));
  let q = Q.submit(Q.submit(Q.emptyQueue(), { text: "busy" }, "queue").queue, original, "queue", undefined, attachments).queue;
  q = Q.beginEdit(q, q.items[0]!.id);
  const cancel = Q.cancelEdit(q);
  assert.deepEqual(cancel.queue.items[0]?.userContent, original.userContent);
  const replacement = rich("different.ts");
  const saved = Q.saveEdit(q, replacement).queue.items[0]!;
  assert.equal(saved.text, replacement.text);
  assert.deepEqual(saved.userContent?.parts, replacement.userContent?.parts);
  assert.deepEqual(saved.userContent?.attachments, original.userContent?.attachments);
  assert.deepEqual(saved.attachments, attachments);
  const dropped = Q.saveEdit(q, { text: "@src/a file.ts" }, true).effects[0];
  assert.equal(dropped?.kind, "steer");
  if (dropped?.kind !== "steer") assert.fail("expected steer");
  assert.deepEqual(dropped.userContent?.parts, [{ kind: "text", text: "@src/a file.ts" }]);
  assert.deepEqual(dropped.attachments, attachments);
  assert.equal(editedUserPrompt({ text: "literal" }, rich()).userContent, undefined);
});

test("attachment metadata has only authoritative targets and never body bytes or staging receipts", () => {
  const name = ".context/attachments/abc123/a.png";
  const attachments = [{ name, label: "Picture", text: "private body", staged: name }, { name: "notes.md", text: "body" }];
  const input = withSentAttachmentDisplay({ text: "" }, attachments, new Set([name]));
  assert.deepEqual(input.userContent?.attachments, [{ kind: "workspace-file", name, label: "Picture", path: name }, { kind: "embedded", name: "notes.md", label: "notes.md" }]);
  const serialized = JSON.stringify(input);
  assert.ok(!serialized.includes("private body") && !serialized.includes("staged"));
  assert.deepEqual(withSentAttachmentDisplay({ text: "literal" }, attachments, new Set()), { text: "literal" }, "already-copied without this callback's receipt remains plain");
  assert.deepEqual(withSentAttachmentDisplay(rich(), attachments, new Set()).userContent?.attachments, [{ kind: "embedded", name, label: "Picture" }, { kind: "embedded", name: "notes.md", label: "notes.md" }]);
});

test("optional JSON decoding falls back on old, null, unknown, malformed and unsafe paths", () => {
  const valid = rich().userContent!;
  assert.deepEqual(parseSentUserContent(JSON.parse(JSON.stringify(valid))), valid);
  for (const bad of [undefined, null, {}, { ...valid, version: 2 }, { ...valid, attachments: [null] }, { ...valid, parts: [{ kind: "file", path: "", label: "x", directory: false }] }]) assert.equal(parseSentUserContent(bad), undefined);
  for (const path of ["a\0b", "../outside", "a/../b", "https://example.test/file", "file:///tmp/a", "//server/share"]) {
    assert.equal(parseSentUserContent({ ...valid, parts: [file(path)] }), undefined);
  }
});

test("file targets are workspace-contained and inert for directories, missing context and unsafe inputs", () => {
  assert.equal(sentFileTarget("/ws", file()), "/ws/src/a file.ts");
  assert.equal(sentFileTarget("/ws/", file("/ws/a.ts")), "/ws/a.ts");
  for (const path of ["/outside/a", "/ws-other/a", "../a", "a/../b", "file:///ws/a", "//host/a", "a\0b", "/ws", "a/"]) assert.equal(sentFileTarget("/ws", file(path)), null, path);
  assert.equal(sentFileTarget(undefined, file()), null);
  assert.equal(sentFileTarget("/ws", file("dir", "Directory", true)), null);
});

test("retry uses the exact source message while keeping legacy plain text and attribution rules", () => {
  const a = message("a", { text: "same", userContent: rich("a.ts").userContent });
  const b = message("b", { text: "same", userContent: rich("b.ts").userContent });
  a.blocks.push({ type: "text", text: "Attached: notes.md" });
  assert.equal(retryUserPrompt(a).text, plainText(a));
  assert.deepEqual(retryUserPrompt(a).userContent, a.userContent);
  assert.notDeepEqual(retryUserPrompt(a).userContent, retryUserPrompt(b).userContent);
  assert.deepEqual(retryUserPrompt({ ...a, senderSessionId: "other" }), { text: plainText(a) });
});

test("fullMessage preserves V1, content stays plain, malformed metadata retains readable rows, and reset/replay do not graft metadata", () => {
  const original = message("first", rich());
  const second = message("second", rich("second.ts"));
  const applied = applyChatEvents(emptyTranscript("chat"), [{ type: "upsert", message: original }, { type: "upsert", message: second }]);
  assert.ok(applied.ok);
  const batch = diffForSave(null, applied.transcript);
  assert.equal(batch.upserts[0]?.content, plainText(original));
  assert.deepEqual(JSON.parse(batch.upserts[0]!.fullMessage).userContent, original.userContent);
  const restored = applyChatEvents(emptyTranscript("chat"), restoreEvents("chat", batch.upserts.map((row) => row.fullMessage)));
  assert.ok(restored.ok);
  const row = buildRows(restored.transcript).find((row) => row.kind === "user");
  assert.equal(row?.kind, "user");
  if (row?.kind !== "user") assert.fail("missing real user row");
  assert.deepEqual(row.message.userContent, original.userContent);
  const plain = { ...restored.transcript, messages: restored.transcript.messages.map(({ userContent: _metadata, ...message }) => message) };
  assert.equal(completeTranscript(restored.transcript), completeTranscript(plain));
  assert.equal(forkTranscript(restored.transcript), forkTranscript(plain));
  assert.deepEqual(earlierConversation(restored.transcript), earlierConversation(plain));
  const reset = truncateAfterTurn(restored.transcript, "first");
  assert.deepEqual(reset.messages.map((m) => m.userContent), [original.userContent]);
  const replay = applyChatEvents(reset, [{ type: "upsert", message: { ...original, userContent: undefined } }]);
  assert.ok(replay.ok);
  assert.equal(replay.transcript.messages[0]?.userContent, undefined);
  for (const userContent of [undefined, null, { version: 2 }, { version: 1, parts: [file("../escape")], attachments: [] }]) {
    const events = restoreEvents("chat", [JSON.stringify({ ...original, userContent })]);
    const event = events[0];
    assert.equal(event?.type, "upsert");
    if (event?.type !== "upsert") assert.fail("readable row discarded");
    assert.equal(plainText(event.message), plainText(original));
    assert.equal(event.message.userContent, undefined);
  }
});

