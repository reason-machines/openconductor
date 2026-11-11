import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PtyEvent } from "../../features/terminal/events.ts";

const dependencies = createRequire(import.meta.url);
const ts: typeof import("typescript") = dependencies("typescript");
const { act }: typeof import("react") = dependencies("react");
const { Terminal }: typeof import("@xterm/xterm") = dependencies("@xterm/xterm");
const fixtureUrl = new URL("./loginTerminal.test.ts", import.meta.url);
const marker = "Conductor;CommandDone;login-pty";

type View = {
  screens: { osc?: (data: string) => boolean; write: (data: string | Uint8Array, callback?: () => void) => void }[];
  spawns: { id?: string; initialCommand: string }[];
  killed: string[];
  refreshed: () => number;
  unlistened: () => number;
  done: () => unknown;
  text: () => string;
  start: () => Promise<void>;
  activateListener: () => Promise<void>;
  finishSpawn: () => Promise<void>;
  close: () => Promise<void>;
  marker: (value?: string) => Promise<void>;
  emit: (value: PtyEvent) => Promise<void>;
};

function mount(options: { deferListener?: boolean; deferSpawn?: boolean } = {}): View {
  const text = readFileSync(fixtureUrl, "utf8");
  const boundary = text.indexOf('\ntest("login bootstrap');
  assert.ok(boundary > 0);
  const setup = text.slice(0, boundary).replaceAll("import.meta.url", "__fixtureUrl");
  const javascript = ts.transpileModule(`${setup}\nexports.fixture = fixture;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: { fixture?: (options: { deferListener?: boolean; deferSpawn?: boolean }) => View } = {};
  runInNewContext(javascript, { exports, require: dependencies, URL, process, __fixtureUrl: fixtureUrl.href });
  assert.ok(exports.fixture);
  return exports.fixture(options);
}

test("login observes a stable terminal identity before spawn resolves", async () => {
  const view = mount({ deferSpawn: true });
  try {
    await view.start();
    assert.equal(view.spawns[0].id, "login-pty");
    await view.emit({ kind: "exit", id: "other-pty", exitCode: 0, signal: null });
    assert.equal(view.done(), undefined);
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 1, signal: null });
    await view.finishSpawn();
    await view.emit({ kind: "ready", id: "login-pty", pid: 42 });
    await view.marker();
    assert.match(view.text(), /Shell exited before the command completed\./);
    assert.doesNotMatch(view.text(), /Finished/);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("a pre-spawn marker cannot finish login and dismissal cancels delayed startup", async () => {
  const view = mount({ deferListener: true });
  try {
    await view.start();
    await view.marker();
    assert.equal(view.done(), undefined);
    assert.match(view.text(), /Starting fixture-cli login/);
    await view.close();
    await view.activateListener();
    assert.equal(view.spawns.length, 0);
    assert.equal(view.unlistened(), 1);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("the real xterm parser ignores echoed bootstrap text and accepts a split completion OSC", async () => {
  const view = mount();
  const parser = new Terminal();
  try {
    await view.start();
    parser.parser.registerOscHandler(633, (data) => view.screens[0].osc?.(data) ?? false);
    let drained = Promise.resolve();
    view.screens[0].write = (data, callback) => {
      drained = new Promise<void>((resolve) => parser.write(data, () => { callback?.(); resolve(); }));
    };
    const output = async (data: string) => {
      await act(async () => {
        await view.emit({ kind: "data", id: "login-pty", data: new TextEncoder().encode(data) });
        await drained;
      });
    };
    const bootstrap = view.spawns[0].initialCommand;
    assert.ok(bootstrap.includes(`printf '\\033]633;${marker}\\a'`));
    assert.ok(!bootstrap.includes("\x1b"), "Echoed input must contain escaped text, not an executable OSC");
    await output(`${bootstrap}\r\n`);
    assert.equal(view.done(), undefined);
    await output("\x1b]633;Conductor;CommandDone;other-pty\x07");
    assert.equal(view.done(), undefined);
    await output("\x1b]633;Conductor;Command");
    assert.equal(view.done(), undefined);
    await output("Done;login-pty\x07");
    assert.match(view.text(), /Finished fixture-cli login\./);
    assert.ok(view.done());
    assert.deepEqual(view.killed, []);
  } finally { parser.dispose(); await view.close(); }
});

test("PTY exit waits for queued xterm output before deciding completion", async () => {
  const view = mount();
  try {
    await view.start();
    let parsed: (() => void) | undefined;
    view.screens[0].write = (_data, callback) => { parsed = callback; };
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array() });
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 0, signal: null });
    assert.equal(view.done(), undefined);
    await view.marker();
    await act(async () => { assert.ok(parsed); parsed(); });
    assert.match(view.text(), /Finished fixture-cli login\./);
  } finally { await view.close(); }
});

test("drained output without a marker preserves the premature exit error", async () => {
  const view = mount();
  try {
    await view.start();
    let parsed: (() => void) | undefined;
    view.screens[0].write = (_data, callback) => { parsed = callback; };
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array() });
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 0, signal: null });
    await act(async () => { assert.ok(parsed); parsed(); });
    assert.match(view.text(), /Shell exited before the command completed\./);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});
