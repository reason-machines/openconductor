import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installCodexAccessDiagnostics, assertCodexAccessSnapshot, codexBoundaryReport, assertCodexBoundary } from "./codex-access-diagnostics.mjs";

function fixture(handled = false) {
  const saved = new Map();
  const listeners = new Map();
  let resetOnChange = false;
  const select = {
    value: "full", isConnected: true, disabled: false,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    closest: () => null,
    matches: (selector) => selector === ".codex-access",
    dispatchEvent(event) {
      if (resetOnChange) this.value = "full";
      event.target = this;
      event.eventPhase = 1;
      listeners.get("change:true")?.(event);
      if (handled) saved.set("openconductor.codex.policy.proj/e2e", this.value);
      event.eventPhase = 3;
      listeners.get("change:false")?.(event);
      return true;
    },
  };
  const invoke = () => { throw new Error("observation must not invoke IPC"); };
  const ipc = {};
  Object.defineProperty(ipc, "invoke", { value: invoke });
  const context = {
    window: { __TAURI_INTERNALS__: ipc },
    document: {
      querySelector: () => select, querySelectorAll: () => [select],
      addEventListener: (name, listener, capture = false) => listeners.set(`${name}:${capture}`, listener),
    },
    getComputedStyle: () => ({ display: "inline-block", visibility: "visible" }),
    localStorage: { getItem: (key) => saved.get(key) ?? null },
    HTMLSelectElement: { prototype: Object.defineProperty({}, "value", { set(value) { this.value = value; } }) },
    Event: class Event { isTrusted = false; },
  };
  runInNewContext(`(${installCodexAccessDiagnostics.toString()})("proj/e2e")`, context);
  const capture = (phase) => context.window.__ocCodexAccessDiagnostics.capture(phase);
  const run = (script) => Promise.resolve(runInNewContext(script, context));
  return { select, saved, context, capture, run, invoke, resetOnChange: () => { resetOnChange = true; } };
}

async function actualChangeBlock(f) {
  const source = readFileSync(new URL("./codex-chat.e2e.mjs", import.meta.url), "utf8");
  const block = source.match(/  \/\/ Ask first,[\s\S]+?(?=  \/\/ 1\. The recorded turn)/)?.[0];
  assert.ok(block, "actual driver's initial access change block");
  const execute = runInNewContext(`(async () => { ${block} })`, {
    run: f.run,
    recordAccess: async (phase) => f.capture(phase),
    assertCodexAccessSnapshot,
    pass() {},
  });
  await execute();
}

test("actual driver rejects an ignored change instead of reporting successful setup", async () => {
  await assert.rejects(actualChangeBlock(fixture(false)), /Ask first is saved/);
});

test("actual driver accepts a synchronously handled user change", async () => {
  await actualChangeBlock(fixture(true));
});

test("actual driver retains setter and change propagation observations without changing the policy", async () => {
  const f = fixture(true);
  await actualChangeBlock(f);
  const entries = f.context.window.__ocCodexAccessDiagnostics.read().entries;
  assert.deepEqual(Array.from(entries, (entry) => entry.phase), ["installed", "before-setter", "after-setter", "change-capture", "change-bubble", "after-dispatch", "after-change"]);
  assert.deepEqual(Array.from(entries, (entry) => [entry.value, entry.persistedPolicy]), [
    ["full", null], ["full", null], ["ask", null], ["ask", null], ["ask", "ask"], ["ask", "ask"], ["ask", "ask"],
  ]);
  assert.equal(entries.find((entry) => entry.phase === "after-setter")?.setterReturn, "undefined");
  assert.equal(entries.find((entry) => entry.phase === "after-dispatch")?.dispatchReturn, true);
  for (const entry of entries.filter((entry) => entry.phase.startsWith("change-"))) {
    assert.equal(entry.eventTargetIsSelector, true);
    assert.equal(entry.eventValue, "ask");
    assert.equal(entry.eventTrusted, false);
  }
});

test("actual driver keeps a setter success distinct from a change-time reset and still rejects it", async () => {
  const f = fixture(true);
  f.resetOnChange();
  await assert.rejects(actualChangeBlock(f), /Ask first remains selected/);
  const entries = f.context.window.__ocCodexAccessDiagnostics.read().entries;
  assert.equal(entries.find((entry) => entry.phase === "after-setter")?.value, "ask");
  assert.equal(entries.find((entry) => entry.phase === "change-capture")?.value, "full");
  assert.equal(entries.find((entry) => entry.phase === "change-bubble")?.persistedPolicy, "full");
  assert.equal(f.saved.get("openconductor.codex.policy.proj/e2e"), "full");
});

test("change observer ignores unrelated targets and allowlists event values", () => {
  const f = fixture();
  const probe = f.context.window.__ocCodexAccessDiagnostics;
  probe.capture("unrelated", { target: { value: "private-value" }, isTrusted: false });
  assert.equal(probe.read().entries.at(-1).eventTargetIsSelector, false);
  assert.equal(probe.read().entries.at(-1).eventValue, null);
  probe.capture("after-setter", null, "private-return");
  assert.equal(probe.read().entries.at(-1).setterReturn, "unexpected");
  probe.capture("after-dispatch", null, false);
  assert.equal(probe.read().entries.at(-1).dispatchReturn, false);
  assert.ok(!JSON.stringify(probe.read()).includes("private-"));
});

