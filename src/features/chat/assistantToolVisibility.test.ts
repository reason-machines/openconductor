import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { buildRows } from "./view.ts";
import { foldAgentRows, type DisplayRow } from "./toolGroups.ts";
import type { Block, ChatEvent, ChatMessage } from "./types.ts";

const inputBytes = readFileSync(new URL("./assistantToolVisibility.inputs.json", import.meta.url));
assert.equal(createHash("sha256").update(inputBytes).digest("hex"), "476cccaed904614b3c446273765ea12349c872ee73fa02d635c86d2bdfcc11f0");
const at = new Date("2026-11-12T14:00:00.000Z");
const chatId = "visibility-chat";
const turnId = "visibility-turn";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readCases() {
  const data: unknown = JSON.parse(inputBytes.toString("utf8"));
  assert.ok(record(data) && Array.isArray(data.cases));
  return data.cases.map((value: unknown) => {
    assert.ok(record(value));
    assert.ok(typeof value.id === "string");
    assert.ok(typeof value.tool_name === "string");
    assert.ok(typeof value.tool_use_id === "string");
    assert.ok(record(value.input));
    assert.ok(typeof value.active === "boolean");
    assert.ok(typeof value.expected_row_visible === "boolean");
    assert.ok(value.source === "persisted_named_tool" || value.source === "applyReasonPayload_named_raw_input");
    assert.ok(value.expected_visible_status === null || value.expected_visible_status === "done" || value.expected_visible_status === "error");
    assert.ok(Array.isArray(value.result_messages));
    const results = value.result_messages.map((result: unknown) => {
      assert.ok(record(result));
      assert.ok(typeof result.tool_use_id === "string");
      assert.ok(typeof result.is_error === "boolean");
      assert.ok(typeof result.content === "string");
      return { id: result.tool_use_id, isError: result.is_error, content: result.content };
    });
    return {
      id: value.id, name: value.tool_name, toolUseId: value.tool_use_id, input: value.input,
      active: value.active, visible: value.expected_row_visible, source: value.source,
      status: value.expected_visible_status, results,
    };
  });
}
type Entry = ReturnType<typeof readCases>[number];

function message(id: string, role: ChatMessage["role"], blocks: Block[]): ChatMessage {
  return { id, sessionId: chatId, turnId, role, createdAt: at.toISOString(), blocks };
}
function reduce(events: ChatEvent[]): ChatTranscript {
  const reduced = applyChatEvents(emptyTranscript(chatId), events);
  assert.ok(reduced.ok);
  return reduced.transcript;
}
function persisted(entry: Entry): ChatTranscript {
  const events: ChatEvent[] = [
    { type: "turn_status", sessionId: chatId, turnId, status: "running" },
    { type: "upsert", message: message("assistant", "assistant", [{ type: "tool_use", id: entry.toolUseId, name: entry.name, input: entry.input }]) },
    ...entry.results.map((result, index): ChatEvent => ({ type: "upsert", message: message(`result-${index}`, "user", [{ type: "tool_result", toolUseId: result.id, content: result.content, isError: result.isError }]) })),
  ];
  if (!entry.active) events.push({ type: "turn_status", sessionId: chatId, turnId, status: "completed" });
  return reduce(events);
}
function reason(entry: Entry): ChatTranscript {
  const started = startTurn(reasonChat(chatId), "Retain collaboration transcript", at);
  const result = entry.results.at(-1);
  const completed = applyReasonPayload(started.state, {
    chatId, type: "tool", id: entry.toolUseId, title: "Provider tool", kind: "other",
    toolName: entry.name, rawInput: entry.input, locations: [], diffs: [],
    status: entry.active ? "running" : result?.isError ? "failed" : "completed",
    output: result?.content ?? null,
  }, at);
  const ended = entry.active ? [] : applyReasonPayload(completed.state, { chatId, type: "turnEnded", end: { outcome: "completed" } }, at).events;
  return reduce([...started.events, ...completed.events, ...ended]);
}
function parts(rows: DisplayRow[]) {
  return rows.flatMap((row) => row.kind === "agent" ? row.items.flatMap((item) => item.kind === "part" ? [item.part] : item.parts.map((part) => part.part)) : []);
}
function summaries(rows: DisplayRow[]) {
  return rows.flatMap((row) => row.kind === "agent" ? row.items.flatMap((item) => item.kind === "summary" ? [item.summary] : []) : []);
}

