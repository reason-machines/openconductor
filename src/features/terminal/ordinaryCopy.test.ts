import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";

// Isolated qualification may share exact test dependencies without changing the app lockfile.
const depsRoot = resolve(process.env.ORDINARY_COPY_DEPS ?? ".");
const deps = createRequire(resolve(depsRoot, "package.json"));
const ts: typeof import("typescript") = deps("typescript");
type Exports = Record<string, unknown>;
const sourceModules = new Map<string, { exports: Exports }>();
const xtermRoot = resolve(depsRoot, "node_modules/@xterm/xterm/src");
function loadXterm(id: string): Exports {
  assert.match(id, /^(browser|common|vs)\//, "confined xterm source module");
  assert.ok(!id.split("/").includes(".."), "no path escape");
  const cached = sourceModules.get(id);
  if (cached) return cached.exports;
  const path = resolve(xtermRoot, `${id}.ts`);
  const module = { exports: {} };
  sourceModules.set(id, module);
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true },
  }).outputText;
  const require = (name: string) => loadXterm(name.startsWith(".")
    ? resolve(dirname(path), name).slice(xtermRoot.length + 1).replace(/\\/g, "/") : name);
  runInNewContext(`(function(require,module,exports){${output}\n})`, {
    console, process, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance,
  }, { filename: path })(require, module, module.exports);
  return module.exports;
}
const { BufferLine } = loadXterm("common/buffer/BufferLine");
const { Buffer: XtermBuffer } = loadXterm("common/buffer/Buffer");
const { SelectionService, SelectionMode } = loadXterm("browser/services/SelectionService");
const { copyHandler } = loadXterm("browser/Clipboard");
assert.ok(typeof BufferLine === "function" && typeof XtermBuffer === "function" && typeof SelectionService === "function");
assert.ok(SelectionMode && typeof SelectionMode === "object");
assert.ok(typeof copyHandler === "function");
const normalSelectionMode = Reflect.get(SelectionMode, "NORMAL");
const nativeCopyHandler = copyHandler;
type Selection = { lines: string[]; start?: [number, number]; end?: [number, number] };
function selectionService(input: Selection) {
  assert.ok(typeof BufferLine === "function" && typeof XtermBuffer === "function" && typeof SelectionService === "function");
  const rows = input.lines.map((text) => {
    const line: { set(index: number, cell: [number, string, number, number]): void } = Reflect.construct(BufferLine, [Math.max(text.length, 1)]);
    Array.from(text).forEach((character, index) => line.set(index, [0, character, 1, character.codePointAt(0) ?? 0]));
    return line;
  });
  const buffer = Object.create(XtermBuffer.prototype, { lines: { value: { get: (index: number) => rows[index] } } });
  return Object.create(SelectionService.prototype, {
    _model: { value: { finalSelectionStart: input.start, finalSelectionEnd: input.end } },
    _activeSelectionMode: { value: normalSelectionMode }, _bufferService: { value: { buffer } },
  });
}
class CopyEvent extends Event {
  clipboardData: { setData(type: string, text: string): void } | null;
  constructor(clipboardData: { setData(type: string, text: string): void } | null) {
    super("copy", { bubbles: true, cancelable: true }); this.clipboardData = clipboardData;
  }
}
const compiled = new Map<string, string>();
async function fixture(input: Selection) {
  const selection = selectionService(input);
  const screens: Screen[] = [];
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const writes: string[] = [];
  const noop = () => {};
  class Screen {
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    cols = 80; rows = 24;
    buffer = { normal: {}, active: {} };
    disposed = 0;
    opened = 0;
    options: Record<string, unknown>;
    readonly nativeCopy = (event: Event) => {
      if (this.getSelection()) Reflect.apply(nativeCopyHandler, undefined, [event, selection]);
    };
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() { this.opened++; this.element.addEventListener("copy", this.nativeCopy); }
    focus() {}
    write(_data: string, done?: () => void) { done?.(); }
    attachCustomKeyEventHandler() {}
    onData() {}
    onResize() {}
    getSelection(): string {
      const result: unknown = Reflect.get(selection, "selectionText");
      assert.ok(typeof result === "string"); return result;
    }
    dispose() { this.disposed++; this.element.removeEventListener("copy", this.nativeCopy); }
  }
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, remove: noop });
  const container = Object.assign(new EventTarget(), { appendChild: () => host });
  class Observer { observe() {} disconnect() {} }
  const boundaries: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@tauri-apps/plugin-dialog": { confirm: () => { throw new Error("No native dialog in terminal regression"); } },
    "src/backend": { openUrl: () => { throw new Error("No browser in terminal regression"); } },
    "@xterm/addon-fit": { FitAddon: class { fit() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async () => {}, ptyResize: async () => {}, ptyKill: async () => {}, ptyAckBytes: async () => {},
      ptyWrite: async (_id: string, data: string) => { writes.push(data); },
      ptyClearHistory: async () => {}, ptyWriteMirror: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {}, ptyDeleteWorkspaceTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => null, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: true }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: noop },
  };
  const modules = new Map<string, { exports: Exports & Partial<typeof Session> }>();
  function load(name: string): Exports & Partial<typeof Session> {
    name = name.replace(/\.tsx?$/, "");
    const cached = modules.get(name);
    if (cached) return cached.exports;
    const file = name + ".ts";
    let output = compiled.get(file);
    if (output === undefined) {
      output = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
      }).outputText;
      compiled.set(file, output);
    }
    const module = { exports: {} };
    modules.set(name, module);
    const require = (dep: string): unknown => {
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      assert.ok(Object.prototype.hasOwnProperty.call(boundaries, key) || dep.startsWith("."), `unexpected package ${dep}`);
      return Object.prototype.hasOwnProperty.call(boundaries, key) ? boundaries[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout, ResizeObserver: Observer, MutationObserver: Observer,
      crypto: { randomUUID: () => `ordinary-copy-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, activeElement: null, createElement: () => host },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const { openTab, getTabs, attachTab, closeTab } = load("src/features/terminal/session");
  assert.ok(openTab && getTabs && attachTab && closeTab);
  const id = await openTab("ws", "/workspace");
  const screen = screens[0];
  assert.ok(screen && event);
  const emit = event;
  let detach = attachTab(id, container as unknown as HTMLElement);
  function copy(options: { outside?: boolean; clipboard?: boolean } = {}) {
    const payload = new Map<string, string>([["text/plain", "unchanged"]]);
    const event = new CopyEvent(options.clipboard === false ? null : { setData: (type, text) => { payload.set(type, text); } });
    (options.outside ? container : screen.element).dispatchEvent(event);
    return { text: payload.get("text/plain"), prevented: event.defaultPrevented };
  }
  return {
    copy, raw: () => screen.getSelection(), writes,
    state: (state: "ready" | "exit") => emit(state === "ready" ? { kind: "ready", id, pid: 1 } : { kind: "exit", id, exitCode: 0, signal: null }),
    reattach: () => { detach(); detach = attachTab(id, container as unknown as HTMLElement); },
    opened: () => screen.opened, disposed: () => screen.disposed,
    close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}

test("ordinary copy trims a partial selection ending before later terminal text", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  try { assert.equal(f.raw(), "alpha   "); assert.deepEqual(f.copy(), { text: "alpha", prevented: true }); }
  finally { f.close(); }
});
test("ordinary copy trims each line and preserves indentation and internal spaces", async () => {
  const f = await fixture({ lines: ["  first   ", "inner  words  later"], start: [0, 0], end: [14, 1] });
  try { assert.equal(f.raw(), "  first   \ninner  words  "); assert.deepEqual(f.copy(), { text: "  first\ninner  words", prevented: true }); }
  finally { f.close(); }
});
test("ordinary copy of selected spaces writes an empty plain-text value", async () => {
  const f = await fixture({ lines: ["   later"], start: [0, 0], end: [3, 0] });
  try { assert.deepEqual(f.copy(), { text: "", prevented: true }); } finally { f.close(); }
});
test("ordinary copy preserves selected blank lines rather than trimming the whole selection", async () => {
  const f = await fixture({ lines: ["first  ", "  ", "last"], start: [0, 0], end: [0, 2] });
  try { assert.deepEqual(f.copy(), { text: "first\n\n", prevented: true }); } finally { f.close(); }
});
test("ordinary copy preserves leading and internal spaces without trailing whitespace", async () => {
  const f = await fixture({ lines: ["  inner  words tail"], start: [0, 0], end: [14, 0] });
  try { assert.deepEqual(f.copy(), { text: "  inner  words", prevented: true }); } finally { f.close(); }
});
test("ordinary collapsed selection leaves clipboard and default action unchanged", async () => {
  const f = await fixture({ lines: ["alpha"], start: [2, 0], end: [2, 0] });
  try { assert.deepEqual(f.copy(), { text: "unchanged", prevented: false }); } finally { f.close(); }
});
test("copy outside the ordinary terminal is not intercepted", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  try { assert.deepEqual(f.copy({ outside: true }), { text: "unchanged", prevented: false }); } finally { f.close(); }
});
test("ordinary copy without clipboard data does not throw", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  try { assert.deepEqual(f.copy({ clipboard: false }), { text: "unchanged", prevented: true }); } finally { f.close(); }
});
test("ordinary reattachment keeps one open terminal and its corrected copy behavior", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  try { f.reattach(); assert.equal(f.opened(), 1); assert.deepEqual(f.copy(), { text: "alpha", prevented: true }); }
  finally { f.close(); }
});
test("ordinary close removes its copy listener from the old terminal element", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  f.close(); assert.equal(f.disposed(), 1); assert.deepEqual(f.copy(), { text: "unchanged", prevented: false });
});
test("ordinary starting and exited terminals retain local copy behavior without PTY input", async () => {
  const f = await fixture({ lines: ["alpha   beta"], start: [0, 0], end: [8, 0] });
  try {
    assert.deepEqual(f.copy(), { text: "alpha", prevented: true });
    f.state("ready"); f.state("exit");
    assert.deepEqual(f.copy(), { text: "alpha", prevented: true }); assert.deepEqual(f.writes, []);
  } finally { f.close(); }
});
