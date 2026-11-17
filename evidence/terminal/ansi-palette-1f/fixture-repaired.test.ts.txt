import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalAddon, ITerminalOptions, ITheme } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;

const palette = [
  ["black", "--terminal-black", "#201e1c"],
  ["red", "--terminal-red", "#da2424"],
  ["green", "--terminal-green", "#119745"],
  ["yellow", "--terminal-yellow", "#f3d127"],
  ["blue", "--terminal-blue", "#1b5fe0"],
  ["magenta", "--terminal-magenta", "#be09dd"],
  ["cyan", "--terminal-cyan", "#0b879f"],
  ["white", "--terminal-white", "#dedcda"],
  ["brightBlack", "--terminal-bright-black", "#746b66"],
  ["brightRed", "--terminal-bright-red", "#ee3b3b"],
  ["brightGreen", "--terminal-bright-green", "#1bbe56"],
  ["brightYellow", "--terminal-bright-yellow", "#f9e05a"],
  ["brightBlue", "--terminal-bright-blue", "#5487ed"],
  ["brightMagenta", "--terminal-bright-magenta", "#d94df2"],
  ["brightCyan", "--terminal-bright-cyan", "#31bcd7"],
  ["brightWhite", "--terminal-bright-white", "#f6f4f2"],
] as const satisfies ReadonlyArray<readonly [keyof ITheme, string, string]>;

function fixture(withPalette = true) {
  const colors = new Map<string, string>([
    ["--panel", "#121314"], ["--text", "#efefef"], ["--accent", "#3582dc"],
    ...(withPalette ? palette.map(([, token, value]): [string, string] => [token, value]) : []),
  ]);
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const screens: Screen[] = [];
  const writes: { id: string; data: string }[] = [];
  const noop = () => {};
  class Screen {
    readonly terminal;
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
    attachCustomKeyEventHandler() {}
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
      crypto: { randomUUID: () => `ansi-theme-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: (token: string) => colors.get(token) ?? "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.closeTab);
  const { openTab, getTabs, closeTab } = session;
  const emit = (message: PtyEvent) => { assert.ok(event); event(message); };
  return {
    colors, writes, emit,
    open: async () => {
      const id = await openTab("ws", "/workspace");
      const screen = screens.at(-1);
      assert.ok(screen);
      return { id, screen };
    },
    close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}

for (const [field, , expected] of palette) {
  test(`ordinary terminal uses computed ${field} and retains it through ready and exit`, async (t) => {
    const f = fixture(); t.after(f.close);
    const { id, screen } = await f.open();
    assert.equal(screen.options.theme?.[field], expected);
    f.emit({ kind: "ready", id, pid: 12 });
    assert.equal(screen.options.theme?.[field], expected);
    f.emit({ kind: "exit", id, exitCode: 0, signal: null });
    assert.equal(screen.options.theme?.[field], expected);
    assert.deepEqual(f.writes, []);
  });
}

test("unset ANSI CSS tokens retain xterm's default palette", async (t) => {
  const f = fixture(false); t.after(f.close);
  const { screen } = await f.open();
  for (const [field] of palette) assert.equal(screen.options.theme?.[field], undefined);
});

test("the palette does not change the existing cursor and input lifecycle", async (t) => {
  const f = fixture(); t.after(f.close);
  const { id, screen } = await f.open();
  assert.equal(screen.options.disableStdin, true);
  assert.equal(screen.options.theme?.cursor, "transparent");
  assert.equal(screen.options.theme?.background, "#121314");
  assert.equal(screen.options.theme?.foreground, "#efefef");
  assert.equal(screen.options.theme?.selectionBackground, "#3582dc66");
  assert.equal(screen.options.theme?.selectionInactiveBackground, "#3582dc4d");
  f.emit({ kind: "ready", id, pid: 12 });
  assert.equal(screen.options.disableStdin, false);
  assert.equal(screen.options.theme?.cursor, "#efefef");
  f.emit({ kind: "exit", id, exitCode: 0, signal: null });
  assert.equal(screen.options.disableStdin, true);
  assert.equal(screen.options.theme?.cursor, "transparent");
  assert.equal(screen.options.theme?.cursorAccent, "#121314");
  assert.deepEqual(f.writes, []);
});

test("ordinary terminal keeps line-feed conversion and Unicode 11", async (t) => {
  const f = fixture(); t.after(f.close);
  const { screen } = await f.open();
  assert.equal(screen.options.convertEol, true);
  assert.equal(screen.unicode.activeVersion, "11");
  assert.equal(screen.options.cursorBlink, true);
});

test("palette initialization does not change another terminal's options", async (t) => {
  const f = fixture(); t.after(f.close);
  const first = await f.open();
  const before = { ...first.screen.options.theme };
  for (const [, token] of palette) f.colors.set(token, "#aabbcc");
  const second = await f.open();
  assert.notEqual(first.id, second.id);
  assert.deepEqual({ ...first.screen.options.theme }, before);
  assert.equal(second.screen.options.theme?.background, "#121314");
  assert.deepEqual(f.writes, []);
});