for (const entry of readCases()) {
  test(`collaboration visibility: ${entry.id}`, () => {
    const transcript = entry.source === "persisted_named_tool" ? persisted(entry) : reason(entry);
    const stored = JSON.stringify(transcript);
    const rows = foldAgentRows(buildRows(transcript), transcript.activeTurn);
    const tools = parts(rows).flatMap((part) => part.kind === "tool" ? [part.call] : []);
    assert.deepEqual(tools.map((call) => call.name), entry.visible ? [entry.name] : []);
    if (entry.visible) {
      const call = tools[0];
      assert.ok(call);
      assert.deepEqual(call.tool, { name: entry.name, input: entry.input });
      assert.equal(call.id, entry.toolUseId);
      assert.equal(call.status, entry.status);
      const matched = entry.results.filter((result) => result.id === entry.toolUseId).at(-1);
      assert.equal(call.result, matched?.content);
    }
    assert.deepEqual(summaries(rows), []);
    assert.equal(JSON.stringify(transcript), stored, "display must not rewrite stored tool or result blocks");
    const storedUses = transcript.messages.flatMap((item) => item.blocks.filter((block) => block.type === "tool_use"));
    assert.equal(storedUses.length, 1, "hidden tools must remain in the transcript");
    if (entry.active) {
      assert.equal(rows.some((row) => row.kind === "turn_end"), false);
      assert.ok(rows.some((row) => row.kind === "agent" && row.running));
    }
  });
}

function toolMessage(id: string, names: string[]): ChatMessage {
  return message(id, "assistant", names.flatMap((name, index): Block[] => [
    { type: "tool_use", id: `${id}-${index}`, name, input: {} },
    { type: "tool_result", toolUseId: `${id}-${index}`, content: "completed", isError: false },
  ]));
}
function transcriptWith(messages: ChatMessage[]): ChatTranscript {
  return reduce([
    ...messages.map((value): ChatEvent => ({ type: "upsert", message: value })),
    { type: "upsert", message: message("final", "assistant", [{ type: "text", text: "Final answer" }]) },
    { type: "turn_status", sessionId: chatId, turnId, status: "completed" },
  ]);
}

test("a reused tool id's error in another turn does not reveal a successful close", () => {
  const transcript = reduce([
    { type: "upsert", message: message("close", "assistant", [{ type: "tool_use", id: "reused", name: "collab__closeAgent", input: {} }]) },
    { type: "upsert", message: message("success", "user", [{ type: "tool_result", toolUseId: "reused", content: "closed", isError: false }]) },
    { type: "upsert", message: { ...message("other-error", "user", [{ type: "tool_result", toolUseId: "reused", content: "other turn", isError: true }]), turnId: "other-turn" } },
    { type: "turn_status", sessionId: chatId, turnId, status: "completed" },
  ]);
  const rows = foldAgentRows(buildRows(transcript), transcript.activeTurn);
  assert.deepEqual(parts(rows).filter((part) => part.kind === "tool"), []);
});

test("hidden-only collaboration message does not cross the three-visible-message threshold", () => {
  const transcript = transcriptWith([
    toolMessage("a1", ["Bash"]), toolMessage("a2", ["collab__wait"]), toolMessage("a3", ["Bash"]),
  ]);
  const stored = JSON.stringify(transcript);
  const rows = foldAgentRows(buildRows(transcript), transcript.activeTurn);
  assert.deepEqual(summaries(rows), []);
  assert.deepEqual(parts(rows).flatMap((part) => part.kind === "tool" ? [part.call.name] : []), ["Bash", "Bash"]);
  const footer = rows.find((row) => row.kind === "turn_end");
  assert.ok(footer?.kind === "turn_end");
  assert.equal(footer.finalText, "Final answer");
  assert.equal(JSON.stringify(transcript), stored);
});

test("mixed visible messages retain original tool summary counts without rendering the hidden row", () => {
  const transcript = transcriptWith([
    toolMessage("a1", ["collab__wait", "Bash"]), toolMessage("a2", ["Bash"]), toolMessage("a3", ["Bash"]),
  ]);
  const stored = JSON.stringify(transcript);
  const rows = foldAgentRows(buildRows(transcript), transcript.activeTurn);
  const summary = summaries(rows);
  assert.equal(summary.length, 1);
  assert.deepEqual(summary.map(({ toolCallsCount, otherMessagesCount, toolNames }) => ({ toolCallsCount, otherMessagesCount, toolNames })), [
    { toolCallsCount: 4, otherMessagesCount: 0, toolNames: ["collab__wait", "Bash"] },
  ]);
  assert.deepEqual(parts(rows).flatMap((part) => part.kind === "tool" ? [part.call.name] : []), ["Bash", "Bash", "Bash"]);
  const footer = rows.find((row) => row.kind === "turn_end");
  assert.ok(footer?.kind === "turn_end");
  assert.equal(footer.finalText, "Final answer");
  assert.equal(JSON.stringify(transcript), stored);
});
