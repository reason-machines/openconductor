// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { canCollapse, foldAgentRows, groupParts, isSummaryOpen, summaryLabel, type DisplayRow } from "./toolGroups.ts";
import { buildRows, type PartView, type ToolStatus } from "./view.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import type { Block, ChatEvent, ChatMessage } from "./types.ts";

const text = (t: string): PartView => ({ kind: "text", text: t, streaming: false });
const thinking = (t: string): PartView => ({ kind: "thinking", text: t, streaming: false });
const tool = (id: string, name: string, status: ToolStatus = "done"): PartView => ({ kind: "tool", call: { id, name, input: {}, tool: { name, input: {} }, status } });
const keyed = (parts: PartView[]) => parts.map((part, i) => ({ key: `k${i}`, messageKey: `m${i}`, part }));
const shape = (parts: PartView[], hasFinal = true) =>
  groupParts(keyed(parts), "m1", hasFinal).map((g) => (g.kind === "summary" ? `[${summaryLabel(g.summary)}]` : g.part.kind === "tool" ? g.part.call.name : `"${g.part.text}"`));

test("the reference turn collapses to '4 tool calls, 2 messages' above the final text", () => {
  const parts = [text("I'll look."), tool("g", "Grep"), tool("r", "Read"), text("Found it."), tool("e", "Edit"), tool("b", "Bash"), text("Fixed.")];
  assert.deepEqual(shape(parts), ["[4 tool calls, 2 messages]", '"Fixed."']);
  const [g] = groupParts(keyed(parts), "m1");
  assert.equal(g!.kind, "summary");
  if (g!.kind === "summary") {
    assert.deepEqual(g.summary.toolNames, ["Grep", "Read", "Edit", "Bash"]);
    assert.equal(g.parts.length, 6);
    assert.equal(g.summary.id, "m1:collapse-0");
  }
});

test("batches shorter than 3 items stay inline", () => {
  assert.deepEqual(shape([tool("a", "Read"), tool("b", "Edit"), text("Done.")]), ["Read", "Edit", '"Done."']);
  assert.deepEqual(shape([text("Done.")]), ['"Done."']);
});

test("labels leave out zero counts and use singulars", () => {
  assert.equal(summaryLabel({ toolCallsCount: 1, otherMessagesCount: 0 }), "1 tool call");
  assert.equal(summaryLabel({ toolCallsCount: 0, otherMessagesCount: 3 }), "3 messages");
  assert.equal(summaryLabel({ toolCallsCount: 2, otherMessagesCount: 1 }), "2 tool calls, 1 message");
  assert.deepEqual(shape([tool("a", "Read"), tool("b", "Read"), tool("c", "Read")]), ["[3 tool calls]"]);
});

test("thinking counts as a message; empty text and thinking are dropped", () => {
  assert.deepEqual(shape([thinking("hmm"), text("  "), tool("a", "Bash"), tool("b", "Bash"), text("ok")]), ["[2 tool calls, 1 message]", '"ok"']);
});

test("a message that is not the turn's last has no preview, so its text can collapse", () => {
  assert.deepEqual(shape([text("one"), tool("a", "Read"), text("two")], false), ["[1 tool call, 2 messages]"]);
});

test("tools after the final text form their own batch", () => {
  assert.deepEqual(shape([tool("a", "Read"), text("Here."), tool("b", "Bash"), tool("c", "Bash"), tool("d", "Bash")]), ["Read", '"Here."', "[3 tool calls]"]);
});

test("collapsing is off while the turn runs and with 'Don't collapse tool calls'", () => {
  assert.equal(canCollapse(true, false), false);
  assert.equal(canCollapse(false, true), false);
  assert.equal(canCollapse(false, false), true);
  assert.equal(isSummaryOpen(false, undefined), true);
  assert.equal(isSummaryOpen(false, "collapsed"), true);
  assert.equal(isSummaryOpen(true, undefined), false);
  assert.equal(isSummaryOpen(true, "expanded"), true);
  assert.equal(isSummaryOpen(true, "collapsed"), false);
});

// A turn as an agent streams it: one assistant message per step, tool results
// carried back in user messages.
const m = (id: string, role: ChatMessage["role"], blocks: Block[], turnId = "t1"): ChatEvent => ({
  type: "upsert",
  message: { id, sessionId: "s1", turnId, role, createdAt: "2026-11-05T10:00:00.000Z", blocks },
});
const said = (t: string): Block => ({ type: "text", text: t });
const use = (id: string, name: string): Block => ({ type: "tool_use", id, name, input: {} });
const result = (id: string): Block => ({ type: "tool_result", toolUseId: id, content: "ok" });
const done = (turnId: string): ChatEvent => ({ type: "turn_status", sessionId: "s1", turnId, status: "completed" });
const running = (turnId: string): ChatEvent => ({ type: "turn_status", sessionId: "s1", turnId, status: "running" });

