import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRUPTED_MESSAGE,
  GIT_OPERATION_WARNING,
  RUNNING_AGENTS_DIALOG,
  blockedByAgents,
  emitArchiveEvent,
  failureToast,
  onArchiveEvent,
  startArchive,
  type ArchiveMode,
  type ArchiveResult,
  type ArchiveEvent,
} from "./archiveModel.ts";

test("a working agent blocks archive until the user confirms", () => {
  assert.equal(blockedByAgents("working", undefined), true);
  assert.equal(blockedByAgents("working", true), false);
  for (const s of ["idle", "needs-review", "archived", undefined]) assert.equal(blockedByAgents(s, undefined), false);
});

test("the running-agents dialog uses Conductor's copy", () => {
  assert.deepEqual(RUNNING_AGENTS_DIALOG, {
    title: "Archive workspace?",
    description: "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.",
    cancelLabel: "Cancel",
    confirmLabel: "Stop agents and archive",
  });
});

test("a git operation in safe mode offers the discard retry; after it, the plain message", () => {
  const err = { code: "WorkspaceArchiveBlockedByGitOperationError", message: "OpenConductor can't safely archive this workspace because a Git operation is in progress." };
  assert.deepEqual(failureToast(err, "safe"), { kind: "git-operation", message: GIT_OPERATION_WARNING });
  assert.deepEqual(failureToast(err), { kind: "git-operation", message: GIT_OPERATION_WARNING });
  assert.deepEqual(failureToast(err, "discardGitOperationState"), { kind: "error", message: err.message });
  assert.equal(GIT_OPERATION_WARNING, "Because a Git operation (merge, rebase, cherry-pick, or revert) is in progress, archiving may lose some of your work.");
});

test("a missing directory reads as a corrupted workspace; anything else shows its message", () => {
  assert.deepEqual(failureToast({ code: "WORKSPACE_CORRUPTED", message: "Workspace directory not found" }), { kind: "error", message: CORRUPTED_MESSAGE });
  assert.deepEqual(failureToast({ code: "ArchiveFailed", message: "Failed to archive ws: boom" }), { kind: "error", message: "Failed to archive ws: boom" });
  assert.deepEqual(failureToast(new Error("ipc down")), { kind: "error", message: "ipc down" });
  assert.deepEqual(failureToast("plain"), { kind: "error", message: "plain" });
});

test("archive events reach every listener until it unsubscribes", () => {
  const seen: ArchiveEvent<string>[] = [];
  const off = onArchiveEvent<string>((e) => seen.push(e));
  emitArchiveEvent<string>({ type: "agents-running", action: "a" });
  off();
  emitArchiveEvent<string>({ type: "agents-running", action: "b" });
  assert.deepEqual(seen, [{ type: "agents-running", action: "a" }]);
});

type Act = { id: string; mode?: ArchiveMode; stopRunningAgents?: boolean };

function harness(status: string | undefined, run: ((mode: ArchiveMode) => Promise<ArchiveResult>) | null) {
  const log: string[] = [];
  const events: ArchiveEvent<Act>[] = [];
  const deps = {
    status,
    hide: () => log.push("hide"),
    run: run && ((mode: ArchiveMode) => (log.push(`run:${mode}`), run(mode))),
    reload: () => log.push("reload"),
    emit: (e: ArchiveEvent<Act>) => events.push(e),
  };
  return { log, events, deps };
}

const OK: ArchiveResult = { archived: true, branch: "sven/ws", archiveCommit: "abc", notices: [{ kind: "error", message: "Archive script failed (exit code 3)" }] };

test("startArchive asks instead of archiving over a running agent, and archives once confirmed", async () => {
  const h = harness("working", async () => OK);
  await startArchive({ id: "w" }, h.deps);
  assert.deepEqual(h.log, []);
  assert.deepEqual(h.events, [{ type: "agents-running", action: { id: "w" } }]);
  const c = harness("working", async () => OK);
  await startArchive({ id: "w", stopRunningAgents: true }, c.deps);
  assert.deepEqual(c.log, ["hide", "run:safe"]);
});

test("startArchive hides the row first, then reports the result with its notices", async () => {
  const h = harness("idle", async () => OK);
  await startArchive({ id: "w" }, h.deps);
  assert.deepEqual(h.log, ["hide", "run:safe"]);
  assert.deepEqual(h.events, [{ type: "archived", action: { id: "w" }, result: OK }]);
});

test("startArchive brings the row back and reports a failure with the mode it ran in", async () => {
  const err = { code: "WorkspaceArchiveBlockedByGitOperationError", message: "x" };
  const h = harness("idle", async () => Promise.reject(err));
  await startArchive({ id: "w", mode: "discardGitOperationState" }, h.deps);
  assert.deepEqual(h.log, ["hide", "run:discardGitOperationState", "reload"]);
  assert.deepEqual(h.events, [{ type: "failed", action: { id: "w", mode: "discardGitOperationState" }, error: err, mode: "discardGitOperationState" }]);
});

test("outside the desktop app startArchive only hides the row", async () => {
  const h = harness(undefined, null);
  await startArchive({ id: "w" }, h.deps);
  assert.deepEqual(h.log, ["hide"]);
  assert.deepEqual(h.events, []);
});
