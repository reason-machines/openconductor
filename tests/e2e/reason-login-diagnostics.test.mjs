import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { installReasonLoginDiagnostics, traceReasonLogin } from "./reason-login-diagnostics.mjs";

const canary = "SENSITIVE_CANARY_NEVER_LOG";
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(invoke = () => Promise.resolve({ state: "idle" })) {
  const listeners = new Map();
  const child = {};
  const other = {};
  const button = { disabled: false, isConnected: true, contains: (node) => node === button || node === child };
  Object.defineProperty(button, "textContent", { get() { throw new Error("Must not inspect button text"); } });
  const controls = { dataset: { state: "idle" } };
  const section = { contains: (node) => node === button || node === child || node === other };
  const scope = {
    __TAURI_INTERNALS__: { invoke },
    document: {
      querySelector(selector) {
        if (selector.endsWith("> button")) return button;
        return selector.includes("reason-sign-in-controls") ? controls : section;
      },
      addEventListener(type, listener, capture) { listeners.set(`${type}:${capture}`, listener); },
      removeEventListener(type, listener, capture) {
        if (listeners.get(`${type}:${capture}`) === listener) listeners.delete(`${type}:${capture}`);
      },
    },
  };
  return {
    scope, button, child, other, controls, listeners, original: invoke,
    click(target = child, trusted = true) {
      for (const capture of [true, false]) listeners.get(`click:${capture}`)?.({ target, isTrusted: trusted });
    },
    wd: {
      async execute(script, args) {
        return vm.runInNewContext(`(function () { ${script} }).apply(null, args)`, { window: scope, args });
      },
    },
  };
}

const observations = (observer) => observer.finish().records;
const assertPrivate = (value) => assert.equal(JSON.stringify(value).includes(canary), false);

test("IPC observation preserves Promise, receiver and arguments without retaining payloads", async () => {
  const pending = deferred();
  const calls = [];
  const f = fixture(function (...args) { calls.push({ receiver: this, args }); return pending.promise; });
  const observer = installReasonLoginDiagnostics(f.scope);
  observer.sample("before-click");
  const args = { workspace: canary };
  const options = { headers: canary };
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke("reason_login_start", args, options), pending.promise);
  assert.equal(calls[0].receiver, f.scope.__TAURI_INTERNALS__);
  assert.equal(calls[0].args[1], args);
  assert.equal(calls[0].args[2], options);
  pending.resolve({ state: "waiting", prompt: { url: canary, code: canary }, account: { email: canary } });
  await pending.promise;
  const records = observations(observer);
  assert.ok(records.some((r) => r.command === "reason_login_start" && r.phase === "resolved" && r.state === "waiting"));
  assertPrivate(records);
});

test("unrelated commands are forwarded without observing their Promise or payload", () => {
  const result = { get then() { throw new Error("Must not observe unrelated result"); } };
  const f = fixture(() => result);
  const observer = installReasonLoginDiagnostics(f.scope);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke(canary, { value: canary }), result);
  assert.equal(observations(observer).filter((r) => r.kind === "ipc").length, 0);
});

test("synchronous throws and rejected Promises preserve the original error without logging it", async () => {
  const error = new Error(canary);
  const f = fixture(() => { throw error; });
  const observer = installReasonLoginDiagnostics(f.scope);
  assert.throws(() => f.scope.__TAURI_INTERNALS__.invoke("reason_login_start"), (value) => value === error);
  const records = observations(observer);
  assert.ok(records.some((r) => r.phase === "threw"));
  assertPrivate(records);

  const rejected = Promise.reject(error);
  const g = fixture(() => rejected);
  const second = installReasonLoginDiagnostics(g.scope);
  assert.equal(g.scope.__TAURI_INTERNALS__.invoke("reason_login_status"), rejected);
  await assert.rejects(rejected, (value) => value === error);
  const failures = observations(second);
  assert.ok(failures.some((r) => r.phase === "rejected"));
  assertPrivate(failures);
});

test("click records normalize icon descendants and never read labels or unknown states", () => {
  const f = fixture();
  const observer = installReasonLoginDiagnostics(f.scope);
  f.controls.dataset.state = canary;
  f.button.disabled = true;
  observer.sample(canary);
  f.click();
  f.click(f.other, false);
  const records = observations(observer);
  assert.deepEqual(records[0], { kind: "button", phase: "before-click", identity: "reason-sign-in-primary", disabled: true, connected: true, state: "unknown" });
  assert.deepEqual(records.filter((r) => r.kind === "click").map((r) => [r.phase, r.target, r.trusted]), [
    ["capture", "reason-sign-in-primary", true], ["bubble", "reason-sign-in-primary", true],
    ["capture", "other-in-reason-section", false], ["bubble", "other-in-reason-section", false],
  ]);
  assertPrivate(records);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
});

