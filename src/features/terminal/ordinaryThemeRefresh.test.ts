import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalAddon, ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";

import { palette, fixtureColors } from "../../theme/terminalAnsiThemeFixture.ts";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;

function fixture(withPalette = true) {
  const colors = new Map<string, string>([
    ["--panel", fixtureColors.background], ["--text", fixtureColors.foreground], ["--accent", fixtureColors.accent],
    ...(withPalette ? palette.map(([, token, value]): [string, string] => [token, value]) : []),
  ]);
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const screens: Screen[] = [];
  const writes: { id: string; data: string }[] = [];
  const spawns: string[] = [];
  const noop = () => {};
  const root = {};
  const observers: AppearanceObserver[] = [];
  class AppearanceObserver {
    connected = false;
    target: object | undefined;
    attributes: string[] | undefined;
    readonly callback: () => void;
    constructor(callback: () => void) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target: object, options: { attributes?: boolean; attributeFilter?: string[] }) {
      this.connected = options.attributes === true;
      this.target = target;
      this.attributes = options.attributeFilter;
    }
    disconnect() { this.connected = false; }
  }
  const mutate = (attribute: string) => {
    for (const observer of observers) {
      if (observer.connected && observer.target === root && (!observer.attributes || observer.attributes.includes(attribute))) observer.callback();
    }
  };
  class Screen {
    readonly terminal;
    disposed = false;
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
    dispose() { this.disposed = true; this.terminal.dispose(); }
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { activate() {} dispose() {} fit() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async ({ id }: { id: string }) => { spawns.push(id); }, ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
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
      MutationObserver: AppearanceObserver,
      crypto: { randomUUID: () => `live-theme-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: (token: string) => colors.get(token) ?? "" }),
      document: { documentElement: root, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.closeTab);
  const { openTab, getTabs, closeTab } = session;
  const emit = (message: PtyEvent) => { assert.ok(event); event(message); };
  return {
    colors, writes, spawns, emit, mutate,
    open: async () => {
      const id = await openTab("ws", "/workspace");
      const screen = screens.at(-1);
      assert.ok(screen);
      return { id, screen };
    },
    close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}

const appearanceAttributes = ["class", "data-theme", "data-color-palette", "data-low-contrast"];

for (const [index, [field, token, initial]] of palette.entries()) {
  test(`ordinary terminal refreshes ${field} after root appearance changes`, async (t) => {
    const f = fixture(); t.after(f.close);
    const { id, screen } = await f.open();
    const instance = screen.terminal;
    f.emit({ kind: "ready", id, pid: 12 });
    assert.equal(screen.options.theme?.[field], initial);
    f.colors.set(token, fixtureColors.replacement);
    f.colors.set("--panel", fixtureColors.foreground);
    f.colors.set("--text", fixtureColors.background);
    f.colors.set("--accent", fixtureColors.replacement);
    f.mutate(appearanceAttributes[index % appearanceAttributes.length]);
    assert.equal(screen.options.theme?.[field], fixtureColors.replacement);
    assert.equal(screen.options.theme?.background, fixtureColors.foreground);
    assert.equal(screen.options.theme?.foreground, fixtureColors.background);
    assert.equal(screen.options.theme?.cursor, fixtureColors.background);
    assert.equal(screen.options.theme?.cursorAccent, fixtureColors.foreground);
    assert.equal(screen.options.theme?.selectionBackground, `${fixtureColors.replacement}66`);
    assert.equal(screen.options.theme?.selectionInactiveBackground, `${fixtureColors.replacement}4d`);
    assert.equal(screen.options.disableStdin, false);
    assert.equal(screen.options.convertEol, true);
    assert.equal(screen.unicode.activeVersion, "11");
    assert.equal(screen.terminal, instance);
    assert.equal(screen.disposed, false);
    assert.deepEqual(f.spawns, [id]);
    assert.deepEqual(f.writes, []);
  });
}

test("CSS value changes without a root mutation leave the first terminal unchanged", async (t) => {
  const f = fixture(); t.after(f.close);
  const first = await f.open();
  const before = { ...first.screen.options.theme };
  for (const [, token] of palette) f.colors.set(token, fixtureColors.replacement);
  const second = await f.open();
  assert.notEqual(first.id, second.id);
  assert.deepEqual({ ...first.screen.options.theme }, before);
  for (const [field] of palette) assert.equal(second.screen.options.theme?.[field], fixtureColors.replacement);
  assert.deepEqual(f.writes, []);
});

test("unrelated root attributes do not refresh ordinary terminal colors", async (t) => {
  const f = fixture(); t.after(f.close);
  const { screen } = await f.open();
  const before = { ...screen.options.theme };
  for (const [, token] of palette) f.colors.set(token, fixtureColors.replacement);
  f.mutate("data-unrelated");
  assert.deepEqual({ ...screen.options.theme }, before);
  assert.deepEqual(f.writes, []);
});

test("appearance notifications preserve starting and exited cursor and input states", async (t) => {
  const f = fixture(); t.after(f.close);
  const starting = await f.open();
  f.colors.set("--text", fixtureColors.replacement);
  f.mutate("data-theme");
  assert.equal(starting.screen.options.disableStdin, true);
  assert.equal(starting.screen.options.theme?.cursor, "transparent");
  const exited = await f.open();
  f.emit({ kind: "ready", id: exited.id, pid: 13 });
  f.emit({ kind: "exit", id: exited.id, exitCode: 0, signal: null });
  f.colors.set("--text", fixtureColors.background);
  f.mutate("data-color-palette");
  assert.equal(starting.screen.options.disableStdin, true);
  assert.equal(starting.screen.options.theme?.cursor, "transparent");
  assert.equal(exited.screen.options.disableStdin, true);
  assert.equal(exited.screen.options.theme?.cursor, "transparent");
  assert.deepEqual(f.writes, []);
});

test("disposed terminals retain no effective appearance notification", async (t) => {
  const f = fixture(); t.after(f.close);
  const first = await f.open();
  f.close();
  assert.equal(first.screen.disposed, true);
  const before = { ...first.screen.options.theme };
  for (const [, token] of palette) f.colors.set(token, fixtureColors.replacement);
  f.mutate("data-low-contrast");
  assert.deepEqual({ ...first.screen.options.theme }, before);
  const second = await f.open();
  assert.notEqual(second.id, first.id);
  for (const [, token, initial] of palette) f.colors.set(token, initial);
  f.mutate("data-theme");
  assert.deepEqual({ ...first.screen.options.theme }, before);
  assert.equal(second.screen.disposed, false);
  assert.deepEqual(f.writes, []);
});
