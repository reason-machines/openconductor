import { describe, expect, it } from "vitest";
import type { SdkMessage, SessionMessageRow, TranscriptEvent } from "./protocol";
import { emptyTranscript, fromRows, reduceTranscript, type AssistantItem, type ToolCall, type Transcript } from "./transcript";
import { finalMessageText, messageText, retryTarget, toolSummary, transcriptToMarkdown } from "./actions";

const run = (events: TranscriptEvent[], start: Transcript = emptyTranscript()) => events.reduce(reduceTranscript, start);

const stream = (event: Extract<SdkMessage, { type: "stream_event" }>["event"], parent: string | null = null): SdkMessage => ({
  type: "stream_event",
  event,
  parent_tool_use_id: parent,
});

const assistant = (id: string, content: Extract<SdkMessage, { type: "assistant" }>["message"]["content"], parent: string | null = null): SdkMessage => ({
  type: "assistant",
  message: { id, content },
  parent_tool_use_id: parent,
});

const toolResult = (id: string, text: string, isError = false, parent: string | null = null): SdkMessage => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: id, content: text, is_error: isError }] },
  parent_tool_use_id: parent,
});

function onlyAssistant(t: Transcript, index = 0): AssistantItem {
  const items = t.items.filter((i): i is AssistantItem => i.kind === "assistant");
  const item = items[index];
  if (!item) throw new Error("no assistant item");
  return item;
}

describe("streaming text", () => {
  it("accumulates deltas and marks the message streaming until message_stop", () => {
    let t = run([
      { type: "local/user_send", id: "u1", text: "hi", sentAt: "2026-01-01T00:00:00Z" },
      stream({ type: "message_start", message: { id: "m1", model: "opus" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }),
    ]);
    expect(onlyAssistant(t)).toMatchObject({ id: "m1", model: "opus", streaming: true, blocks: [{ kind: "text", text: "Hello" }] });
    expect(t.running).toBe(true);

    t = run([stream({ type: "content_block_stop", index: 0 }), stream({ type: "message_stop" })], t);
    expect(onlyAssistant(t).streaming).toBe(false);
  });

  it("does not duplicate blocks when the finished assistant message follows the stream, even split per block", () => {
    const t = run([
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "plan" } }),
      stream({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Done" } }),
      assistant("m1", [{ type: "thinking", thinking: "plan" }]),
      assistant("m1", [{ type: "text", text: "Done." }]),
      stream({ type: "message_stop" }),
    ]);
    expect(onlyAssistant(t).blocks).toEqual([
      { kind: "thinking", text: "plan" },
      { kind: "text", text: "Done." },
    ]);
  });

  it("renders non-streamed assistant messages", () => {
    const t = run([assistant("m1", [{ type: "text", text: "a" }]), assistant("m2", [{ type: "text", text: "b" }])]);
    expect(t.items.map((i) => i.id)).toEqual(["m1", "m2"]);
  });
});

