import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reasonChat, startTurn, applyReasonPayload, failTurn, type ReasonTurnEnd, type ReasonPayload } from "./reason.ts";
import { emptyTranscript, applyChatEvents, type ChatTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";
import { foldAgentRows } from "./toolGroups.ts";
import { diffForSave, restoreEvents } from "./persist.ts";

const chatId = "source-only-chat:claude";
const now = new Date("2026-11-17T00:00:00.000Z");
const priorText = "Work in progress.";
const fixture = JSON.parse(readFileSync(new URL("../../../evidence/chat/result-error-preview/wire.json", import.meta.url), "utf8")) as { id: string; end: ReasonTurnEnd; preview: boolean }[];

function chat(end: ReasonTurnEnd, payloads: ReasonPayload[] = [], promptFailed = false, sessionId = chatId): ChatTranscript {
  let state = reasonChat(sessionId);
  let transcript = emptyTranscript(state.chatId);
  const apply = (step: ReturnType<typeof startTurn>) => {
    state = step.state;
    const reduced = applyChatEvents(transcript, step.events);
    assert.ok(reduced.ok);
    transcript = reduced.transcript;
  };
  apply(startTurn(state, "Synthetic prompt.", now));
  apply(applyReasonPayload(state, { chatId: sessionId, type: "text", text: priorText }, now));
  for (const p of payloads) apply(applyReasonPayload(state, p, now));
  apply(promptFailed ? failTurn(state, transcript.activeTurn!, end.message!, now) : applyReasonPayload(state, { chatId: sessionId, type: "turnEnded", end }, now));
  return transcript;
}

function previewTexts(transcript: ChatTranscript): string[] {
  return foldAgentRows(buildRows(transcript), transcript.activeTurn).flatMap((row) => row.kind === "agent" ? row.items.flatMap((item) => item.kind === "part" && item.preview && item.part.kind === "text" ? [item.part.text] : []) : []);
}

for (const entry of fixture) {
  test(`Claude result boundary: ${entry.id}`, () => {
    const before = JSON.stringify(entry);
    const transcript = chat(entry.end);
    assert.deepEqual(previewTexts(transcript), entry.preview ? [priorText] : []);
    const footer = buildRows(transcript).find((r) => r.kind === "turn_end");
    assert.equal(footer?.status, entry.end.outcome);
    assert.equal(footer?.error, entry.end.message);
    assert.equal(transcript.turns[transcript.messages[0]!.turnId]?.resultError, entry.end.resultError);
    assert.equal(JSON.stringify(entry), before, "frozen wire input unchanged");
    if (entry.end.resultError) {
      const rows = foldAgentRows(buildRows(transcript), null);
      const agent = rows.find((r) => r.kind === "agent");
      assert.ok(agent?.kind === "agent");
      assert.equal(agent.items.length, 1, "one prior message does not become a summary");
      assert.equal(agent.items[0]?.kind, "part");
    }
  });
}

test("explicit result error survives save and restore with the same preview", () => {
  const transcript = chat({ outcome: "failed", message: "Synthetic result failure.", resultError: true });
  const saved = diffForSave(null, transcript).upserts.map((r) => r.fullMessage);
  const restored = applyChatEvents(emptyTranscript(transcript.sessionId), restoreEvents(transcript.sessionId, saved));
  assert.ok(restored.ok);
  assert.deepEqual(restored.transcript, transcript);
  assert.deepEqual(previewTexts(restored.transcript), []);
});

test("legacy generic failure stays status-only before and after restart", () => {
  const transcript = chat({ outcome: "failed", message: "Synthetic result failure." });
  const restored = applyChatEvents(emptyTranscript(transcript.sessionId), restoreEvents(transcript.sessionId, diffForSave(null, transcript).upserts.map((r) => r.fullMessage)));
  assert.ok(restored.ok);
  assert.deepEqual(restored.transcript, transcript);
  assert.deepEqual(previewTexts(restored.transcript), [priorText]);
});

test("failed prompt and standalone API error do not imply result-error provenance", () => {
  assert.deepEqual(previewTexts(chat({ outcome: "failed", message: "Transport failed." }, [], true)), [priorText]);
  assert.deepEqual(previewTexts(chat({ outcome: "failed", message: "API failed." }, [{ chatId, type: "error", code: "auth", status: 401, message: "API failed." }])), [priorText]);
});

test("Reason and Codex no-marker failures keep their existing preview", () => {
  for (const backend of ["reason", "codex"]) {
    const transcript = chat({ outcome: "failed", message: "Synthetic result failure." }, [], false, `source-only-chat:${backend}`);
    assert.deepEqual(previewTexts(transcript), [priorText], backend);
    assert.equal(transcript.turns[transcript.messages[0]!.turnId]?.resultError, undefined);
  }
});

test("nested tool failure does not become a terminal result error", () => {
  const transcript = chat({ outcome: "completed" }, [{ chatId, type: "tool", id: "t1", title: "Read", kind: "read", status: "failed", output: "Not found", locations: [], diffs: [] }]);
  assert.deepEqual(previewTexts(transcript), [priorText]);
});

test("protected plan/question message keeps its preview despite a later error result", () => {
  for (const name of ["ExitPlanMode", "AskUserQuestion"]) {
    const transcript = chat({ outcome: "failed", message: "Failed.", resultError: true }, [{ chatId, type: "tool", id: "protected", title: name, toolName: name, kind: "other", status: "completed", output: "", locations: [], diffs: [] }]);
    assert.deepEqual(previewTexts(transcript), [priorText], name);
  }
});

test("result-error metadata is ignored on success, cancellation, and supersession", () => {
  for (const outcome of ["completed", "cancelled", "superseded"] as const) {
    const transcript = chat({ outcome, resultError: true });
    assert.deepEqual(previewTexts(transcript), [priorText]);
    assert.equal(transcript.turns[transcript.messages[0]!.turnId]?.resultError, undefined);
  }
});

test("a subsequent turn does not inherit the previous result error", () => {
  const transcript = chat({ outcome: "failed", message: "Failed.", resultError: true });
  const step = startTurn(reasonChat(transcript.sessionId), "Next", new Date(now.getTime() + 1), "t2");
  const result = applyChatEvents(transcript, step.events);
  assert.ok(result.ok);
  assert.equal(result.transcript.turns.t2?.resultError, undefined);
});
