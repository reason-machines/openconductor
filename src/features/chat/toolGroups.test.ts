// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { canCollapse, foldAgentRows, groupParts, isSummaryOpen, summaryLabel, type DisplayRow } from "./toolGroups.ts";
import { buildRows, type PartView, type ToolStatus } from "./view.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import type { Block, ChatEvent, ChatMessage } from "./types.ts";
import { applyCodexPayload, codexChat, startTurn, type CodexPayload } from "./codex.ts";
import { applyReasonPayload, reasonChat, startTurn as startReasonTurn, type ReasonPayload } from "./reason.ts";

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

test("the Codex adapter's one-message turn keeps commentary and tools inline", () => {
  let state = codexChat("s1");
  const started = startTurn(state, "make hello.txt");
  state = started.state;
  const events = [...started.events];
  const payloads: CodexPayload[] = [
    { chatId: "s1", type: "message", itemId: "msg-a", text: "I’ll create `hello.txt` in the workspace, then run `cat hello.txt`.", phase: "commentary" },
    ...["printf hello > hello.txt", "cat hello.txt"].map((command, i): CodexPayload => ({
      chatId: "s1", type: "tool", id: `exec-${i}`, kind: "commandExecution", title: command,
      status: "completed", input: { command }, output: i === 1 ? "hello from codex\n" : null, exitCode: 0,
    })),
    { chatId: "s1", type: "message", itemId: "msg-b", text: "hello from codex", phase: "final_answer" },
    { chatId: "s1", type: "turnEnded", outcome: "completed" },
  ];
  for (const payload of payloads) {
    const step = applyCodexPayload(state, payload);
    state = step.state;
    events.push(...step.events);
  }
  const transcript = applyChatEvents(emptyTranscript("s1"), events);
  assert.ok(transcript.ok);
  assert.equal(transcript.transcript.messages.filter((m) => m.role === "assistant").length, 1);
  const agent = foldAgentRows(buildRows(transcript.transcript), transcript.transcript.activeTurn).find((r) => r.kind === "agent");
  assert.ok(agent?.kind === "agent");
  assert.equal(agent.items.filter((g) => g.kind === "summary").length, 0);
  assert.deepEqual(agent.items.map((g) => g.kind === "part" && (g.part.kind === "tool" ? g.part.call.name : g.part.text)), [
    "I’ll create `hello.txt` in the workspace, then run `cat hello.txt`.", "printf hello > hello.txt", "cat hello.txt", "hello from codex",
  ]);
  const final = agent.items.at(-1);
  assert.ok(final?.kind === "part" && final.preview);
});

test("the Reason Lisbon adapter turn preserves one message and all inline content", () => {
  const texts = [
    "I'll look at how the login route decides where to send a signed-in user.",
    "Found it. `redirectTo` treats any session object as signed in, including an expired one, while the dashboard loader rejects expired sessions and sends the user back to `/login`. I'll check `expiresAt` before redirecting.",
    "Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n- `src/lib/auth.ts`: only redirect to the dashboard when the session has not expired.\n- Tests: `pnpm test src/lib/auth.test.ts` passes (4 tests).",
  ];
  const call = (id: string, toolName: string): ReasonPayload => ({
    chatId: "s1", type: "tool", id, toolName, title: toolName, kind: "execute", status: "completed",
    output: "ok", diffs: [], locations: [], rawInput: {},
  });
  const started = startReasonTurn(reasonChat("s1"), "Fix the redirect loop");
  let state = started.state;
  const events = [...started.events];
  const payloads: ReasonPayload[] = [
    { chatId: "s1", type: "text", text: texts[0]! }, call("g", "Grep"), call("r", "Read"),
    { chatId: "s1", type: "text", text: texts[1]! }, call("e", "Edit"), call("b", "Bash"),
    { chatId: "s1", type: "text", text: texts[2]! },
    { chatId: "s1", type: "turnEnded", end: { outcome: "completed" } },
  ];
  for (const payload of payloads) {
    const step = applyReasonPayload(state, payload);
    state = step.state;
    events.push(...step.events);
  }
  const transcript = applyChatEvents(emptyTranscript("s1"), events);
  assert.ok(transcript.ok);
  assert.equal(transcript.transcript.messages.filter((m) => m.role === "assistant").length, 1);
  const agent = foldAgentRows(buildRows(transcript.transcript), transcript.transcript.activeTurn).find((r) => r.kind === "agent");
  assert.ok(agent?.kind === "agent");
  assert.equal(agent.items.filter((g) => g.kind === "summary").length, 0);
  assert.deepEqual(agent.items.map((g) => g.kind === "part" && (g.part.kind === "tool" ? g.part.call.name : g.part.text)), [
    texts[0], "Grep", "Read", texts[1], "Edit", "Bash", texts[2],
  ]);
  const final = agent.items.at(-1);
  assert.ok(final?.kind === "part" && final.preview);
});

