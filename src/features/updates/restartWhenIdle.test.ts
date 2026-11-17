import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdleRestart } from "./restartWhenIdle.ts";
import type { IdleReadiness, RestartNotice } from "./restartWhenIdle.contract.d.ts";

const idle: IdleReadiness = { kind: "ready", sessionStatuses: [], workspaceStates: ["ready"], setupRunning: false };
const busy: readonly IdleReadiness[] = [
  { kind: "unknown" },
  { ...idle, sessionStatuses: ["working"] },
  { ...idle, sessionStatuses: ["cancelling"] },
  { ...idle, sessionStatuses: ["waiting"] },
  { ...idle, workspaceStates: ["initializing"] },
  { ...idle, workspaceStates: ["setting_up"] },
  { ...idle, setupRunning: true },
];

function deferred() {
  let complete: () => void = () => { throw new Error("not initialized"); };
  const promise = new Promise<void>((resolve) => { complete = resolve; });
  return { promise, complete: () => complete() };
}

function fixture(options: { install?: () => Promise<void>; flush?: () => Promise<void>; restart?: () => Promise<void> } = {}) {
  let readiness: IdleReadiness = { kind: "unknown" };
  const events: string[] = [];
  const notices: RestartNotice[] = [];
  const installing = deferred();
  const draining = deferred();
  const coordinator = createIdleRestart({
    readiness: () => readiness,
    flush: async () => { events.push("flush"); draining.complete(); await options.flush?.(); },
    restart: async () => { events.push("restart"); await options.restart?.(); },
    notify: (notice) => notices.push(notice),
  });
  const update = { version: "candidate-1", install: async () => { events.push("install"); installing.complete(); await options.install?.(); } };
  return {
    coordinator, update, events, notices,
    installStarted: installing.promise, drainStarted: draining.promise,
    setReadiness(next: IdleReadiness) { readiness = next; },
    observe(next: IdleReadiness) { readiness = next; return coordinator.observe(); },
  };
}

test("disabled preference only reports the downloaded update", async () => {
  const v = fixture();
  await v.coordinator.downloaded(v.update, false);
  await v.observe(idle);
  assert.deepEqual(v.events, []);
  assert.deepEqual(v.notices, ["update-ready"]);
  v.coordinator.dispose();
});

test("enabled preference requires known readiness and serial install, acknowledged persistence, restart", async () => {
  const v = fixture();
  await v.coordinator.downloaded(v.update, true);
  await v.observe({ kind: "unknown" });
  assert.deepEqual(v.events, []);
  await v.observe(idle);
  assert.deepEqual(v.events, ["install", "flush", "restart"]);
  assert.deepEqual(v.notices, ["auto-when-idle"]);
  v.coordinator.dispose();
});

for (const [index, blocked] of busy.entries()) {
  test(`readiness guard ${index} prevents starting an automatic install`, async () => {
    const v = fixture();
    await v.coordinator.downloaded(v.update, true);
    await v.observe(blocked);
    assert.deepEqual(v.events, []);
    await v.observe(idle);
    assert.deepEqual(v.events, ["install", "flush", "restart"]);
    v.coordinator.dispose();
  });

  test(`readiness guard ${index} becoming blocked during install defers restart without reinstalling`, async () => {
    const installing = deferred();
    const v = fixture({ install: () => installing.promise });
    await v.coordinator.downloaded(v.update, true);
    const first = v.observe(idle);
    await v.installStarted;
    assert.deepEqual(v.events, ["install"]);
    v.setReadiness(blocked);
    installing.complete();
    await first;
    assert.deepEqual(v.events, ["install"]);
    await v.observe(idle);
    assert.deepEqual(v.events, ["install", "flush", "restart"]);
    v.coordinator.dispose();
  });

  test(`readiness guard ${index} becoming blocked during drain defers restart and requires a fresh drain`, async () => {
    const draining = deferred();
    const v = fixture({ flush: () => draining.promise });
    await v.coordinator.downloaded(v.update, true);
    const first = v.observe(idle);
    await v.drainStarted;
    assert.deepEqual(v.events, ["install", "flush"]);
    v.setReadiness(blocked);
    draining.complete();
    await first;
    assert.deepEqual(v.events, ["install", "flush"]);
    await v.observe(idle);
    assert.deepEqual(v.events, ["install", "flush", "flush", "restart"]);
    v.coordinator.dispose();
  });
}

test("duplicate download and idle observations do not duplicate notification or restart", async () => {
  const v = fixture();
  await v.coordinator.downloaded(v.update, true);
  await v.coordinator.downloaded(v.update, true);
  await v.observe(idle);
  await v.observe(idle);
  await v.coordinator.downloaded(v.update, true);
  assert.deepEqual(v.events, ["install", "flush", "restart"]);
  assert.deepEqual(v.notices, ["auto-when-idle"]);
  v.coordinator.dispose();
});

test("the arm is consumed before awaiting installation", async () => {
  const installing = deferred();
  const v = fixture({ install: () => installing.promise });
  await v.coordinator.downloaded(v.update, true);
  const first = v.observe(idle);
  await v.installStarted;
  await v.observe(idle);
  assert.deepEqual(v.events, ["install"]);
  installing.complete();
  await first;
  assert.deepEqual(v.events, ["install", "flush", "restart"]);
  v.coordinator.dispose();
});

test("restart does not run until the persistence acknowledgment settles", async () => {
  const draining = deferred();
  const v = fixture({ flush: () => draining.promise });
  await v.coordinator.downloaded(v.update, true);
  const attempt = v.observe(idle);
  await v.drainStarted;
  assert.deepEqual(v.events, ["install", "flush"]);
  await v.observe(idle);
  assert.deepEqual(v.events, ["install", "flush"]);
  draining.complete();
  await attempt;
  assert.deepEqual(v.events, ["install", "flush", "restart"]);
  v.coordinator.dispose();
});

for (const stage of ["install", "flush", "restart"] as const) {
  test(`${stage} rejection blocks later stages and does not silently rearm`, async () => {
    const v = fixture({ [stage]: async () => { throw new Error(`synthetic ${stage} failure`); } });
    await v.coordinator.downloaded(v.update, true);
    await v.observe(idle);
    await v.observe(idle);
    assert.deepEqual(v.events, stage === "install" ? ["install"] : stage === "flush" ? ["install", "flush"] : ["install", "flush", "restart"]);
    assert.deepEqual(v.notices, ["auto-when-idle", stage === "install" ? "install-failed" : stage === "flush" ? "flush-failed" : "restart-failed"]);
    v.coordinator.dispose();
  });
}

test("dispose before idle prevents any attempt", async () => {
  const v = fixture();
  await v.coordinator.downloaded(v.update, true);
  v.coordinator.dispose();
  await v.observe(idle);
  assert.deepEqual(v.events, []);
});

for (const stage of ["install", "flush"] as const) {
  test(`dispose during ${stage} permits no later side effect`, async () => {
    const pending = deferred();
    const v = fixture({ [stage]: () => pending.promise });
    await v.coordinator.downloaded(v.update, true);
    const attempt = v.observe(idle);
    await (stage === "install" ? v.installStarted : v.drainStarted);
    v.coordinator.dispose();
    pending.complete();
    await attempt;
    assert.deepEqual(v.events, stage === "install" ? ["install"] : ["install", "flush"]);
    await v.observe(idle);
    assert.deepEqual(v.events, stage === "install" ? ["install"] : ["install", "flush"]);
  });
}