test("capture works with Tauri's readonly invoke without replacing it or writing storage", () => {
  const f = fixture();
  f.capture("before-change");
  assert.equal(f.context.window.__TAURI_INTERNALS__.invoke, f.invoke);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.context.window.__TAURI_INTERNALS__, "invoke"), {
    value: f.invoke, writable: false, enumerable: false, configurable: false,
  });
  assert.equal(f.saved.size, 0);
});

test("setup rejects detached, disabled, hidden, reset and unsaved selections", () => {
  const good = { phase: "pre-Send", selectorCount: 1, connected: true, disabled: false, visible: true, value: "ask", persistedPolicy: "ask" };
  assertCodexAccessSnapshot(good);
  for (const change of [{ selectorCount: 2 }, { connected: false }, { disabled: true }, { visible: false }, { value: "full" }, { persistedPolicy: null }]) {
    assert.throws(() => assertCodexAccessSnapshot({ ...good, ...change }));
  }
});

test("capture bounds retained observations and redacts unknown saved values", () => {
  const f = fixture();
  f.saved.set("openconductor.codex.policy.proj/e2e", "private-value");
  for (let i = 0; i < 80; i++) f.capture("sample");
  const report = f.context.window.__ocCodexAccessDiagnostics.read();
  assert.equal(report.entries.length, 64);
  assert.equal(report.dropped, 17);
  assert.ok(!JSON.stringify(report).includes("private-value"));
});

const ask = { approvalPolicy: "on-request", sandbox: "workspace-write" };
const event = { chatId: "proj/e2e", incomingPolicy: ask, existingRunner: false, selectedPolicy: ask };
const thread = { params: { ...ask, cwd: "private-path" } };

test("Rust boundary report correlates the first turn and allowlists policy fields", () => {
  const report = codexBoundaryReport("proj/e2e", JSON.stringify({ ...event, prompt: "private-prompt" }), thread);
  assertCodexBoundary(report);
  assert.ok(!JSON.stringify(report).includes("private-"));
});

test("missing or ambiguous Rust evidence and reused runners fail closed", () => {
  assert.throws(() => assertCodexBoundary(codexBoundaryReport("proj/e2e", "", thread)), /one first-turn/);
  assert.throws(() => assertCodexBoundary(codexBoundaryReport("proj/e2e", [event, event].map(JSON.stringify).join("\n"), thread)), /one first-turn/);
  const wrongChat = codexBoundaryReport("proj/e2e", JSON.stringify({ ...event, chatId: "other/chat" }), thread);
  assert.throws(() => assertCodexBoundary(wrongChat), /expected chat/);
  assert.equal(wrongChat.events[0].chatId, "other/chat");
  const reused = { ...event, existingRunner: true, selectedPolicy: null };
  assert.throws(() => assertCodexBoundary(codexBoundaryReport("proj/e2e", JSON.stringify(reused), thread)), /existing runner's policy is unobserved/);
});

test("incoming and selected policy mismatches are not replaced with the expected value", () => {
  const full = { approvalPolicy: "never", sandbox: "danger-full-access" };
  for (const change of [{ incomingPolicy: null }, { incomingPolicy: full }, { selectedPolicy: full }]) {
    const report = codexBoundaryReport("proj/e2e", JSON.stringify({ ...event, ...change }), thread);
    assert.throws(() => assertCodexBoundary(report));
    assert.deepEqual(report.events[0], { ...event, ...change });
  }
  assert.throws(() => assertCodexBoundary(codexBoundaryReport("proj/e2e", JSON.stringify(event), { params: full })), /thread\/start/);
  assert.throws(() => codexBoundaryReport("proj/e2e", "x".repeat(65537), thread), /bounded/);
});

test("driver observes and validates immediately before clicking Send", async () => {
  const source = readFileSync(new URL("./codex-chat.e2e.mjs", import.meta.url), "utf8");
  const send = source.match(/async function send\(text, beforeSubmit\) \{[\s\S]+?\n\}/)?.[0];
  assert.ok(send, "Send supports a read-only pre-submit observation");
  const calls = [];
  const execute = runInNewContext(`(${send})`, {
    find: async (selector) => selector.includes("contenteditable") ? "editor" : "button",
    wd: async (_method, path) => calls.push(path),
  });
  await execute("hello", async () => { calls.push("snapshot"); });
  assert.deepEqual(calls, ["/element/editor/value", "snapshot", "/element/button/click"]);
  calls.length = 0;
  await assert.rejects(execute("hello", async () => { throw new Error("pre-Send invalid"); }), /pre-Send invalid/);
  assert.deepEqual(calls, ["/element/editor/value"]);
});
