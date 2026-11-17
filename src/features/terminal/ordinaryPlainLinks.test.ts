import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";

// Qualification only: actual session/backend; inert terminal cells, PTY and native IPC.
// A future installed web-link addon is loaded from the real package, never simulated.
const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
type Exports = Record<string, unknown> & Partial<typeof Session>;
type Link = { text: string; range: unknown; activate: (event: MouseEvent, text: string) => void };
type Provider = { provideLinks: (line: number, callback: (links: Link[] | undefined) => void) => void };
const compiled = new Map<string, string>();
async function fixture(options: { openerError?: boolean } = {}) {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const errors: unknown[][] = [];
  const writes: string[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  let event: ((event: PtyEvent) => void) | undefined;
  class Screen {
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    cols = 160; rows = 24;
    options: ITerminalOptions;
    providers: Provider[] = [];
    addons: { dispose?: () => void }[] = [];
    lines: string[] = [];
    providerDisposed = 0; opened = 0; disposed = 0;
    onInput?: (data: string) => void;
    active = {
      getNullCell: () => ({ value: "", getChars() { return this.value; }, getWidth() { return 1; } }),
      getLine: (index: number) => {
        const text = this.lines[index];
        return text === undefined ? undefined : {
          isWrapped: false, length: this.cols,
          translateToString: () => text,
          getCell: (column: number, cell: { value: string }) => { cell.value = text[column] ?? ""; return cell; },
        };
      },
    };
    buffer = { normal: this.active, active: this.active };
    constructor(options: ITerminalOptions) { this.options = options; screens.push(this); }
    loadAddon(addon: { activate?: (terminal: Screen) => void; dispose?: () => void }) { this.addons.push(addon); addon.activate?.(this); }
    registerLinkProvider(provider: Provider) {
      this.providers.push(provider);
      return { dispose: () => { this.providerDisposed++; this.providers = this.providers.filter((item) => item !== provider); } };
    }
    open() { this.opened++; }
    focus() {}
    write(data: string, done?: () => void) { this.lines = data.split(/\r?\n/); done?.(); }
    attachCustomKeyEventHandler() {}
    onData(callback: (data: string) => void) { this.onInput = callback; }
    onResize() {}
    getSelection() { return ""; }
    dispose() { for (const addon of this.addons) addon.dispose?.(); this.disposed++; }
  }
  class Observer { observe() {} disconnect() {} }
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, remove: noop });
  const container = Object.assign(new EventTarget(), { appendChild: () => host });
  const boundaries: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "@tauri-apps/api/core": { invoke: async (command: string, args: Record<string, unknown>) => {
      calls.push({ command, args: structuredClone(args) });
      assert.equal(command, "plugin:opener|open_url", "plain web links do not use encoded-link confirmation");
      if (options.openerError) throw new Error("inert opener rejected");
    }, isTauri: () => true, Channel: class {} },
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
    const file = name === "@tauri-apps/plugin-dialog" ? deps.resolve(name) : `${name}.ts`;
    let output = compiled.get(file);
    if (output === undefined) {
      output = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
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
    assert.ok(isAbsolute(file) || file.startsWith("src/"));
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console: { error: (...values: unknown[]) => { errors.push(values); } }, URL,
      TextDecoder, TextEncoder, setTimeout, clearTimeout, ResizeObserver: Observer, MutationObserver: Observer,
      crypto: { randomUUID: () => "ordinary-plain-link" },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, activeElement: null, createElement: () => host }, window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const { openTab, attachTab, closeTab } = load("src/features/terminal/session");
  assert.ok(openTab && attachTab && closeTab);
  const id = await openTab("ws", "/workspace");
  assert.equal(screens.length, 1);
  const screen = screens[0];
  let detach = attachTab(id, container as unknown as HTMLElement);
  assert.ok(event);
  const emit = event;
  return {
    screen, calls, errors, writes,
    async links(text: string) {
      emit({ kind: "data", id, data: new TextEncoder().encode(text) });
      const found: Link[] = [];
      for (const provider of screen.providers) await new Promise<void>((resolve) => provider.provideLinks(1, (links) => { found.push(...links ?? []); resolve(); }));
      return found;
    },
    async click(link: Link, metaKey = true, ctrlKey = false) {
      link.activate({ metaKey, ctrlKey } as MouseEvent, link.text);
      for (let i = 0; i < 30; i++) await Promise.resolve();
    },
    reattach() { detach(); detach = attachTab(id, container as unknown as HTMLElement); },
    close() { closeTab("ws", id); },
  };
}
const url = "https://example.test/docs?from=terminal#result";

test("ordinary terminal registers a plain-text HTTP link provider", async () => {
  const f = await fixture(); try { assert.equal(f.screen.providers.length, 1); } finally { f.close(); }
});
test("ordinary plain HTTPS Command-click opens the exact target without encoded-link warning", async () => {
  const f = await fixture();
  try {
    const links = await f.links(`See ${url}`); assert.equal(links.length, 1); assert.equal(links[0].text, url);
    assert.deepEqual(f.calls, []); await f.click(links[0]);
    assert.deepEqual(f.calls, [{ command: "plugin:opener|open_url", args: { url } }]);
  } finally { f.close(); }
});
test("ordinary plain HTTP localhost links exclude trailing sentence punctuation", async () => {
  const f = await fixture(); const target = "http://localhost:55000/path?one=two#result";
  try { const links = await f.links(`Server: ${target}.`); assert.equal(links.length, 1); assert.equal(links[0].text, target); }
  finally { f.close(); }
});
test("ordinary plain uppercase HTTPS links keep their original target", async () => {
  const f = await fixture(); const target = "HTTPS://EXAMPLE.TEST/Case";
  try { const links = await f.links(target); assert.equal(links.length, 1); await f.click(links[0]); assert.equal(f.calls[0]?.args.url, target); }
  finally { f.close(); }
});
test("ordinary plain unmodified and Control-only clicks cannot open the URL", async () => {
  const f = await fixture();
  try { const links = await f.links(url); for (const link of links) { await f.click(link, false); await f.click(link, false, true); } assert.deepEqual(f.calls, []); }
  finally { f.close(); }
});
test("ordinary plain unsafe protocols, malformed addresses and bare hostnames are not web links", async () => {
  const f = await fixture();
  try { for (const text of ["javascript:alert(1)", "file:///tmp/test", "data:text/plain,test", "https://", "example.test/docs"]) assert.deepEqual(await f.links(text), []); assert.deepEqual(f.calls, []); }
  finally { f.close(); }
});
test("ordinary plain opener failures are caught", async () => {
  const f = await fixture({ openerError: true });
  try { const links = await f.links(url); assert.equal(links.length, 1); await f.click(links[0]); assert.equal(f.calls.length, 1); assert.equal(f.errors.length, 1); }
  finally { f.close(); }
});
test("ordinary reattachment retains one plain-link provider and one terminal", async () => {
  const f = await fixture();
  try { f.reattach(); assert.equal(f.screen.opened, 1); assert.equal(f.screen.providers.length, 1); assert.equal((await f.links(url)).length, 1); }
  finally { f.close(); }
});
test("ordinary plain provider is released with the terminal", async () => {
  const f = await fixture(); f.close(); assert.equal(f.screen.disposed, 1); assert.equal(f.screen.providerDisposed, 1); assert.equal(f.screen.providers.length, 0);
});
test("ordinary terminal Unicode and stdin lifetime remain unchanged", async () => {
  const f = await fixture(); try { assert.equal(f.screen.unicode.activeVersion, "11"); f.screen.onInput?.("starting"); assert.deepEqual(f.writes, []); } finally { f.close(); }
});
