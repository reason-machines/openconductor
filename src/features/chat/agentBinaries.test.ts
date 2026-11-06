import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStatus,
  bannerModel,
  bannerStatus,
  binaryAgentFor,
  createAgentBinaryStore,
  failedAgents,
  megabytes,
  statusKey,
  toStatus,
  type AgentBinaryStatus,
  type BinaryAgent,
} from "./agentBinaries.ts";

const MB = 1024 * 1024;
const status = (over: Partial<AgentBinaryStatus> = {}): AgentBinaryStatus => ({
  agent: "claude",
  kind: "current",
  state: "downloading",
  version: "2.1.284",
  bytesDownloaded: 0,
  ...over,
});

test("statuses are keyed <agent>:<kind> and payload nulls become absent (Conductor's QV / XV)", () => {
  assert.equal(statusKey("codex"), "codex:current");
  const s = toStatus({ agent: "codex", kind: "current", state: "retrying", version: "0.156.1", bytesDownloaded: 5, bytesTotal: null, error: "404", nextAttemptUnixMs: 9, attempt: 2 });
  assert.deepEqual(s, { agent: "codex", kind: "current", state: "retrying", version: "0.156.1", bytesDownloaded: 5, bytesTotal: undefined, error: "404", nextAttemptUnixMs: 9, attempt: 2 });
  const next = applyStatus(applyStatus({}, status()), status({ state: "ready" }));
  assert.deepEqual(Object.keys(next), ["claude:current"]);
  assert.equal(next["claude:current"].state, "ready");
});

test("only current statuses in failed are retried", () => {
  let s = applyStatus({}, status({ state: "failed" }));
  s = applyStatus(s, status({ agent: "codex", state: "failed", kind: "other" }));
  s = applyStatus(s, status({ agent: "codex", state: "ready" }));
  assert.deepEqual(failedAgents(s), ["claude"]);
});

test("the banner applies to Claude Code and Codex chats only", () => {
  assert.equal(binaryAgentFor("claude"), "claude");
  assert.equal(binaryAgentFor("codex"), "codex");
  assert.equal(binaryAgentFor("reason"), undefined);
});

test("banner shows for a local chat while the status exists, is not ready and no executable path is set (Conductor's ido)", () => {
  const base = { agent: "claude" as BinaryAgent, local: true, customPath: null, customPathLoading: false, status: status() };
  assert.equal(bannerStatus(base), base.status);
  assert.equal(bannerStatus({ ...base, customPath: "   " }), base.status, "a blank path is unset");
  assert.equal(bannerStatus({ ...base, customPath: "/opt/claude" }), undefined, "Settings' executable path wins");
  assert.equal(bannerStatus({ ...base, customPathLoading: true }), undefined, "hidden while settings load");
  assert.equal(bannerStatus({ ...base, status: status({ state: "ready" }) }), undefined);
  assert.equal(bannerStatus({ ...base, status: undefined }), undefined);
  assert.equal(bannerStatus({ ...base, local: false }), undefined);
  assert.equal(bannerStatus({ ...base, agent: undefined }), undefined);
});

test("downloading text: version, then MB downloaded / total (Conductor's UAo and gSt)", () => {
  assert.equal(megabytes(12.6 * MB), "13 MB");
  assert.deepEqual(bannerModel(status({ bytesDownloaded: 12 * MB, bytesTotal: 80 * MB }), 0), {
    failed: false,
    title: "Downloading Claude Code 2.1.284…",
    detail: " 12 MB / 80 MB",
    error: undefined,
  });
  assert.equal(bannerModel(status({ bytesDownloaded: 3 * MB }), 0).detail, " 3 MB", "no total: bytes so far");
  assert.equal(bannerModel(status({ state: "started" }), 0).detail, "", "nothing yet: title only");
  assert.equal(bannerModel(status({ agent: "codex", version: "0.156.1", bytesTotal: 0, bytesDownloaded: 0 }), 0).title, "Downloading Codex 0.156.1…");
});

test("retrying text counts down to the next attempt and offers Retry now", () => {
  const m = bannerModel(status({ state: "retrying", nextAttemptUnixMs: 10_000, attempt: 2, error: "HTTP 404" }), 6_200);
  assert.deepEqual(m, { failed: false, title: "Downloading Claude Code 2.1.284…", detail: "Retrying in 4s (attempt 2)", error: "HTTP 404", action: "Retry now" });
  assert.equal(bannerModel(status({ state: "retrying", nextAttemptUnixMs: 1_000 }), 5_000).detail, "Retrying in 0s", "never negative; no attempt, no suffix");
});

test("failed text: Couldn't download, the error behind see error, Retry", () => {
  assert.deepEqual(bannerModel(status({ agent: "codex", state: "failed", error: "sha256 mismatch" }), 0), {
    failed: true,
    title: "Couldn't download Codex.",
    detail: "",
    error: "sha256 mismatch",
    action: "Retry",
  });
  assert.equal(bannerModel(status({ state: "failed", error: "" }), 0).error, undefined, "no error, no toggle");
});

function fakeBridge(initial: unknown[]) {
  const calls: string[] = [];
  let emit: (raw: unknown) => void = () => undefined;
  return {
    calls,
    emit: (raw: unknown) => emit(raw),
    bridge: {
      async listen(onStatus: (raw: unknown) => void) {
        calls.push("listen");
        emit = onStatus;
        return () => undefined;
      },
      async getState() {
        calls.push("getState");
        return initial;
      },
      async requestDownload(agent: BinaryAgent) {
        calls.push(`request:${agent}`);
      },
    },
  };
}

test("initialize subscribes, hydrates, then retries each failed download once", async () => {
  const f = fakeBridge([status({ state: "failed", error: "x" }), status({ agent: "codex", state: "ready", version: "0.156.1" })]);
  const store = createAgentBinaryStore(f.bridge);
  let changes = 0;
  store.subscribe(() => changes++);
  await Promise.all([store.initialize(), store.initialize()]);
  await store.initialize();
  assert.deepEqual(f.calls, ["listen", "getState", "request:claude"]);
  assert.equal(changes, 2);
  assert.equal(store.getStatus("codex")?.state, "ready");

  // Progress events replace the agent's status; empty payloads are ignored.
  f.emit(null);
  f.emit({ agent: "claude", kind: "current", state: "downloading", version: "2.1.284", bytesDownloaded: MB, bytesTotal: 2 * MB });
  assert.equal(store.getStatus("claude")?.bytesDownloaded, MB);
  assert.equal(changes, 3);

  await store.retry("codex");
  assert.equal(f.calls.at(-1), "request:codex");
});

test("a bridge that fails to listen or hydrate still retries what it knows and logs", async () => {
  const logged: string[] = [];
  const store = createAgentBinaryStore(
    {
      listen: () => Promise.reject(new Error("no events")),
      getState: () => Promise.reject(new Error("no state")),
      requestDownload: () => Promise.reject(new Error("unused")),
    },
    (msg) => logged.push(msg),
  );
  await store.initialize();
  assert.deepEqual(logged, ["Failed to subscribe to agent_binary_progress:", "Failed to hydrate agent binary state:"]);
  assert.deepEqual(store.statuses(), {});
});
