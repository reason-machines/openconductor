import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { installCodexAccessDiagnostics } from "./codex-access-diagnostics.mjs";

function fixture() {
  const saved = new Map();
  const listeners = new Map();
  const calls = [];
  const response = Promise.resolve("forwarded");
  const select = {
    dataset: { chatId: "workspace/chat" },
    isConnected: true,
    disabled: false,
    value: "full",
    hidden: false,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    closest() { return this.hidden ? {} : null; },
    matches: (selector) => selector === ".codex-access",
  };
  let selectors = [select];
  const document = {
    querySelector: () => selectors[0] ?? null,
    querySelectorAll: () => selectors,
    addEventListener: (type, listener, capture = false) => listeners.set(`${type}:${capture}`, listener),
    removeEventListener: (type, listener, capture = false) => {
      const key = `${type}:${capture}`;
      if (listeners.get(key) === listener) listeners.delete(key);
    },
  };
  const invoke = function (...args) { calls.push({ receiver: this, args }); return response; };
  const window = { __TAURI_INTERNALS__: { invoke } };
  const context = {
    window,
    document,
    localStorage: { getItem: (key) => saved.get(key) ?? null },
    getComputedStyle: () => ({ display: "inline-block", visibility: "visible" }),
    chatId: "workspace/chat",
  };
  const install = () => runInNewContext(`(${installCodexAccessDiagnostics.toString()})(chatId)`, context);
  const read = () => JSON.parse(JSON.stringify(window.__ocCodexAccessDiagnostics.read()));
  return { saved, listeners, calls, response, select, context, window, invoke, install, read, replace: (next) => { selectors = next; } };
}

test("snapshots observe actual chat and policy without writing or invoking anything", () => {
  const f = fixture();
  f.saved.set("openconductor.codex.policy.workspace/chat", "ask");
  const entry = f.install();
  assert.equal(entry.activeChatId, "workspace/chat");
  assert.equal(entry.persistedPolicy, "ask");
  assert.equal(entry.activePersistedPolicy, "ask");
  assert.equal(entry.connected, true);
  assert.equal(entry.disabled, false);
  assert.equal(entry.visible, true);
  assert.equal(entry.value, "full");
  assert.equal(f.saved.size, 1);
  assert.equal(f.calls.length, 0);
});

test("capture and bubble phases distinguish an unchanged control from a handled selection", () => {
  const f = fixture();
  f.install();
  f.select.value = "ask";
  const event = { target: f.select };
  f.listeners.get("change:true")(event);
  f.saved.set("openconductor.codex.policy.workspace/chat", "ask");
  f.listeners.get("change:false")(event);
  const entries = f.read().entries;
  assert.equal(entries[1].phase, "change-capture");
  assert.equal(entries[1].persistedPolicy, null);
  assert.equal(entries[2].phase, "change-bubble");
  assert.equal(entries[2].persistedPolicy, "ask");
});

test("missing, replaced, hidden and disabled selectors remain distinguishable", () => {
  const f = fixture();
  f.install();
  const probe = f.window.__ocCodexAccessDiagnostics;
  f.replace([]);
  assert.equal(probe.capture("missing").connected, false);
  f.replace([{ ...f.select, isConnected: false, disabled: true, hidden: true, dataset: { chatId: "other/chat" } }]);
  const entry = probe.capture("replacement");
  assert.equal(entry.nodeId, 2);
  assert.equal(entry.activeChatId, "other/chat");
  assert.equal(entry.connected, false);
  assert.equal(entry.disabled, true);
  assert.equal(entry.visible, false);
  f.replace([f.select, { ...f.select }]);
  assert.equal(probe.capture("ambiguous").selectorCount, 2);
});

test("IPC interception records only policy identity and preserves receiver, arguments and promise", () => {
  const f = fixture();
  f.install();
  const receiver = {};
  const args = { chatId: "workspace/chat", policy: { approvalPolicy: "never", sandbox: "danger-full-access" }, secret: "do-not-include", text: "private-prompt" };
  const result = f.window.__TAURI_INTERNALS__.invoke.call(receiver, "codex_open_chat", args, "rest");
  assert.equal(result, f.response);
  assert.equal(f.calls[0].receiver, receiver);
  assert.deepEqual(f.calls[0].args, ["codex_open_chat", args, "rest"]);
  assert.deepEqual(f.read().entries.at(-1).invocation, { chatId: "workspace/chat", approvalPolicy: "never", sandbox: "danger-full-access" });
  f.window.__TAURI_INTERNALS__.invoke("unrelated", { text: "also-private" });
  const report = JSON.stringify(f.read());
  for (const excluded of ["do-not-include", "private-prompt", "also-private"]) assert.ok(!report.includes(excluded));
  assert.equal(f.read().entries.length, 2);
});

test("diagnostic retention is bounded and unknown storage values are not copied", () => {
  const f = fixture();
  f.saved.set("openconductor.codex.policy.workspace/chat", "unexpected-sensitive-value");
  f.install();
  for (let i = 0; i < 80; i++) f.window.__ocCodexAccessDiagnostics.capture("sample");
  const report = f.read();
  assert.equal(report.entries.length, 64);
  assert.equal(report.dropped, 17);
  assert.equal(report.entries[0].persistedPolicy, "unrecognized");
  assert.ok(!JSON.stringify(report).includes("unexpected-sensitive-value"));
});

test("restore removes only its listeners and returns the original invoke", () => {
  const f = fixture();
  f.install();
  assert.throws(f.install, /already installed/);
  f.window.__ocCodexAccessDiagnostics.restore();
  assert.equal(f.window.__TAURI_INTERNALS__.invoke, f.invoke);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.saved.size, 0);
});

test("the actual Send helper awaits the pre-Send snapshot after typing and before clicking", async () => {
  const source = readFileSync(new URL("./codex-chat.e2e.mjs", import.meta.url), "utf8");
  const send = source.match(/async function send\(text, beforeSubmit\) \{[\s\S]+?\n\}/)?.[0];
  assert.ok(send, "the built-app driver's actual Send helper exists");
  const calls = [];
  const context = {
    find: async (selector) => selector.includes("contenteditable") ? "editor" : "button",
    wd: async (_method, path) => { calls.push(path); },
  };
  const execute = runInNewContext(`(${send})`, context);
  await execute("hello", async () => { await Promise.resolve(); calls.push("snapshot"); });
  assert.deepEqual(calls, ["/element/editor/value", "snapshot", "/element/button/click"]);
  calls.length = 0;
  await execute("follow-up");
  assert.deepEqual(calls, ["/element/editor/value", "/element/button/click"]);
});
