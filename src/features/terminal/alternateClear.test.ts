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
  const clearedHistory: string[] = [];
  const mirrors: { id: string; data: string }[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen {
    readonly terminal;
    clears = 0;
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
    clear() { this.clears++; this.terminal.clear(); }
    dispose() { this.terminal.dispose(); }
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { activate() {} dispose() {} fit() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async () => {}, ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
      ptyWrite: async (id: string, data: string) => { writes.push({ id, data }); },
      ptyClearHistory: async (id: string) => { clearedHistory.push(id); },
      ptyWriteMirror: async (id: string, data: string) => { mirrors.push({ id, data }); },
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
      crypto: { randomUUID: () => `alternate-clear-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.clearTab && session.closeTab && session.getFindRequests);
  const { openTab, getTabs, clearTab, closeTab, getFindRequests } = session;
  return {
    screens, writes, clearedHistory, mirrors, clearTab, getFindRequests,
    open: async () => {
      const id = await openTab("ws", "/workspace");
      assert.ok(event);
      event({ kind: "ready", id, pid: 12 });
      return { id, screen: screens.at(-1)! };
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

function press(screen: { key(event: Key): boolean }, key = "k", type = "keydown", shiftKey = false) {
  let prevented = false;
  let stopped = false;
  const allowed = screen.key({ type, key, code: `Key${key.toUpperCase()}`, metaKey: true, ctrlKey: false, altKey: false, shiftKey,
    preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  return { allowed, prevented, stopped };
}

for (const mode of [47, 1047, 1049]) {
  test(`clear shortcut leaves the real xterm alternate buffer ${mode} and transport untouched`, async (t) => {
    const f = fixture(); t.after(f.close);
    const { id, screen } = await f.open();
    await f.output(id, screen, `\x1b[?${mode}hfull-screen output`);
    assert.equal(screen.buffer.active.type, "alternate");
    assert.deepEqual(press(screen), { allowed: true, prevented: false, stopped: false });
    await f.settle();
    assert.equal(screen.clears, 0);
    assert.equal(screen.buffer.active.getLine(0)?.translateToString(true), "full-screen output");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.clearedHistory, []);
    assert.deepEqual(f.mirrors, []);
  });
}

test("normal-buffer clear shortcut still clears and requests one shell redraw", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  assert.equal(screen.buffer.active.type, "normal");
  assert.deepEqual(press(screen), { allowed: false, prevented: true, stopped: true });
  await f.settle();
  assert.equal(screen.clears, 1);
  assert.deepEqual(f.writes, [{ id, data: "\x0c" }]);
  assert.deepEqual(f.clearedHistory, [id]);
  assert.deepEqual(f.mirrors, [{ id, data: "\x1b[H\x1b[2J\x1b[3J" }]);
});

test("returning from alternate mode restores normal-buffer clear handling", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049halt\x1b[?1049l");
  assert.equal(screen.buffer.active.type, "normal");
  assert.equal(press(screen).allowed, false);
  assert.equal(screen.clears, 1);
});

test("alternate-buffer keyup does not clear or consume the event", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  assert.deepEqual(press(screen, "k", "keyup"), { allowed: true, prevented: false, stopped: false });
  assert.equal(screen.clears, 0);
});

test("unbound alternate-buffer shortcut still passes through", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  assert.deepEqual(press(screen, "y"), { allowed: true, prevented: false, stopped: false });
  assert.equal(screen.clears, 0);
});

test("direct clearTab remains independent of the keyboard buffer guard", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  f.clearTab(id);
  await f.settle();
  assert.equal(screen.clears, 1);
  assert.deepEqual(f.writes, [{ id, data: "\x0c" }]);
});

test("find shortcut remains available in the alternate buffer", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  await f.output(id, screen, "\x1b[?1049h");
  assert.equal(press(screen, "f").allowed, false);
  assert.equal(f.getFindRequests(id), 1);
  assert.equal(screen.clears, 0);
});

test("clearing a normal sibling does not clear an alternate-buffer terminal", async (t) => {
  const f = fixture(); t.after(f.close);
  const first = await f.open();
  const second = await f.open();
  await f.output(first.id, first.screen, "\x1b[?1049hretained");
  assert.equal(press(second.screen).allowed, false);
  assert.equal(first.screen.clears, 0);
  assert.equal(first.screen.buffer.active.getLine(0)?.translateToString(true), "retained");
  assert.equal(second.screen.clears, 1);
});
