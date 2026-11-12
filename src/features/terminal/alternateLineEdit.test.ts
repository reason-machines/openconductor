import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalAddon, ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";
import type { KeyEventLike } from "../../keybindings/shortcut";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;
type Key = KeyEventLike & { type: string; preventDefault(): void; stopPropagation(): void };

function fixture() {
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const writes: { id: string; data: string }[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen {
    readonly terminal;
    key: (event: Key) => boolean = () => true;
    constructor(options: ITerminalOptions) {
      this.terminal = new RealTerminal({ ...options, cols: 20, rows: 5 });
      screens.push(this);
    }
    get buffer() { return this.terminal.buffer; }
    get options() { return this.terminal.options; }
    get unicode() { return this.terminal.unicode; }
    get cols() { return this.terminal.cols; }
    get rows() { return this.terminal.rows; }
    loadAddon(addon: ITerminalAddon) { this.terminal.loadAddon(addon); }
    attachCustomKeyEventHandler(handler: (event: Key) => boolean) { this.key = handler; }
    onData(handler: (data: string) => void) { return this.terminal.onData(handler); }
    onResize() {}
    write(data: string, done?: () => void) { this.terminal.write(data, done); }
    clear() { this.terminal.clear(); }
    dispose() { this.terminal.dispose(); }
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { activate() {} dispose() {} fit() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async () => {}, ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
      ptyWrite: async (id: string, data: string) => { writes.push({ id, data }); },
      ptyClearHistory: async () => {}, ptyWriteMirror: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => null, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: true }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: noop },
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(name: string): Exports {
    name = name.replace(/\.tsx?$/, "");
    const existing = modules.get(name);
    if (existing) return existing.exports;
    const file = name + ".ts";
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
      if (dep === "react" || dep === "@xterm/addon-unicode11") return deps(dep);
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      crypto: { randomUUID: () => `alternate-line-edit-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.closeTab && session.getFindRequests);
  const { openTab, getTabs, closeTab, getFindRequests } = session;
  return {
    writes, screens, getTabs, getFindRequests,
    open: async () => {
      const id = await openTab("ws", "/workspace");
      assert.ok(event);
      event({ kind: "ready", id, pid: 12 });
      const screen = screens.at(-1);
      assert.ok(screen);
      return { id, screen };
    },
    output: async (id: string, screen: Screen, data: string) => {
      assert.ok(event);
      event({ kind: "data", id, data: new TextEncoder().encode(data) });
      await new Promise<void>((done) => screen.write("", done));
    },
    settle: () => new Promise<void>((done) => setImmediate(done)),
    close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}

function key(key: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key, code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers };
}

function press(screen: { key(event: Key): boolean }, input: KeyEventLike, type = "keydown") {
  let prevented = false;
  let stopped = false;
  const allowed = screen.key({ ...input, type,
    preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  return { allowed, prevented, stopped };
}

const motions = [
  { name: "line start", input: key("ArrowLeft", { metaKey: true }), bytes: "\x01" },
  { name: "line end", input: key("ArrowRight", { metaKey: true }), bytes: "\x05" },
  { name: "delete line", input: key("Backspace", { metaKey: true }), bytes: "\x15" },
  { name: "word left", input: key("ArrowLeft", { altKey: true }), bytes: "\x1bb" },
  { name: "word right", input: key("ArrowRight", { altKey: true }), bytes: "\x1bf" },
];
const pass = { allowed: true, prevented: false, stopped: false };
const handled = { allowed: false, prevented: true, stopped: true };

for (const mode of [47, 1047, 1049]) {
  for (const motion of motions) {
    test(`${motion.name} passes through alternate buffer ${mode} without injected readline bytes`, async (t) => {
      const f = fixture(); t.after(f.close);
      const { id, screen } = await f.open();
      await f.output(id, screen, `\x1b[?${mode}hfull-screen output`);
      assert.equal(screen.buffer.active.type, "alternate");
      const outcome = press(screen, motion.input);
      await f.settle();
      assert.deepEqual({ outcome, writes: f.writes }, { outcome: pass, writes: [] });
      assert.equal(screen.buffer.active.getLine(0)?.translateToString(true), "full-screen output");
    });
  }
  test(`insert-newline still precedes the alternate-buffer ${mode} guard`, async (t) => {
    const f = fixture(); t.after(f.close);
    const { id, screen } = await f.open();
    await f.output(id, screen, `\x1b[?${mode}h`);
    assert.deepEqual(press(screen, key("Enter", { shiftKey: true })), handled);
    await f.settle();
    assert.deepEqual(f.writes, [{ id, data: "\x1b\r" }]);
  });
}

for (const motion of motions) {
  test(`${motion.name} still sends its exact readline bytes in the normal buffer`, async (t) => {
    const f = fixture(); t.after(f.close);
    const { id, screen } = await f.open();
    assert.equal(screen.buffer.active.type, "normal");
    assert.deepEqual(press(screen, motion.input), handled);
    await f.settle();
    assert.deepEqual(f.writes, [{ id, data: motion.bytes }]);
  });
}

test("leaving the alternate buffer restores all normal line-edit commands", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049halt\x1b[?1049l");
  assert.equal(screen.buffer.active.type, "normal");
  for (const motion of motions) assert.deepEqual(press(screen, motion.input), handled);
  await f.settle();
  assert.deepEqual(f.writes, motions.map((motion) => ({ id, data: motion.bytes })));
});

test("alternate-buffer keyup never injects readline bytes", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  for (const motion of motions) assert.deepEqual(press(screen, motion.input, "keyup"), pass);
  await f.settle();
  assert.deepEqual(f.writes, []);
});

test("ordinary alternate-buffer input still passes through", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  for (const input of [key("a"), key("ArrowLeft"), key("Backspace"), key("c", { ctrlKey: true })])
    assert.deepEqual(press(screen, input), pass);
  await f.settle();
  assert.deepEqual(f.writes, []);
});

test("Find remains available in the alternate buffer", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  assert.deepEqual(press(screen, key("f", { metaKey: true })), handled);
  assert.equal(f.getFindRequests(id), 1);
  assert.deepEqual(f.writes, []);
});

test("new-tab remains available in the alternate buffer", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  assert.deepEqual(press(screen, key("t", { metaKey: true })), handled);
  await f.settle();
  assert.equal(f.getTabs("ws").tabs.length, 2);
  assert.deepEqual(f.writes, []);
});

test("an alternate sibling does not suppress normal-buffer line editing", async (t) => {
  const f = fixture(); t.after(f.close);
  const alternate = await f.open();
  const normal = await f.open();
  await f.output(alternate.id, alternate.screen, "\x1b[?1049h");
  assert.deepEqual(press(normal.screen, key("ArrowLeft", { metaKey: true })), handled);
  await f.settle();
  assert.deepEqual(f.writes, [{ id: normal.id, data: "\x01" }]);
});
