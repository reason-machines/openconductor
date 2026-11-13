import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PtyEvent } from "../../features/terminal/events.ts";

const dependencies = createRequire(import.meta.url);
const ts: typeof import("typescript") = dependencies("typescript");
const fixtureUrl = new URL("./loginTerminal.test.ts", import.meta.url);

type View = {
  writes: { id: string; data: string }[];
  killed: string[];
  refreshed: () => number;
  done: () => unknown;
  start: () => Promise<void>;
  marker: () => Promise<void>;
  input: (data: string) => Promise<void>;
  emit: (event: PtyEvent) => Promise<void>;
  click: (label: string) => Promise<void>;
  close: () => Promise<void>;
};

function mount(): View {
  const fixture = readFileSync(fixtureUrl, "utf8");
  const boundary = fixture.indexOf('\ntest("login bootstrap');
  assert.ok(boundary > 0);
  const stub = "ptyResize: async () => {},";
  const setup = fixture.slice(0, boundary)
    .replaceAll("import.meta.url", "__fixtureUrl")
    .replace("process.env.LOGIN_TERMINAL_SOURCE_FILE", "process.env.LOGIN_TERMINAL_INPUT_SOURCE_FILE");
  assert.equal(setup.split(stub).length, 2, "The frozen fixture must expose exactly one PTY stub boundary");
  const javascript = ts.transpileModule(`${setup.replace(stub, `${stub}\nptyAckBytes: async () => {},`)}\nexports.fixture = fixture;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: { fixture?: () => View } = {};
  runInNewContext(javascript, {
    exports, require: dependencies, URL, process, __fixtureUrl: fixtureUrl.href,
  });
  assert.ok(exports.fixture);
  return exports.fixture();
}

const ownExit: PtyEvent = { kind: "exit", id: "login-pty", exitCode: 0, signal: null };
const writes = (view: View) => [...view.writes].map(({ id, data }) => ({ id, data }));

test("exited login shells do not dispatch further input", async () => {
  const view = mount();
  try {
    await view.start();
    await view.emit(ownExit);
    assert.ok(view.done());
    await view.input("echo after-exit\r");
    assert.deepEqual(writes(view), [], "Exited login shells must not dispatch stdin to a dead PTY");
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("a completed login shell stops dispatching input after its later exit", async () => {
  const view = mount();
  try {
    await view.start();
    await view.marker();
    await view.emit(ownExit);
    assert.ok(view.done());
    await view.input("echo after-completed-exit\r");
    assert.deepEqual(writes(view), [], "Command completion must not keep an exited PTY writable");
  } finally { await view.close(); }
});

test("running login shells still dispatch input to their own PTY", async () => {
  const view = mount();
  try {
    await view.start();
    await view.input("echo running\r");
    assert.deepEqual(writes(view), [{ id: "login-pty", data: "echo running\r" }]);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("completed but live login shells remain writable", async () => {
  const view = mount();
  try {
    await view.start();
    await view.marker();
    assert.ok(view.done());
    await view.input("echo still-open\r");
    assert.deepEqual(writes(view), [{ id: "login-pty", data: "echo still-open\r" }]);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("a foreign PTY exit cannot disable this login shell's input", async () => {
  const view = mount();
  try {
    await view.start();
    await view.emit({ kind: "exit", id: "other-pty", exitCode: 1, signal: null });
    assert.equal(view.done(), undefined);
    await view.input("echo own-terminal\r");
    assert.deepEqual(writes(view), [{ id: "login-pty", data: "echo own-terminal\r" }]);
  } finally { await view.close(); }
});

test("dismissed logins ignore stale matching exit callbacks", async () => {
  const view = mount();
  try {
    await view.start();
    await view.click("Close terminal");
    await view.emit(ownExit);
    assert.equal(view.done(), undefined);
    assert.equal(view.refreshed(), 0);
    assert.deepEqual(writes(view), []);
    assert.deepEqual([...view.killed], ["login-pty"]);
  } finally { await view.close(); }
});
