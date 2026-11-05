// Run: node --test "src/**/*.test.ts"
// Reason chat flow: backend payloads (shapes pinned by
// src-tauri/src/reason_acp/wire_tests.rs) through the transcript to rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReasonPayload, cancelUnsent, failTurn, newestTurn, reasonChat, startTurn, type ReasonChatState, type ReasonPayload, type ReasonPath } from "./reason.ts";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";
import type { ChatEvent } from "./types.ts";

const CHAT = "repo/tokyo";
const HOME = "/Users/sven/conductor/workspaces/repo/tokyo";
const CLOUD = "/home/runner/.reason/workspace/sessions/child-1/repo";
const local: ReasonPath = { raw: HOME, place: "local", relative: "" };
const cloud: ReasonPath = { raw: CLOUD, place: "cloud", relative: "", sessionId: "child-1" };

type Payload = ReasonPayload extends infer P ? (P extends unknown ? Omit<P, "chatId"> : never) : never;
type Input = { prompt: string } | Payload;

/** Feeds prompts and payloads through the adapter and the transcript reducer. */
function run(inputs: Input[]) {
  let state: ReasonChatState = reasonChat(CHAT);
  let t: ChatTranscript = emptyTranscript(CHAT);
  const sessions: string[] = [];
  for (const input of inputs) {
    const step = "prompt" in input ? startTurn(state, input.prompt) : applyReasonPayload(state, { chatId: CHAT, ...input } as ReasonPayload);
    state = step.state;
    if (step.sessionId) sessions.push(step.sessionId);
    const r = applyChatEvents(t, step.events as ChatEvent[]);
    assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
    t = r.transcript;
  }
  return { state, t, rows: buildRows(t), sessions };
}

const pwdTool = (id: string, at: ReasonPath, status: "running" | "completed" = "completed"): Payload => ({
  type: "tool",
  id,
  title: "pwd",
  kind: "execute",
  status,
  output: status === "completed" ? at.raw : null,
  diffs: [],
  locations: [at],
});

test("one chat shows a local home path, then a cloud /repo path in a follow-up", () => {
  const { rows, sessions, t } = run([
    { prompt: "run pwd here" },
    { type: "sessionStarted", sessionId: "s-1" },
    pwdTool("tool-1", local),
    { type: "text", text: `You are in ${HOME.slice(0, 10)}` },
    { type: "text", text: HOME.slice(10) },
    { type: "turnEnded", end: { outcome: "completed" } },
    { prompt: "now run pwd on a cloud computer" },
    pwdTool("tool-2", cloud),
    { type: "text", text: `The cloud checkout is ${CLOUD}` },
    { type: "turnEnded", end: { outcome: "completed" } },
  ]);
  assert.deepEqual(sessions, ["s-1"]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["user", "assistant", "turn_end", "user", "assistant", "turn_end"],
  );
  const tools = rows.flatMap((r) => (r.kind === "assistant" ? r.parts.filter((p) => p.kind === "tool") : []));
  assert.deepEqual(
    tools.map((p) => (p.kind === "tool" ? [p.call.status, p.call.result, (p.call.input as { paths: ReasonPath[] }).paths[0]!.place] : [])),
    [
      ["done", HOME, "local"],
      ["done", CLOUD, "cloud"],
    ],
  );
  const ends = rows.filter((r) => r.kind === "turn_end");
  assert.deepEqual(
    ends.map((r) => (r.kind === "turn_end" ? [r.status, r.finalText] : [])),
    [
      ["completed", `You are in ${HOME}`],
      ["completed", `The cloud checkout is ${CLOUD}`],
    ],
  );
  assert.equal(t.activeTurn, null);
});

test("a tool row updates in place and text after it starts a new block", () => {
  const { rows } = run([{ prompt: "go" }, pwdTool("x", local, "running"), pwdTool("x", local), { type: "thought", text: "ok" }, { type: "text", text: "done" }]);
  const a = rows.find((r) => r.kind === "assistant");
  assert.ok(a && a.kind === "assistant");
  assert.deepEqual(
    a.parts.map((p) => p.kind),
    ["tool", "thinking", "text"],
  );
});

