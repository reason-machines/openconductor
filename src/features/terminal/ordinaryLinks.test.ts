import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";

// Only the PTY/DOM edges are inert: session, dialog bridge and opener bridge are real.
const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
type Exports = Record<string, unknown> & Partial<typeof Session>;
type Invocation = { command: string; args: Record<string, unknown> };
const compiled = new Map<string, string>();
async function fixture(options: { confirmError?: string; openerError?: string } = {}) {
  const invocations: Invocation[] = [];
  const errors: unknown[][] = [];
  const writes: string[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  let answer: ((value: string) => void) | undefined;
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  class Screen {
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    cols = 80; rows = 24;
    buffer = { normal: {}, active: {} };
    disposed = 0; opened = 0;
    options: ITerminalOptions;
    onInput?: (data: string) => void;
    output: string[] = [];
    constructor(options: ITerminalOptions) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() { this.opened++; }
    focus() {}
    write(data: string, done?: () => void) { this.output.push(data); done?.(); }
    attachCustomKeyEventHandler() {}
    onData(callback: (data: string) => void) { this.onInput = callback; }
    onResize() {}
    getSelection() { return ""; }
    dispose() { this.disposed++; }
  }
  class Observer { observe() {} disconnect() {} }
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, remove: noop });
  const container = Object.assign(new EventTarget(), { appendChild: () => host });
  async function invoke(command: string, args: Record<string, unknown>): Promise<unknown> {
    invocations.push({ command, args: structuredClone(args) });
    if (command === "plugin:dialog|message") {
      if (options.confirmError) throw new Error(options.confirmError);
      return new Promise<string>((resolve) => { answer = resolve; });
    }
    if (command === "plugin:opener|open_url") {
      if (options.openerError) throw new Error(options.openerError);
      return;
    }
    throw new Error(`Unexpected IPC: ${command}`);
  }
  const boundaries: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "@tauri-apps/api/core": { invoke, isTauri: () => true, Channel: class {} },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async () => {}, ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
      ptyWrite: async (_id: string, data: string) => { writes.push(data); },
      ptyClearHistory: async () => {}, ptyWriteMirror: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {}, ptyDeleteWorkspaceTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => null, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: true }), loadAppPrefs: noop, setAppPref: noop },
    "src/state/createProject": { STEP: {}, targetPath: noop },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: noop },
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(name: string): Exports {
    name = name.replace(/\.tsx?$/, "");
    const cached = modules.get(name);
    if (cached) return cached.exports;
    const file = name === "@tauri-apps/plugin-dialog" ? "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js" : `${name}.ts`;
    let output = compiled.get(file);
    if (output === undefined) {
      output = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
      }).outputText;
      compiled.set(file, output);
    }
    const module: { exports: Exports } = { exports: {} };
    modules.set(name, module);
    const require = (dep: string): unknown => {
      if (dep === "@xterm/addon-web-links") return deps(dep);
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      assert.ok(Object.prototype.hasOwnProperty.call(boundaries, key) || dep.startsWith(".") || dep === "@tauri-apps/plugin-dialog", `Unexpected dependency ${dep}`);
      return Object.prototype.hasOwnProperty.call(boundaries, key) ? boundaries[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console: { error: (...values: unknown[]) => { errors.push(values); } }, URL,
      TextDecoder, TextEncoder, setTimeout, clearTimeout, ResizeObserver: Observer, MutationObserver: Observer,
      crypto: { randomUUID: () => `ordinary-link-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, activeElement: null, createElement: () => host },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const { openTab, getTabs, attachTab, closeTab } = load("src/features/terminal/session");
  assert.ok(openTab && getTabs && attachTab && closeTab);
  const id = await openTab("ws", "/workspace");
  assert.equal(screens.length, 1, "actual ordinary session constructs one terminal");
  const screen = screens[0];
  assert.ok(event);
  const emit = event;
  let detach = attachTab(id, container as unknown as HTMLElement);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return {
    invocations, errors, writes, screen,
    async click(url: string, metaKey = true, ctrlKey = false) {
      screen.options.linkHandler?.activate({ metaKey, ctrlKey } as MouseEvent, url, { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } });
      await flush();
    },
    async answer(value: string) { assert.ok(answer, "native confirmation bridge awaits a result"); answer(value); await flush(); },
    reattach() { detach(); detach = attachTab(id, container as unknown as HTMLElement); },
    state(state: "ready" | "exit") { emit(state === "ready" ? { kind: "ready", id, pid: 1 } : { kind: "exit", id, exitCode: 0, signal: null }); },
    close() { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}
const url = "https://example.test/docs?from=terminal#result";
const openers = (calls: Invocation[]) => calls.filter((call) => call.command === "plugin:opener|open_url");

test("ordinary encoded Command-click warns before opening the exact target", async () => {
  const f = await fixture();
  try {
    await f.click(url);
    assert.deepEqual(f.invocations, [{ command: "plugin:dialog|message", args: {
      message: `Open this terminal link?\n\n${url}`, title: "Open link?", kind: "warning", buttons: { OkCancelCustom: ["Open", "Cancel"] },
    } }]);
    assert.equal(openers(f.invocations).length, 0);
    await f.answer("Open");
    assert.deepEqual(openers(f.invocations), [{ command: "plugin:opener|open_url", args: { url } }]);
  } finally { f.close(); }
});
test("ordinary encoded-link cancellation never reaches the opener", async () => {
  const f = await fixture();
  try {
    await f.click(url); assert.equal(f.invocations.length, 1, "one warning before cancellation");
    await f.answer("Cancel"); assert.equal(openers(f.invocations).length, 0);
  } finally { f.close(); }
});
test("ordinary unmodified and Control-only encoded-link activation does nothing", async () => {
  const f = await fixture();
  try { await f.click(url, false); await f.click(url, false, true); assert.deepEqual(f.invocations, []); }
  finally { f.close(); }
});
test("ordinary encoded HTTP localhost target is preserved through confirmation", async () => {
  const f = await fixture(); const url = "http://localhost:55000/path?one=two#result";
  try {
    await f.click(url); assert.equal(f.invocations.length, 1, "localhost still requires confirmation");
    await f.answer("Open"); assert.deepEqual(openers(f.invocations), [{ command: "plugin:opener|open_url", args: { url } }]);
  } finally { f.close(); }
});
test("ordinary encoded links disable non-HTTP protocols", async () => {
  const f = await fixture();
  try { assert.equal(f.screen.options.linkHandler?.allowNonHttpProtocols, false); }
  finally { f.close(); }
});
test("ordinary invalid and non-web targets never reach the warning or opener", async () => {
  const f = await fixture();
  try {
    for (const target of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "vscode://file/tmp/test", "not a URL"])
      await f.click(target);
    assert.deepEqual(f.invocations, []);
  } finally { f.close(); }
});
test("ordinary warning failures are handled without opening", async () => {
  const f = await fixture({ confirmError: "fixture warning unavailable" });
  try { await f.click(url); assert.equal(openers(f.invocations).length, 0); assert.equal(f.errors.length, 1); }
  finally { f.close(); }
});
test("ordinary opener failures are handled after approval", async () => {
  const f = await fixture({ openerError: "fixture opener unavailable" });
  try {
    await f.click(url); assert.equal(f.invocations.length, 1, "one confirmation before opener error");
    await f.answer("Open"); assert.equal(openers(f.invocations).length, 1); assert.equal(f.errors.length, 1);
  } finally { f.close(); }
});
test("ordinary reattachment keeps one terminal and its encoded-link handler", async () => {
  const f = await fixture();
  try {
    f.reattach(); assert.equal(f.screen.opened, 1);
    await f.click(url); assert.equal(f.invocations.length, 1, "reattached terminal retains warning");
    await f.answer("Open"); assert.equal(openers(f.invocations).length, 1);
  } finally { f.close(); }
});
test("ordinary starting and exited terminals keep the encoded-link handler", async () => {
  const f = await fixture();
  try {
    await f.click(url); assert.equal(f.invocations.length, 1, "starting terminal warns"); await f.answer("Cancel");
    f.state("ready"); f.state("exit");
    await f.click(url); assert.equal(f.invocations.length, 2, "exited terminal warns"); await f.answer("Open");
    assert.equal(openers(f.invocations).length, 1); assert.deepEqual(f.writes, []);
  } finally { f.close(); }
});
test("ordinary input remains gated by ready and exit states", async () => {
  const f = await fixture();
  try {
    f.screen.onInput?.("starting"); f.state("ready"); f.screen.onInput?.("running");
    f.state("exit"); f.screen.onInput?.("exited");
    assert.deepEqual(f.writes, ["running"]);
  } finally { f.close(); }
});
test("ordinary terminal disposal and Unicode setup stay unchanged", async () => {
  const f = await fixture();
  assert.equal(f.screen.unicode.activeVersion, "11"); f.close(); assert.equal(f.screen.disposed, 1);
});