test("unknown IPC states become a fixed sentinel instead of raw response values", async () => {
  const result = { state: canary, account: canary };
  const f = fixture(() => Promise.resolve(result));
  const observer = installReasonLoginDiagnostics(f.scope);
  assert.equal(await f.scope.__TAURI_INTERNALS__.invoke("reason_login_status"), result);
  const records = observations(observer);
  assert.ok(records.some((r) => r.phase === "resolved" && r.state === "unknown"));
  assertPrivate(records);
});

test("restoration is idempotent and late results cannot append to a closed observer", async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const observer = installReasonLoginDiagnostics(f.scope);
  f.scope.__TAURI_INTERNALS__.invoke("reason_login_start");
  const before = observer.finish();
  pending.resolve({ state: "waiting" });
  await pending.promise;
  assert.deepEqual(observer.finish(), before);
  assert.equal(before.restoredInvoke, true);
  assert.equal(f.listeners.size, 0);
});

test("restoration never overwrites a newer IPC wrapper", () => {
  const f = fixture();
  const observer = installReasonLoginDiagnostics(f.scope);
  const newer = () => Promise.resolve();
  f.scope.__TAURI_INTERNALS__.invoke = newer;
  assert.equal(observer.finish().restoredInvoke, false);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, newer);
  assert.equal(f.listeners.size, 0);
});

test("partial listener installation rolls back both listeners and the IPC wrapper", () => {
  const f = fixture();
  const error = new Error(canary);
  const add = f.scope.document.addEventListener;
  f.scope.document.addEventListener = (type, listener, capture) => {
    if (!capture) throw error;
    add(type, listener, capture);
  };
  assert.throws(() => installReasonLoginDiagnostics(f.scope), (value) => value === error);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
  assert.equal(f.listeners.size, 0);
});

test("one listener removal failure does not block the other removal or invoke restoration", () => {
  const f = fixture();
  const observer = installReasonLoginDiagnostics(f.scope);
  const remove = f.scope.document.removeEventListener;
  f.scope.document.removeEventListener = (type, listener, capture) => {
    if (capture) throw new Error(canary);
    remove(type, listener, capture);
  };
  const result = observer.finish();
  assert.equal(result.captureRemoved, false);
  assert.equal(result.bubbleRemoved, true);
  assert.equal(result.restoredInvoke, true);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
  const count = result.records.length;
  f.click();
  assert.equal(observer.finish().records.length, count);
  assertPrivate(result);
});

test("sampling failure still removes listeners and restores invoke", () => {
  const f = fixture();
  const observer = installReasonLoginDiagnostics(f.scope);
  const error = new Error(canary);
  f.scope.document.querySelector = () => { throw error; };
  assert.throws(() => observer.finish(), (value) => value === error);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
  assert.equal(f.listeners.size, 0);
});

test("retained observations are bounded", () => {
  const f = fixture();
  const observer = installReasonLoginDiagnostics(f.scope);
  for (let i = 0; i < 300; i++) observer.sample("before-click");
  const result = observer.finish();
  assert.equal(result.records.length, 256);
  assert.equal(result.truncated, true);
});

test("flow tracing executes exactly one original click and wait, and never emits their value", async () => {
  const f = fixture();
  const lines = [];
  let clicks = 0;
  let waits = 0;
  const result = await traceReasonLogin(f.wd, async () => { clicks++; f.click(); }, async () => { waits++; return canary; }, (line) => lines.push(line));
  assert.equal(result, canary);
  assert.equal(clicks, 1);
  assert.equal(waits, 1);
  assert.equal(lines.length, 1);
  assertPrivate(lines);
  assert.ok(lines[0].includes('"phase":"after-click"'));
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
  assert.equal(f.listeners.size, 0);
  assert.equal("__OC_REASON_LOGIN_DIAGNOSTICS__" in f.scope, false);
});

for (const failure of ["click", "wait"]) {
  test(`flow tracing preserves a ${failure} failure and restores its observer`, async () => {
    const f = fixture();
    const error = new Error(canary);
    const lines = [];
    let waits = 0;
    await assert.rejects(traceReasonLogin(f.wd, async () => { if (failure === "click") throw error; }, async () => { waits++; throw error; }, (line) => lines.push(line)), (value) => value === error);
    assert.equal(waits, failure === "click" ? 0 : 1);
    assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
    assert.equal(f.listeners.size, 0);
    assertPrivate(lines);
  });
}

test("unavailable instrumentation or logging never changes the original flow result", async () => {
  const f = fixture();
  const lines = [];
  let clicks = 0;
  const result = await traceReasonLogin({ execute: async () => { throw new Error(canary); } }, async () => { clicks++; }, async () => 42, (line) => lines.push(line));
  assert.equal(clicks, 1);
  assert.equal(result, 42);
  assertPrivate(lines);
  assert.equal(lines[0], '[reason-login-diagnostics] {"status":"install-unavailable"}');
  assert.equal(await traceReasonLogin(f.wd, async () => {}, async () => 43, () => { throw new Error(canary); }), 43);
  assert.equal(f.scope.__TAURI_INTERNALS__.invoke, f.original);
  assert.equal(f.listeners.size, 0);
});