test("the reference seed's six distinct pre-final messages still collapse", () => {
  const rows = fold([
    m("a1", "assistant", [said("I'll look.")]),
    m("a2", "assistant", [use("g", "Grep")]), m("r1", "user", [result("g")]),
    m("a3", "assistant", [use("r", "Read")]), m("r2", "user", [result("r")]),
    m("a4", "assistant", [said("Found it.")]),
    m("a5", "assistant", [use("e", "Edit")]), m("r3", "user", [result("e")]),
    m("a6", "assistant", [use("b", "Bash")]), m("r4", "user", [result("b")]),
    m("a7", "assistant", [said("Fixed.")]), done("t1"),
  ]);
  assert.deepEqual(describe(rows), ['[4 tool calls, 2 messages] "Fixed."', "turn_end"]);
  const agent = rows[0];
  assert.ok(agent?.kind === "agent");
  const summary = agent.items[0];
  assert.ok(summary?.kind === "summary");
  assert.equal(new Set(summary.parts.map((p) => p.messageKey)).size, 6);
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

for (const name of ["ExitPlanMode", "AskUserQuestion"]) {
  test(`${name} stays inline and supersedes earlier text as the turn preview`, () => {
    const rows = fold([
      m("a1", "assistant", [said("Earlier explanation")]),
      m("a2", "assistant", [use("r1", "Read")]),
      m("a3", "assistant", [use("request", name)]),
      m("a4", "assistant", [use("r2", "Read")]),
      m("a5", "assistant", [use("r3", "Read")]),
      done("t1"),
    ]);
    assert.deepEqual(describe(rows), [`"Earlier explanation" Read ${name} Read Read`, "turn_end"]);
    const agent = rows[0];
    assert.ok(agent?.kind === "agent");
    assert.deepEqual(agent.items.filter((item) => item.kind === "part" && item.preview).map((item) => item.messageKey), ["a3"]);
  });

  test(`${name} protects its entire message and splits surrounding summaries`, () => {
    const rows = fold([
      ...["a1", "a2", "a3"].map((id) => m(id, "assistant", [use(id, "Read")])),
      m("request", "assistant", [said("Please review"), use("request", name), use("extra", "Read")]),
      ...["b1", "b2", "b3"].map((id) => m(id, "assistant", [use(id, "Read")])),
      m("final", "assistant", [said("Final response")]),
      done("t1"),
    ]);
    assert.deepEqual(describe(rows), [`[3 tool calls] "Please review" ${name} Read [3 tool calls] "Final response"`, "turn_end"]);
    const agent = rows[0];
    assert.ok(agent?.kind === "agent");
    assert.deepEqual(agent.items.filter((item) => item.kind === "part" && item.preview).map((item) => item.messageKey), ["request", "request", "request", "final"]);
  });
}

test("a request stays inline in an earlier assistant block separated by a system message", () => {
  const rows = fold([
    ...["a1", "a2", "a3"].map((id) => m(id, "assistant", [use(id, "Read")])),
    m("request", "assistant", [use("request", "AskUserQuestion")]),
    m("system", "system", [said("Context changed")]),
    m("final", "assistant", [said("Final response")]),
    done("t1"),
  ]);
  assert.deepEqual(describe(rows), ["[3 tool calls] AskUserQuestion", "system", '"Final response"', "turn_end"]);
});

test("different turns stay separate blocks", () => {
  const rows = fold([running("t1"), m("u1", "user", [said("a")]), m("a1", "assistant", [said("one")]), done("t1"), running("t2"), m("u2", "user", [said("b")], "t2"), m("a2", "assistant", [said("two")], "t2"), done("t2")]);
  assert.deepEqual(describe(rows), ["user", '"one"', "turn_end", "user", '"two"', "turn_end"]);
});
