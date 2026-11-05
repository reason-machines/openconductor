import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceProgress, type CreateProgress } from "./createFlow.ts";
import { setupFeed, setupRef } from "./setupOnCreate.ts";
import type { ScriptEvent } from "../scripts/model.ts";

const WS = "repo/lisbon";
const out = (chunk: string, workspaceId = WS, kind: "setup" | "run" = "setup"): ScriptEvent => ({ type: "output", workspaceId, kind, scriptId: kind, chunk });
const finished = (state: "completed" | "failed" | "cancelled", exitCode: number | null): ScriptEvent => ({
  type: "setupFinished",
  workspaceId: WS,
  state,
  exitCode,
  logPath: "/tmp/conductor-setup-repo-lisbon.log",
  log: "",
});

function run(events: ScriptEvent[]): { progress: CreateProgress; log: string | null } {
  const feed = setupFeed(WS);
  let p: CreateProgress = { step: "creating" };
  p = reduceProgress(p, { type: "created", workspaceId: WS });
  p = reduceProgress(p, { type: "setup_detected", hasScript: true });
  for (const e of events) for (const c of feed.push(e)) p = reduceProgress(p, c);
  return { progress: p, log: feed.logPath() };
}

test("setupRef maps the created workspace onto the setup command's WorkspaceRef", () => {
  const ref = setupRef(
    { id: "repo", root: "/src/repo", defaultBranch: "main" },
    { id: WS, directoryName: "lisbon", path: "/ws/repo/lisbon", branchName: "sven/lisbon" },
  );
  assert.deepEqual(ref, {
    workspaceId: WS,
    repositoryId: "repo",
    repoRoot: "/src/repo",
    workspacePath: "/ws/repo/lisbon",
    workspaceName: "lisbon",
    defaultBranch: "main",
    targetBranch: null,
  });
});

test("successful setup streams lines across chunk boundaries, then the workspace is ready", () => {
  const { progress, log } = run([out("npm inst"), out("all\nadded 3 packages\r\n"), out("done"), finished("completed", 0)]);
  assert.deepEqual(progress, { step: "ready", workspaceId: WS, ranSetup: true });
  assert.equal(log, "/tmp/conductor-setup-repo-lisbon.log");
});

test("a failing setup keeps its log lines and exit code", () => {
  const { progress } = run([out("building\n"), out("error: boom"), finished("failed", 2)]);
  assert.deepEqual(progress, { step: "setup_failed", workspaceId: WS, exitCode: 2, log: ["building", "error: boom"] });
});

test("a cancelled setup is reported as failed without an exit code", () => {
  const { progress } = run([finished("cancelled", null)]);
  assert.equal(progress.step, "setup_failed");
  assert.equal(progress.step === "setup_failed" && progress.exitCode, null);
});

test("output of other workspaces and of run scripts is ignored", () => {
  const { progress } = run([out("x\n", "repo/other"), out("y\n", WS, "run"), out("z\n")]);
  assert.deepEqual(progress, { step: "running_setup", workspaceId: WS, log: ["z"] });
});