function fold(events: ChatEvent[]): DisplayRow[] {
  const r = applyChatEvents(emptyTranscript("s1"), events);
  assert.ok(r.ok);
  return foldAgentRows(buildRows(r.transcript), r.transcript.activeTurn);
}
const describe = (rows: DisplayRow[]) =>
  rows.map((r) =>
    r.kind === "agent"
      ? r.items.map((g) => (g.kind === "summary" ? `[${summaryLabel(g.summary)}]` : g.part.kind === "tool" ? g.part.call.name : `"${g.part.text}"`)).join(" ")
      : r.kind,
  );

const referenceTurn = [
  m("u1", "user", [said("Fix the redirect loop")]),
  m("a1", "assistant", [said("I'll look."), use("g", "Grep")]),
  m("r1", "user", [result("g")]),
  m("a2", "assistant", [use("r", "Read")]),
  m("r2", "user", [result("r")]),
  m("a3", "assistant", [said("Found it."), use("e", "Edit")]),
  m("r3", "user", [result("e")]),
  m("a4", "assistant", [use("b", "Bash")]),
  m("r4", "user", [result("b")]),
  m("a5", "assistant", [said("Fixed.")]),
];

test("a turn's messages fold into one block that collapses across messages", () => {
  const rows = fold([running("t1"), ...referenceTurn, done("t1")]);
  assert.deepEqual(describe(rows), ["user", '[4 tool calls, 2 messages] "Fixed."', "turn_end"]);
  const agent = rows[1]!;
  assert.ok(agent.kind === "agent" && !agent.running && agent.copyText === "Fixed.");
});

test("three tools in one assistant message stay inline before the final text", () => {
  const rows = fold([
    m("a1", "assistant", [use("a", "Read"), use("b", "Read"), use("c", "Read")]),
    m("r1", "user", [result("a"), result("b"), result("c")]),
    m("a2", "assistant", [said("Done.")]),
    done("t1"),
  ]);
  assert.deepEqual(describe(rows), ['Read Read Read "Done."', "turn_end"]);
});

test("three tools across two assistant messages stay inline before the final text", () => {
  const rows = fold([
    m("a1", "assistant", [use("a", "Read"), use("b", "Read")]),
    m("r1", "user", [result("a"), result("b")]),
    m("a2", "assistant", [use("c", "Read")]),
    m("r2", "user", [result("c")]),
    m("a3", "assistant", [said("Done.")]),
    done("t1"),
  ]);
  assert.deepEqual(describe(rows), ['Read Read Read "Done."', "turn_end"]);
});

test("empty assistant messages do not bring a two-message batch to the threshold", () => {
  const rows = fold([
    m("a1", "assistant", [use("a", "Read"), use("b", "Read")]),
    m("r1", "user", [result("a"), result("b")]),
    m("empty", "assistant", [said("  ")]),
    m("a2", "assistant", [use("c", "Read")]),
    m("r2", "user", [result("c")]),
    m("a3", "assistant", [said("Done.")]),
    done("t1"),
  ]);
  assert.deepEqual(describe(rows), ['Read Read Read "Done."', "turn_end"]);
  const agent = rows[0]!;
  assert.equal(agent.kind, "agent");
  if (agent.kind === "agent") {
    assert.deepEqual(agent.items.map((g) => g.kind === "part" && g.key), ["a", "b", "c", "a3:0"]);
    const final = agent.items.at(-1);
    assert.ok(final?.kind === "part" && final.preview);
  }
});

test("three separate visible assistant messages collapse before the final text", () => {
  const rows = fold([
    m("a1", "assistant", [use("a", "Read")]),
    m("r1", "user", [result("a")]),
    m("a2", "assistant", [use("b", "Read")]),
    m("r2", "user", [result("b")]),
    m("a3", "assistant", [use("c", "Read")]),
    m("r3", "user", [result("c")]),
    m("a4", "assistant", [said("Done.")]),
    done("t1"),
  ]);
  assert.deepEqual(describe(rows), ['[3 tool calls] "Done."', "turn_end"]);
});

test("a running turn is one block marked running, so the view keeps it open", () => {
  const rows = fold([running("t1"), ...referenceTurn.slice(0, 6)]);
  const agent = rows.find((r) => r.kind === "agent");
  assert.ok(agent?.kind === "agent" && agent.running);
  assert.equal(rows.filter((r) => r.kind === "agent").length, 1);
});

test("different turns stay separate blocks", () => {
  const rows = fold([running("t1"), m("u1", "user", [said("a")]), m("a1", "assistant", [said("one")]), done("t1"), running("t2"), m("u2", "user", [said("b")], "t2"), m("a2", "assistant", [said("two")], "t2"), done("t2")]);
  assert.deepEqual(describe(rows), ["user", '"one"', "turn_end", "user", '"two"', "turn_end"]);
});
