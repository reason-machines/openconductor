import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import type { ITerminalAddon, ITerminalOptions } from "@xterm/xterm";
import type { ScriptOutput } from "../../components/ScriptOutput";
import { fixtureColors, palette } from "../../theme/terminalAnsiThemeFixture.ts";
import type { PtyEvent } from "./events";
import type * as Session from "./session";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const React: typeof import("react") = deps("react");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
const { create, act }: {
  create: (element: ReactElement, options: { createNodeMock: () => unknown }) => { unmount: () => void };
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Exports = Record<string, unknown> & Partial<typeof Session> & { ScriptOutput?: typeof ScriptOutput };
const compiled = new Map<string, string>();

function fixture() {
  const colors = new Map<string, string>([
    ["--panel", fixtureColors.background], ["--bg", fixtureColors.background],
    ["--text", fixtureColors.foreground], ["--accent", fixtureColors.accent],
    ["--accent-text", fixtureColors.selectionForeground],
    ...palette.map(([, token, value]): [string, string] => [token, value]),
  ]);
  const root = {};
  const noop = () => {};
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const screens: Screen[] = [];
  const spawns: string[] = [];
  const writes: string[] = [];
  const observers: AppearanceObserver[] = [];
  class AppearanceObserver {
    connected = false;
    target: unknown;
    attributes?: string[];
    readonly callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(target: unknown, options?: { attributeFilter?: string[] }) {
      this.connected = true; this.target = target; this.attributes = options?.attributeFilter;
    }
    disconnect() { this.connected = false; }
  }
  class Screen {
    readonly terminal;
    readonly element = new EventTarget();
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
    open() {}
    getSelection() { return ""; }
    write(data: string, done?: () => void) { this.terminal.write(data, done); }
    clear() { this.terminal.clear(); }
    dispose() { this.disposed = true; this.terminal.dispose(); }
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { activate() {} dispose() {} fit() {} } },
    "@tauri-apps/plugin-dialog": { confirm: () => { throw new Error("No native dialog in selection regression"); } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async ({ id }: { id: string }) => { spawns.push(id); },
      ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
      ptyWrite: async (_id: string, data: string) => { writes.push(data); },
      ptyClearHistory: async () => {}, ptyWriteMirror: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => null, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: true }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: () => noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: () => noop },
    "src/features/terminal/FindBar": { FindBar: () => null, useBufferFind: () => ({ open: noop }) },
    "src/keybindings/KeybindingsProvider": { useKeybindings: noop },
    "src/keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
    "src/backend": { openUrl: () => { throw new Error("No browser in selection regression"); } },
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(name: string): Exports {
    name = name.replace(/\.tsx?$/, "");
    const cached = modules.get(name);
    if (cached) return cached.exports;
    const file = name + (name === "src/components/ScriptOutput" ? ".tsx" : ".ts");
    let output = compiled.get(file);
    if (output === undefined) {
      output = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      compiled.set(file, output);
    }
    const module: { exports: Exports } = { exports: {} };
    modules.set(name, module);
    const require = (dep: string): unknown => {
      if (dep === "@xterm/addon-web-links") return deps(dep);
      if (["react", "react/jsx-runtime", "@xterm/addon-unicode11"].includes(dep)) return deps(dep);
      if (dep.endsWith(".css")) return {};
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      MutationObserver: AppearanceObserver, ResizeObserver: AppearanceObserver,
      crypto: { randomUUID: () => `selection-theme-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: (token: string) => colors.get(token) ?? "" }),
      document: { documentElement: root, createElement: () => ({ className: "", remove: noop }), activeElement: null },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  return {
    colors, spawns, writes,
    mutate(attribute = "data-theme") {
      for (const observer of observers) {
        if (observer.connected && observer.target === root && (!observer.attributes || observer.attributes.includes(attribute))) observer.callback();
      }
    },
    emit(message: PtyEvent) { assert.ok(event); event(message); },
    async ordinary() {
      const { openTab, getTabs, closeTab } = load("src/features/terminal/session");
      assert.ok(openTab && getTabs && closeTab);
      const id = await openTab("ws", "/workspace");
      const screen = screens.at(-1); assert.ok(screen);
      return { id, screen, close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); } };
    },
    async script() {
      const { ScriptOutput: Output } = load("src/components/ScriptOutput"); assert.ok(Output);
      const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
      let renderer: { unmount: () => void } | undefined;
      await act(async () => { renderer = create(React.createElement(Output, { output: "retained output" }), { createNodeMock: () => host }); });
      const screen = screens.at(-1); assert.ok(screen);
      return { screen, close: () => act(async () => { renderer?.unmount(); }) };
    },
  };
}

const selection = [
  ["selectionBackground", "--accent", fixtureColors.accent],
  ["selectionForeground", "--accent-text", fixtureColors.selectionForeground],
] as const;

for (const [field, token, expected] of selection) {
  test(`ordinary constructor uses the unmodified semantic ${field}`, async (t) => {
    const f = fixture(); const terminal = await f.ordinary(); t.after(terminal.close);
    assert.equal(terminal.screen.options.theme?.[field], expected);
  });

  test(`ordinary appearance refresh updates ${field} independently`, async (t) => {
    const f = fixture(); const terminal = await f.ordinary(); t.after(terminal.close);
    const other = selection.find(([name]) => name !== field)!;
    const instance = terminal.screen.terminal;
    f.colors.set(token, fixtureColors.replacement);
    f.mutate("data-color-palette");
    assert.equal(terminal.screen.options.theme?.[field], fixtureColors.replacement);
    assert.equal(terminal.screen.options.theme?.[other[0]], other[2]);
    assert.equal(terminal.screen.options.theme?.background, fixtureColors.background);
    assert.equal(terminal.screen.options.theme?.foreground, fixtureColors.foreground);
    assert.equal(terminal.screen.terminal, instance);
    assert.equal(terminal.screen.disposed, false);
    assert.deepEqual(f.spawns, [terminal.id]);
    assert.deepEqual(f.writes, []);
  });

  test(`ScriptOutput retains independent ${field} mapping on appearance refresh`, async (t) => {
    const f = fixture(); const terminal = await f.script(); t.after(terminal.close);
    const other = selection.find(([name]) => name !== field)!;
    assert.equal(terminal.screen.options.theme?.[field], expected);
    f.colors.set(token, fixtureColors.replacement);
    await act(async () => { f.mutate("class"); });
    assert.equal(terminal.screen.options.theme?.[field], fixtureColors.replacement);
    assert.equal(terminal.screen.options.theme?.[other[0]], other[2]);
    assert.equal(terminal.screen.options.theme?.selectionInactiveBackground, undefined);
    assert.deepEqual(f.spawns, []);
    assert.deepEqual(f.writes, []);
  });
}

test("ordinary selection follows IJe's omitted inactive override through refresh and lifecycle", async (t) => {
  const f = fixture(); const terminal = await f.ordinary(); t.after(terminal.close);
  const check = () => {
    for (const [field, , expected] of selection) assert.equal(terminal.screen.options.theme?.[field], expected);
    assert.equal(terminal.screen.options.theme?.selectionInactiveBackground, undefined);
  };
  check();
  f.emit({ kind: "ready", id: terminal.id, pid: 1 }); check();
  f.colors.set("--text", fixtureColors.replacement);
  f.colors.set("--panel", fixtureColors.replacement);
  f.mutate(); check();
  assert.equal(terminal.screen.options.theme?.foreground, fixtureColors.replacement);
  f.emit({ kind: "exit", id: terminal.id, exitCode: 0, signal: null }); check();
});

test("unrelated root attributes leave ordinary selection unchanged", async (t) => {
  const f = fixture(); const terminal = await f.ordinary(); t.after(terminal.close);
  const before = { ...terminal.screen.options.theme };
  for (const [, token] of selection) f.colors.set(token, fixtureColors.replacement);
  f.mutate("data-unrelated");
  assert.deepEqual({ ...terminal.screen.options.theme }, before);
});

test("retained REA IJe/F3 bytes bind selection to primary and primary-foreground without an inactive override", () => {
  const base = "evidence/terminal/ordinary-theme-refresh-1f/";
  const spans = [
    ["IJe", "ea65e840d4491339eaeeed4beda371d58fc6a87b78fc14e50c6a32ac9915d081"],
    ["F3", "106c7a6024877413de767c03c118b06ab6724d55003afa4fc9b09961d9a2a0d0"],
  ];
  for (const [symbol, sha256] of spans) {
    assert.equal(createHash("sha256").update(readFileSync(`${base}reference/${symbol}.txt`)).digest("hex"), sha256);
  }
  const source = readFileSync(`${base}reference/IJe.txt`, "utf8");
  assert.ok(source.includes('selectionBackground:F3("--primary"),selectionForeground:F3("--primary-foreground")'));
  assert.ok(!source.includes("selectionInactiveBackground"));
});