test("device_not_found fails the turn with the error, not a reply", () => {
  const msg = "Reason request failed (404 device_not_found)";
  const { rows } = run([
    { prompt: "hi" },
    { type: "error", code: "device_not_found", status: 404, message: msg },
    { type: "turnEnded", end: { outcome: "failed", message: msg } },
  ]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["user", "turn_end"],
  );
  const end = rows[1]!;
  assert.ok(end.kind === "turn_end");
  assert.equal(end.status, "failed");
  assert.equal(end.error, msg);
  assert.equal(end.retryPrompt, "hi");
});

test("a follow-up during a turn supersedes it; the end goes to the older turn", () => {
  const { t, rows } = run([
    { prompt: "first" },
    { type: "text", text: "working" },
    { prompt: "actually do this" },
    { type: "turnEnded", end: { outcome: "superseded" } },
    { type: "text", text: "on it" },
    { type: "turnEnded", end: { outcome: "completed" } },
  ]);
  assert.deepEqual(
    Object.values(t.turns).map((s) => s.status),
    ["completed", "completed"],
  );
  const replies = rows.filter((r) => r.kind === "turn_end").map((r) => (r.kind === "turn_end" ? r.finalText : ""));
  assert.deepEqual(replies, ["working", "on it"]);
});

test("a mid-turn report is attributed to another session, never the user", () => {
  const { rows } = run([{ prompt: "spawn a child" }, { type: "report", text: "child finished" }, { type: "text", text: "the child is done" }]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["user", "report", "assistant"],
  );
});

test("Stop ends the turn cancelled with the prompt offered again; a failed call fails it", () => {
  const stopped = run([{ prompt: "long job" }, { type: "turnEnded", end: { outcome: "cancelled" } }]);
  const end = stopped.rows.at(-1)!;
  assert.ok(end.kind === "turn_end" && end.status === "cancelled" && end.retryPrompt === "long job");

  let state = startTurn(reasonChat(CHAT), "hi").state;
  const when = new Date("2026-11-05T10:00:00.000Z");
  const step = failTurn(state, newestTurn(state)!, "The Reason CLI was not found.", when);
  state = step.state;
  assert.equal(state.open.length, 0);
  assert.deepEqual(step.events[0], { type: "turn_status", sessionId: CHAT, turnId: `${CHAT}:t1`, status: "failed", error: "The Reason CLI was not found.", at: when.toISOString() });
});

test("a stopped turn marks its prompt cancelled and records start and end times", () => {
  const t0 = new Date("2026-11-05T10:00:00.000Z");
  const t1 = new Date("2026-11-05T10:00:07.000Z");
  const started = startTurn(reasonChat(CHAT), "long job", t0);
  const ended = applyReasonPayload(started.state, { chatId: CHAT, type: "turnEnded", end: { outcome: "cancelled" } }, t1);
  assert.deepEqual(started.events[1], { type: "turn_status", sessionId: CHAT, turnId: `${CHAT}:t1`, status: "running", at: t0.toISOString() });
  const [upsert, status] = ended.events;
  assert.ok(upsert?.type === "upsert" && upsert.message.role === "user" && upsert.message.cancelledAt === t1.toISOString());
  assert.deepEqual(status, { type: "turn_status", sessionId: CHAT, turnId: `${CHAT}:t1`, status: "cancelled", at: t1.toISOString() });
  const done = applyReasonPayload(startTurn(reasonChat(CHAT), "x", t0).state, { chatId: CHAT, type: "turnEnded", end: { outcome: "completed" } }, t1);
  assert.equal(done.events.length, 1);
});

test("a turn stopped before its prompt reached Reason ends cancelled, leaving earlier open turns running", () => {
  const t0 = new Date("2026-11-05T10:00:00.000Z");
  const t1 = new Date("2026-11-05T10:00:01.000Z");
  const running = startTurn(reasonChat(CHAT), "running job", t0).state;
  const both = startTurn(running, "steer", t0).state;
  const step = cancelUnsent(both, `${CHAT}:t2`, t1);
  assert.deepEqual(step.state.open.map((t) => t.turnId), [`${CHAT}:t1`]);
  const [upsert, status] = step.events;
  assert.ok(upsert?.type === "upsert" && upsert.message.id === `${CHAT}:t2:user` && upsert.message.cancelledAt === t1.toISOString());
  assert.deepEqual(status, { type: "turn_status", sessionId: CHAT, turnId: `${CHAT}:t2`, status: "cancelled", at: t1.toISOString() });
  assert.deepEqual(cancelUnsent(step.state, `${CHAT}:t2`, t1).events, []);
});
