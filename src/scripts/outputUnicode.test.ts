import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import type { ITerminalAddon, ITerminalOptions, Terminal as Xterm } from "@xterm/xterm";
import type { ScriptOutput } from "../components/ScriptOutput";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
type Renderer = { update: (element: ReactElement) => void; unmount: () => void };
const { create, act }: {
  create: (element: ReactElement, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");

type Exports = Record<string, unknown> & { ScriptOutput?: typeof ScriptOutput };
async function fixture(output: string, cols = 12) {
  const screens: Screen[] = [];
  let fontOff = 0;
  let scrollbackOff = 0;
  class Screen {
    readonly engine: Xterm;
    readonly element = new EventTarget();
    disposed = 0;
    constructor(options: ITerminalOptions) {
      this.engine = new RealTerminal({ ...options, cols, rows: 5 });
      screens.push(this);
    }
    get options() { return this.engine.options; }
    get unicode() { return this.engine.unicode; }
    loadAddon(addon: ITerminalAddon) { this.engine.loadAddon(addon); }
    open() {}
    focus() {}
    getSelection() { return ""; }
    write(data: string) { this.engine.write(data); }
    dispose() { this.disposed++; this.engine.dispose(); }
  }
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
  const inert = () => {};
  class Observer { observe() {} disconnect() {} }
  const boundaries: Record<string, unknown> = {
    "src/backend": { openUrl: () => { throw new Error("No browser in Unicode regression"); } },
    "src/features/terminal/font": {
      currentTerminalFont: () => ({ family: "monospace", size: 12 }),
      onTerminalFont: () => () => { fontOff++; }, TERMINAL_LINE_HEIGHT: 1.2,
    },
    "src/features/terminal/scrollback": {
      currentScrollbackRows: () => 2000, onScrollbackRows: () => () => { scrollbackOff++; },
    },
    "src/features/terminal/FindBar": { FindBar: () => null, useBufferFind: () => ({ open: inert }) },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
  };
  const files: Record<string, string> = {
    "src/components/ScriptOutput": "src/components/ScriptOutput.tsx",
    "src/scripts/output": "src/scripts/output.ts",
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(file: string): Exports {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    const path = files[file];
    assert.ok(path, `Unexpected production dependency: ${file}`);
    const module: { exports: Exports } = { exports: {} };
    modules.set(file, module);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime" || name === "@xterm/addon-unicode11") return deps(name);
      if (name === "@xterm/xterm") return { Terminal: Screen };
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No link warning in outputUnicode regression"); } };
      if (name === "@xterm/addon-fit") return { FitAddon: class { activate() {} dispose() {} fit() {} } };
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected package: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      console, document: { documentElement: {}, activeElement: null },
      getComputedStyle: () => ({ getPropertyValue: () => "" }), ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptOutput: Component } = load("src/components/ScriptOutput");
  assert.ok(Component);
  let renderer: Renderer | undefined;
  await act(async () => { renderer = create(React.createElement(Component, { output }), { createNodeMock: () => host }); });
  assert.equal(screens.length, 1);
  const screen = screens[0];
  const flush = () => new Promise<void>((done) => { screen.engine.write("", done); });
  await flush();
  return {
    terminal: screen.engine,
    update: async (next: string) => {
      assert.ok(renderer);
      await act(async () => { renderer?.update(React.createElement(Component, { output: next })); });
      await flush();
    },
    close: () => act(async () => { renderer?.unmount(); }),
    cleanup: () => ({ terminal: screen.disposed, font: fontOff, scrollback: scrollbackOff }),
  };
}

test("Run and Setup output reserve two cells for a Unicode 11 emoji", async () => {
  const f = await fixture("A\u{1F680}B");
  try { assert.equal(f.terminal.buffer.active.cursorX, 4); }
  finally { await f.close(); }
});

test("adjacent Unicode 11 emoji preserve the following output column", async () => {
  const f = await fixture("\u{1F9EA}\u{1F4E6}!");
  try { assert.equal(f.terminal.buffer.active.cursorX, 5); }
  finally { await f.close(); }
});

test("wide Unicode 11 output wraps the next character onto the next row", async () => {
  const f = await fixture("abc\u{1F680}Z", 5);
  try { assert.equal(f.terminal.buffer.active.getLine(1)?.translateToString(true), "Z"); }
  finally { await f.close(); }
});

test("Unicode 11 combining marks do not advance the output cursor", async () => {
  const f = await fixture("a\u1AB0b");
  try { assert.equal(f.terminal.buffer.active.cursorX, 2); }
  finally { await f.close(); }
});

test("ASCII output keeps its original cell width", async () => {
  const f = await fixture("plain");
  try { assert.equal(f.terminal.buffer.active.cursorX, 5); }
  finally { await f.close(); }
});

test("CJK output keeps its existing wide-cell behavior", async () => {
  const f = await fixture("A\u754cB");
  try { assert.equal(f.terminal.buffer.active.cursorX, 4); }
  finally { await f.close(); }
});

test("existing combining accents keep their existing zero-cell behavior", async () => {
  const f = await fixture("e\u0301!");
  try { assert.equal(f.terminal.buffer.active.cursorX, 2); }
  finally { await f.close(); }
});

test("empty output leaves the terminal at its initial position", async () => {
  const f = await fixture("");
  try { assert.equal(f.terminal.buffer.active.cursorX, 0); assert.equal(f.terminal.buffer.active.cursorY, 0); }
  finally { await f.close(); }
});

test("output replacement and cleanup still use the real terminal lifecycle", async () => {
  const f = await fixture("previous output");
  try {
    await f.update("new");
    assert.equal(f.terminal.buffer.active.getLine(0)?.translateToString(true), "new");
    assert.equal(f.terminal.buffer.active.cursorX, 3);
  } finally { await f.close(); }
  assert.deepEqual(f.cleanup(), { terminal: 1, font: 1, scrollback: 1 });
});
