import { test } from "node:test";
import assert from "node:assert/strict";
import { clip, transcriptText } from "./transcriptCopy.ts";
import type { ChatTranscript } from "./reducer.ts";
import type { Block, ChatMessage } from "./types.ts";

let n = 0;
const msg = (role: ChatMessage["role"], turnId: string, blocks: Block[]): ChatMessage => ({
  id: `m${++n}`,
  sessionId: "s",
  turnId,
  role,
  createdAt: new Date(Date.UTC(2026, 10, 6, 0, 0, n)).toISOString(),
  blocks,
});
const chat = (messages: ChatMessage[]): ChatTranscript => ({ sessionId: "s", messages, activeTurn: null, turns: {} });

const t = chat([
  msg("user", "t1", [{ type: "text", text: "Fix the login loop" }]),
  msg("assistant", "t1", [{ type: "text", text: "Looking." }, { type: "tool_use", id: "a", name: "Bash", input: { command: "rg redirect" } }]),
  msg("user", "t1", [{ type: "tool_result", toolUseId: "a", content: "src/auth.ts:12\nsrc/router.ts:40" }]),
  msg("assistant", "t1", [{ type: "tool_use", id: "b", name: "Read", input: {} }, { type: "text", text: "Fixed it." }]),
]);

test("complete keeps every message, tool calls with inputs and results", () => {
  assert.equal(
    transcriptText(t, "complete"),
    [
      "## User\n\nFix the login loop",
      "## Assistant\n\nLooking.\n\n    Bash: rg redirect\n    ↳ src/auth.ts:12\n      src/router.ts:40\n\n    Read\n\nFixed it.",
    ].join("\n\n"),
  );
});

test("concise is the fork transcript: last reply with text, the rest elided", () => {
  assert.equal(transcriptText(t, "concise"), "## User\n\nFix the login loop\n\n## Assistant\n\n[1 message elided]\n\n[1 tool call elided]\n\nFixed it.");
});

test("nothing to copy gives null", () => {
  assert.equal(transcriptText(chat([]), "complete"), null);
  assert.equal(transcriptText(chat([]), "concise"), null);
});

test("long bodies stop after 10 lines or 500 characters", () => {
  assert.equal(clip(Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n")), "l0\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\n…\n(2 more lines)");
  assert.equal(clip("x".repeat(501)), `${"x".repeat(500)}\n…\n(truncated)`);
});