describe("tool rows", () => {
  it("parses streamed tool input and settles with the tool result", () => {
    let t = run([
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "Bash", input: {} } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"comm' } }),
    ]);
    expect(onlyAssistant(t).blocks[0]).toMatchObject({ kind: "tool", status: "streaming-input", input: undefined });

    t = run(
      [
        stream({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'and":"ls -la"}' } }),
        stream({ type: "content_block_stop", index: 0 }),
      ],
      t,
    );
    expect(onlyAssistant(t).blocks[0]).toMatchObject({ status: "running", input: { command: "ls -la" } });

    t = run([toolResult("t1", "file.txt")], t);
    expect(onlyAssistant(t).blocks[0]).toMatchObject({ status: "done", result: "file.txt" });
  });

  it("marks failed tools as errors", () => {
    const t = run([assistant("m1", [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/x" } }]), toolResult("t1", "ENOENT", true)]);
    expect(onlyAssistant(t).blocks[0]).toMatchObject({ status: "error", result: "ENOENT" });
  });

  it("nests subagent activity under the tool that started it and never shows its prompt as user input", () => {
    const t = run([
      { type: "local/user_send", id: "u1", text: "go", sentAt: "t0" },
      assistant("m1", [{ type: "tool_use", id: "task1", name: "Task", input: { description: "Explore", prompt: "look around" } }]),
      { type: "user", message: { content: [{ type: "text", text: "look around" }] }, parent_tool_use_id: "task1" },
      assistant("sub1", [{ type: "tool_use", id: "g1", name: "Grep", input: { pattern: "foo" } }], "task1"),
      toolResult("g1", "3 matches", false, "task1"),
      assistant("sub2", [{ type: "text", text: "Found foo in 3 files" }], "task1"),
      toolResult("task1", "Found foo in 3 files"),
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    const task = onlyAssistant(t).blocks[0] as ToolCall;
    expect(task.status).toBe("done");
    expect(task.children).toEqual([
      expect.objectContaining({ kind: "tool", name: "Grep", status: "done", result: "3 matches" }),
      { kind: "text", text: "Found foo in 3 files" },
    ]);
  });
});

describe("messages from other sessions", () => {
  it("shows a mid-turn child-session report as an attributed report, not user input, and keeps the turn streaming", () => {
    let t = run([
      { type: "local/user_send", id: "u1", text: "build it", sentAt: "t0" },
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Working" } }),
      { type: "local/inbound", id: "r1", text: "Child finished: PR #4 merged", fromSessionId: "child-1", fromLabel: "Builder" },
      // The agent echoes the injected report back as a user-role message.
      { type: "user", message: { content: "Child finished: PR #4 merged" } },
      { type: "user", message: { content: [{ type: "text", text: "Child finished: PR #4 merged" }] } },
      stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " on it" } }),
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(["user", "assistant", "inbound"]);
    expect(t.items.filter((i) => i.kind === "user")).toHaveLength(1);
    expect(t.items[2]).toMatchObject({ kind: "inbound", fromLabel: "Builder", text: "Child finished: PR #4 merged" });
    expect(onlyAssistant(t)).toMatchObject({ streaming: true, blocks: [{ kind: "text", text: "Working on it" }] });
    expect(t.running).toBe(true);
    expect(retryTarget(t)).toBeNull();

    t = run([stream({ type: "message_stop" }), { type: "result", subtype: "success" }], t);
    expect(t.running).toBe(false);
    expect(retryTarget(t)).toBe("u1");
  });

  it("dedupes repeated inbound deliveries", () => {
    const ev: TranscriptEvent = { type: "local/inbound", id: "r1", text: "x", fromSessionId: "s2" };
    expect(run([ev, ev]).items).toHaveLength(1);
  });
});

describe("turn endings", () => {
  it("cancels running tools and adds a notice on interrupt", () => {
    const t = run([
      { type: "local/user_send", id: "u1", text: "go", sentAt: "t0" },
      stream({ type: "message_start", message: { id: "m1" } }),
      stream({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "Bash" } }),
      { type: "local/interrupted", by: "user" },
    ]);
    expect(t.running).toBe(false);
    expect(onlyAssistant(t)).toMatchObject({ streaming: false, blocks: [{ status: "cancelled" }] });
    expect(t.items.at(-1)).toMatchObject({ kind: "notice", tone: "interrupted" });
    expect(t.streams).toEqual({});
  });

  it("adds an error notice for a failed result", () => {
    const t = run([{ type: "local/user_send", id: "u1", text: "go", sentAt: "t0" }, { type: "result", subtype: "error_during_execution", is_error: true }]);
    expect(t.items.at(-1)).toMatchObject({ kind: "notice", tone: "error" });
    expect(retryTarget(t)).toBe("u1");
  });
});

describe("queue", () => {
  it("keeps queued messages out of the transcript until they are sent", () => {
    let t = run([
      { type: "local/user_send", id: "u1", text: "first", sentAt: "t0" },
      assistant("m1", [{ type: "text", text: "..." }]),
      { type: "local/user_send", id: "u2", text: "next" },
      assistant("m2", [{ type: "text", text: "still on first" }]),
    ]);
    expect(t.items.map((i) => i.id)).toEqual(["u1", "m1", "m2"]);
    expect(t.queue.map((q) => q.id)).toEqual(["u2"]);
    t = run([{ type: "local/user_send", id: "u2", text: "next", sentAt: "t1" }], t);
    expect(t.items.map((i) => i.id)).toEqual(["u1", "m1", "m2", "u2"]);
    expect(t.queue).toEqual([]);
  });
});

describe("fromRows", () => {
  const row = (r: Partial<SessionMessageRow> & { id: string; created_at: string }): SessionMessageRow => ({
    session_id: "s1",
    role: "user",
    content: null,
    ...r,
  });

  it("attributes rows by sender and replays agent echoes as tool results", () => {
    const rows: SessionMessageRow[] = [
      row({ id: "a", created_at: "1", sent_at: "1", content: "please fix" }),
      row({
        id: "b",
        created_at: "2",
        role: "assistant",
        full_message: JSON.stringify(assistant("m1", [{ type: "text", text: "On it" }, { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "a.ts" } }])),
      }),
      row({ id: "c", created_at: "3", full_message: JSON.stringify(toolResult("t1", "ok")) }),
      row({ id: "d", created_at: "4", sent_at: "4", content: "report from child", sender_session_id: "s2" }),
      row({ id: "e", created_at: "5", sent_at: "5", content: "routine ping", sender_api_key_name: "ci-key" }),
      row({ id: "f", created_at: "6", sent_at: "6", content: "mine via self", sender_session_id: "s1" }),
      row({ id: "g", created_at: "7", content: "never sent", cancelled_at: "7" }),
      row({ id: "h", created_at: "8", role: "assistant", content: "plain reply" }),
      row({ id: "i", created_at: "9", content: "waiting", queue_order: 1 }),
    ];
    const t = fromRows(rows, "s1");
    expect(t.items.map((i) => `${i.kind}:${i.id}`)).toEqual(["user:a", "assistant:m1", "inbound:d", "inbound:e", "user:f", "assistant:h"]);
    expect(t.items[2]).toMatchObject({ fromSessionId: "s2" });
    expect(t.items[3]).toMatchObject({ apiKeyName: "ci-key", fromSessionId: undefined });
    expect((onlyAssistant(t).blocks[1] as ToolCall).status).toBe("done");
    expect(t.queue.map((q) => q.id)).toEqual(["i"]);
  });
});

describe("copy and retry helpers", () => {
  const t = run([
    { type: "local/user_send", id: "u1", text: "go", sentAt: "t0" },
    assistant("m1", [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "Looking." }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls\n-la" } }]),
    toolResult("t1", "a b"),
    assistant("m2", [{ type: "text", text: "All done." }]),
    { type: "result", subtype: "success" },
  ]);

  it("copies message text without thinking or tools", () => {
    expect(messageText(t.items[1]!)).toBe("Looking.");
    expect(finalMessageText(t, "m1")).toBe("All done.");
    expect(finalMessageText(t, "u1")).toBe("All done.");
  });

  it("summarises tool input on one line", () => {
    expect(toolSummary((t.items[1] as AssistantItem).blocks[2] as ToolCall)).toBe("ls");
  });

  it("exports concise and full transcripts", () => {
    expect(transcriptToMarkdown(t, { concise: true })).toBe("## User\n\ngo\n\n## Assistant\n\nLooking.\n\n## Assistant\n\nAll done.");
    const full = transcriptToMarkdown(t);
    expect(full).toContain("> hmm");
    expect(full).toContain("- Tool: Bash ls (done)");
    expect(full).toContain("```\na b\n```");
  });
});
