import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PtyEvent } from "../../features/terminal/events.ts";

const dependencies = createRequire(import.meta.url);
const ts: typeof import("typescript") = dependencies("typescript");
const { act }: typeof import("react") = dependencies("react");
const fixtureUrl = new URL("./loginTerminal.test.ts", import.meta.url);

type View = {
  screens: { write: (data: string | Uint8Array, callback?: () => void) => void }[];
  killed: string[];
  writes: { id: string; data: string }[];
  refreshed: () => number;
  done: () => unknown;
  start: () => Promise<void>;
  activateListener: () => Promise<void>;
  finishSpawn: () => Promise<void>;
  marker: () => Promise<void>;
  input: (data: string) => Promise<void>;
  click: (label: string) => Promise<void>;
  close: () => Promise<void>;
  emit: (event: PtyEvent) => Promise<void>;
};
type Options = { deferSpawn?: boolean; deferListener?: boolean };
type Ack = { id: string; bytes: number };

function mount(options: Options = {}, send: (ack: Ack) => Promise<void> = async () => {}) {
  const fixture = readFileSync(fixtureUrl, "utf8");
  const boundary = fixture.indexOf('\ntest("login bootstrap');
  assert.ok(boundary > 0);
  const stub = "ptyResize: async () => {},";
  const setup = fixture.slice(0, boundary)
    .replaceAll("import.meta.url", "__fixtureUrl")
    .replace("process.env.LOGIN_TERMINAL_SOURCE_FILE", "process.env.LOGIN_TERMINAL_ACK_SOURCE_FILE");
  assert.equal(setup.split(stub).length, 2, "The frozen fixture must expose exactly one PTY stub boundary");
  const javascript = ts.transpileModule(`${setup.replace(stub, `${stub}\nptyAckBytes: __ackBytes,`)}\nexports.fixture = fixture;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const acks: Ack[] = [];
  const exports: { fixture?: (options: Options) => View } = {};
  runInNewContext(javascript, {
    exports, require: dependencies, URL, process, __fixtureUrl: fixtureUrl.href,
    __ackBytes: (id: string, bytes: number) => {
      const ack = { id, bytes };
      acks.push(ack);
      return send(ack);
    },
  });
  assert.ok(exports.fixture);
  const view = exports.fixture(options);
  const pending: { data: string | Uint8Array; callback?: () => void }[] = [];
  return {
    ...view, acks, pending,
    async start() {
      await view.start();
      view.screens[0].write = (data, callback) => { pending.push({ data, callback }); };
    },
    async drain() {
      await act(async () => {
        const write = pending.shift();
        assert.ok(write, "The terminal must have queued output");
        assert.ok(write.callback, "Output acknowledgement must wait for the xterm write callback");
        write.callback();
      });
    },
  };
}

test("login acknowledges raw chunk bytes only after xterm consumes them", async () => {
  const view = mount();
  try {
    await view.start();
    const storage = new Uint8Array(32);
    storage.set([0xf0, 0x9f, 0x98, 0x80, 0xff], 7);
    const data = storage.subarray(7, 12);
    await view.emit({ kind: "data", id: "login-pty", data });
    assert.deepEqual(view.acks, [], "Queued but unrendered output must not be acknowledged");
    assert.equal(view.pending[0].data, data);
    await view.drain();
    assert.deepEqual(view.acks, [{ id: "login-pty", bytes: 5 }], "Rendered output must acknowledge raw bytes, not decoded text or backing-buffer size");
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([0x1b, 0x5b, 0x30, 0x6d]) });
    assert.equal(view.acks.length, 1);
    await view.drain();
    assert.deepEqual(view.acks, [{ id: "login-pty", bytes: 5 }, { id: "login-pty", bytes: 4 }]);
  } finally { await view.close(); }
});

test("login acknowledges output before the spawn promise resolves", async () => {
  const view = mount({ deferSpawn: true });
  try {
    await view.start();
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([1, 2, 3]) });
    await view.drain();
    assert.deepEqual(view.acks, [{ id: "login-pty", bytes: 3 }], "Fast rendered output must acknowledge the reserved terminal identity");
    await view.finishSpawn();
  } finally { await view.close(); }
});

test("rendered login output releases flow credit beyond the high watermark", async () => {
  let unacked = 0;
  const view = mount({}, async ({ bytes }) => { unacked = Math.max(0, unacked - bytes); });
  const high = 512 * 1024;
  const chunk = new Uint8Array(8192);
  try {
    await view.start();
    for (let count = 0; count < 80; count++) {
      assert.ok(unacked < high, "Rendered login output must release flow credit before the next chunk is blocked");
      unacked += chunk.byteLength;
      await view.emit({ kind: "data", id: "login-pty", data: chunk });
      await view.drain();
    }
    assert.equal(unacked, 0);
    assert.equal(view.acks.reduce((total, ack) => total + ack.bytes, 0), 80 * chunk.byteLength);
  } finally { await view.close(); }
});

test("rejected login acknowledgements do not interrupt completion or cleanup", async () => {
  const view = mount({}, async () => { throw new Error("fixture terminal was removed"); });
  try {
    await view.start();
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([1]) });
    await view.drain();
    assert.equal(view.acks.length, 1, "Rendered output must attempt acknowledgement even when the bridge rejects it");
    await view.marker();
    assert.ok(view.done());
    await view.click("Done");
    assert.equal(view.refreshed(), 1);
    assert.deepEqual([...view.killed], ["login-pty"]);
  } finally { await view.close(); }
});

test("login ignores foreign, pre-spawn, lifecycle and empty output for byte credit", async () => {
  const view = mount({ deferListener: true });
  try {
    await view.start();
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([1]) });
    assert.equal(view.pending.length, 0);
    await view.activateListener();
    await view.emit({ kind: "data", id: "other-pty", data: new Uint8Array([1]) });
    await view.emit({ kind: "ready", id: "login-pty", pid: 42 });
    assert.equal(view.pending.length, 0);
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array() });
    await view.drain();
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 1, signal: null });
    assert.deepEqual(view.acks, []);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("dismissed login output cannot acknowledge a late xterm callback", async () => {
  const view = mount();
  await view.start();
  await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([1, 2]) });
  await view.click("Close terminal");
  await view.drain();
  await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([3]) });
  assert.equal(view.pending.length, 0);
  assert.deepEqual(view.acks, []);
  assert.equal(view.refreshed(), 0);
  assert.deepEqual([...view.killed], ["login-pty"]);
  await view.close();
});

test("completed login shells keep acknowledging output until Done", async () => {
  const view = mount();
  try {
    await view.start();
    await view.marker();
    await view.emit({ kind: "data", id: "login-pty", data: new Uint8Array([1, 2]) });
    await view.drain();
    assert.deepEqual(view.acks, [{ id: "login-pty", bytes: 2 }], "A completed but usable login shell must keep acknowledging rendered output");
    assert.ok(view.done());
    assert.equal(view.refreshed(), 0);
    await view.input("echo still-open\r");
    assert.deepEqual([...view.writes].map(({ id, data }) => ({ id, data })), [{ id: "login-pty", data: "echo still-open\r" }]);
    await view.click("Done");
    assert.equal(view.refreshed(), 1);
    assert.deepEqual([...view.killed], ["login-pty"]);
  } finally { await view.close(); }
});
