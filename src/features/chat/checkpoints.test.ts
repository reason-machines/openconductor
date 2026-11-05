// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpointId, parseResetFilesPreference, restoreCheckpoint, turnCheckpointRef, turnKey, type Invoke } from "./checkpoints.ts";

function fakeInvoke(responses: Record<string, unknown>) {
  const calls: [string, Record<string, unknown>][] = [];
  const invoke: Invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    const r = responses[cmd];
    if (r instanceof Error) throw r;
    return r;
  };
  return { invoke, calls };
}

test("checkpoint ids follow Conductor's session-<session>-turn-<turn>-<start|end> and are ref-safe", () => {
  assert.equal(checkpointId("ws1", "ws1:t3", "start"), "session-ws1-turn-t3-start");
  assert.equal(checkpointId("ws1", "ws1:t3", "end"), "session-ws1-turn-t3-end");
  assert.equal(turnKey("ws1", "other:t9"), "other-t9");
  assert.equal(checkpointId("a b", "a b:t1", "end"), "session-a-b-turn-t1-end");
});

test("the ref sent to the backend names the same checkpoints Reset chat looks for", () => {
  const ref = turnCheckpointRef("a b", "a b:0f6c-uuid");
  assert.deepEqual(ref, { sessionId: "a-b", turnId: "0f6c-uuid" });
  // The backend's id is session-<sessionId>-turn-<turnId>-<point> (src-tauri/src/diff/git.rs).
  assert.equal(`session-${ref.sessionId}-turn-${ref.turnId}-end`, checkpointId("a b", "a b:0f6c-uuid", "end"));
});

test("reset with files checks the end checkpoint exists, then restores it", async () => {
  const f = fakeInvoke({ checkpoint_exists: true, checkpoint_restore: null });
  await restoreCheckpoint(f.invoke, "/w", "ws1", "ws1:t2", true);
  assert.deepEqual(
    f.calls.map(([c, a]) => [c, a.checkpointId]),
    [
      ["checkpoint_exists", "session-ws1-turn-t2-end"],
      ["checkpoint_restore", "session-ws1-turn-t2-end"],
    ],
  );
});

test("a missing checkpoint fails with Conductor's message and restores nothing", async () => {
  const f = fakeInvoke({ checkpoint_exists: false });
  await assert.rejects(restoreCheckpoint(f.invoke, "/w", "ws1", "ws1:t2", true), /^Error: Checkpoint not found for this turn$/);
  assert.deepEqual(f.calls.map(([c]) => c), ["checkpoint_exists"]);
});

test("reset without files touches no checkpoint", async () => {
  const f = fakeInvoke({});
  await restoreCheckpoint(f.invoke, "/w", "ws1", "ws1:t2", false);
  assert.deepEqual(f.calls, []);
});

test("Also reset files defaults to on", () => {
  assert.equal(parseResetFilesPreference(null), true);
  assert.equal(parseResetFilesPreference("true"), true);
  assert.equal(parseResetFilesPreference("false"), false);
});
