import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTranscript } from "./reducer.ts";
import { transcriptMatches } from "./transcriptSearch.ts";
import type { ChatMessage } from "./types.ts";

function message(id: string, turnId: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, turnId, role, sessionId: "selected", createdAt: "2026-11-11T12:00:00Z", blocks: [{ type: "text", text }] };
}

test("search is empty on loaded empty chats and never crosses messages or includes foreign-session reports", () => {
  const transcript = emptyTranscript("selected");
  assert.deepEqual(transcriptMatches(transcript, "needle"), []);
  transcript.messages = [
    message("a", "one", "user", "nee"), message("b", "one", "assistant", "dle"),
    { ...message("foreign", "one", "user", "needle"), sessionId: "other" },
    { ...message("report", "one", "user", "needle"), senderSessionId: "child" },
    message("system", "one", "system", "needle"),
  ];
  assert.deepEqual(transcriptMatches(transcript, "needle"), []);
});

test("matches follow turn order, user before assistant, with a turn-wide occurrence ordinal", () => {
  const transcript = emptyTranscript("selected");
  transcript.messages = [
    message("answer", "first", "assistant", "Needle"), message("prompt", "first", "user", "needle needle"),
    message("next", "second", "user", "needle"),
  ];
  assert.deepEqual(transcriptMatches(transcript, "needle"), [
    { turnId: "first", messageId: "prompt", textOffset: 0, occurrenceInTurn: 0 },
    { turnId: "first", messageId: "prompt", textOffset: 7, occurrenceInTurn: 1 },
    { turnId: "first", messageId: "answer", textOffset: 0, occurrenceInTurn: 2 },
    { turnId: "second", messageId: "next", textOffset: 0, occurrenceInTurn: 0 },
  ]);
});
