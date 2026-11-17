import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";
import { foldAgentRows, summaryLabel } from "./toolGroups.ts";
import type { Block, ChatEvent } from "./types.ts";

const text = (text: string): Block => ({ type: "text", text });
const thinking = (text: string): Block => ({ type: "thinking", text });
const tool = (id: string, name = "Read"): Block => ({ type: "tool_use", id, name, input: {} });

// Real persisted messages -> reducer -> render model -> production grouping.
// The final response stays outside the batch so it cannot mask count defects.
function grouped(messages: Block[][]) {
  const events: ChatEvent[] = [...messages, [text("Final response")]].map((blocks, index) => ({
    type: "upsert",
    message: {
      id: `message-${index}`, sessionId: "summary-counts", turnId: "turn",
      role: "assistant", createdAt: "2026-11-17T00:00:00.000Z", blocks,
    },
  }));
  events.push({ type: "turn_status", sessionId: "summary-counts", turnId: "turn", status: "completed" });
  const reduced = applyChatEvents(emptyTranscript("summary-counts"), events);
  assert.ok(reduced.ok);
  const rows = foldAgentRows(buildRows(reduced.transcript), null);
  const agents = rows.filter((row) => row.kind === "agent");
  assert.equal(agents.length, 1);
  const items = agents[0]!.items;
  const final = items.at(-1);
  assert.ok(final?.kind === "part" && final.preview && final.part.kind === "text");
  assert.equal(final.part.text, "Final response");
  return items;
}

function summary(messages: Block[][]) {
  const summaries = grouped(messages).filter((item) => item.kind === "summary");
  assert.equal(summaries.length, 1, "three distinct visible messages reach the real summary");
  return summaries[0]!;
}

function counts(messages: Block[][], tools: number, messagesWithoutTools: number, label: string) {
  const item = summary(messages);
  assert.equal(item.summary.toolCallsCount, tools, "tool count remains independent");
  assert.equal(item.summary.otherMessagesCount, messagesWithoutTools, "count tool-free messages, not their parts");
  assert.equal(summaryLabel(item.summary), label);
}

test("mixed text/tool messages do not count as other messages", () => {
  counts([
    [text("Before"), tool("a")],
    [tool("b", "Bash"), text("After")],
    [thinking("Reason"), text("Explain"), tool("c")],
  ], 3, 0, "3 tool calls");
});

test("thinking and text in one tool-free message count once", () => {
  counts([[thinking("Think"), text("Explain")], [tool("a")], [tool("b")]], 2, 1, "2 tool calls, 1 message");
});

test("separate text blocks in one tool-free message count once", () => {
  counts([[text("One"), text("Two")], [tool("a")], [tool("b")]], 2, 1, "2 tool calls, 1 message");
});

test("mixed hidden wait retains tool metadata without other-message inflation", () => {
  const item = summary([[text("Waiting"), tool("wait", "collab__wait")], [tool("a")], [tool("b")]]);
  assert.deepEqual(item.summary.toolNames, ["collab__wait", "Read"]);
  assert.equal(item.parts.some(({ part }) => part.kind === "tool" && part.call.id === "wait"), false);
  assert.equal(item.summary.toolCallsCount, 3);
  assert.equal(item.summary.otherMessagesCount, 0, "hidden tools still make their visible message tool-bearing");
  assert.equal(summaryLabel(item.summary), "3 tool calls");
});

test("distinct tool-free messages still count separately", () => {
  counts([[text("One")], [text("Two")], [tool("a")]], 1, 2, "1 tool call, 2 messages");
});

test("tool-only summary stays unchanged", () => {
  counts([[tool("a")], [tool("b")], [tool("c")]], 3, 0, "3 tool calls");
});

test("two mixed messages stay below the summary threshold", () => {
  const items = grouped([[text("A"), tool("a")], [text("B"), tool("b")]]);
  assert.equal(items.filter((item) => item.kind === "summary").length, 0);
  assert.equal(items.length, 5, "all text and tools remain inline with the final response");
});

test("hidden-only tools and empty text cannot bring two visible messages to the threshold", () => {
  const items = grouped([[tool("a")], [tool("wait", "collab__wait")], [text("  ")], [tool("b")]]);
  assert.equal(items.filter((item) => item.kind === "summary").length, 0);
  assert.deepEqual(items.map((item) => item.kind === "part" && item.part.kind === "tool" ? item.part.call.id : "final"), ["a", "b", "final"]);
});

test("visible thinking-only messages count once and remain in expanded children", () => {
  const messages = [[thinking("Visible reasoning")], [tool("a")], [tool("b")]];
  const item = summary(messages);
  assert.equal(item.parts[0]!.part.kind, "thinking");
  counts(messages, 2, 1, "2 tool calls, 1 message");
});

test("identical text in separate message identities is not deduplicated by content", () => {
  counts([[text("Same")], [text("Same")], [tool("a")]], 1, 2, "1 tool call, 2 messages");
});
