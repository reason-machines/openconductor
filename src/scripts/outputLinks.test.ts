import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import type { ITerminalOptions } from "@xterm/xterm";
import type { ScriptOutput } from "../components/ScriptOutput";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Renderer = { update: (element: ReactElement) => void; unmount: () => void };
const { create, act }: {
  create: (element: ReactElement, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Invocation = { command: string; args: Record<string, unknown> };
type Exports = Record<string, unknown> & { ScriptOutput?: typeof ScriptOutput };

async function fixture(options: { confirmError?: string; openerError?: string } = {}) {
  const invocations: Invocation[] = [];
  const errors: unknown[][] = [];
  const screens: Screen[] = [];
  let answer: ((value: string) => void) | undefined;
  let fontOff = 0;
  let scrollbackOff = 0;
  class Screen {
    writes: string[] = [];
    disposed = 0;
    rows = 24;
    unicode = { activeVersion: "6" };
    options: ITerminalOptions;
    constructor(options: ITerminalOptions) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() {}
    write(text: string) { this.writes.push(text); }
    dispose() { this.disposed++; }
    focus() {}
  }
  const inert = () => {};
  class Observer { observe() {} disconnect() {} }
  const host = { clientWidth: 800, clientHeight: 400, contains: () => false };
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
    "src/state/createProject": { STEP: {}, targetPath: inert },
    "src/settings/appPrefs": { getAppPrefs: inert, loadAppPrefs: inert, setAppPref: inert },
  };
  const sourceFiles: Record<string, string> = {
    "src/components/ScriptOutput": "src/components/ScriptOutput.tsx",
    "src/scripts/output": "src/scripts/output.ts",
    "src/backend": "src/backend.ts",
    "@tauri-apps/plugin-dialog": "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js",
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(file: string): Exports {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    const path = sourceFiles[file];
    assert.ok(path, `Unexpected production dependency: ${file}`);
    const module: { exports: Exports } = { exports: {} };
    modules.set(file, module);
    const output = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name === "@xterm/xterm") return { Terminal: Screen };
      if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
      if (name === "@xterm/addon-unicode11") return { Unicode11Addon: class {} };
      if (name === "@tauri-apps/api/core") return { invoke, isTauri: () => true, Channel: class {} };
      if (name === "@tauri-apps/plugin-dialog") return load(name);
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected package: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console: { error: (...values: unknown[]) => { errors.push(values); } }, URL,
      document: { documentElement: {}, activeElement: null },
      getComputedStyle: () => ({ getPropertyValue: () => "" }), ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptOutput: Component } = load("src/components/ScriptOutput");
  assert.ok(Component);
  let renderer: Renderer;
  await act(async () => {
    renderer = create(React.createElement(Component, { output: "first\n" }), { createNodeMock: () => host });
  });
  assert.equal(screens.length, 1, "one output terminal mounted by the production component");
  return {
    invocations, errors, screens,
    async click(url: string, metaKey = true, ctrlKey = false) {
      const handler = screens[0].options.linkHandler;
      assert.ok(handler, "production ScriptOutput configures encoded-link activation");
      const event = { metaKey, ctrlKey } as MouseEvent;
      await act(async () => { handler.activate(event, url, { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } }); });
    },
    async answer(value: string) {
      assert.ok(answer, "the real dialog bridge is awaiting the native result");
      await act(async () => { answer?.(value); });
    },
    update: (output: string) => act(async () => { renderer.update(React.createElement(Component, { output })); }),
    close: () => act(async () => { renderer.unmount(); }),
    subscriptions: () => ({ fontOff, scrollbackOff }),
  };
}

const httpsUrl = "https://example.test/docs?from=setup#result";
const openerCalls = (calls: Invocation[]) => calls.filter((call) => call.command === "plugin:opener|open_url");

test("Command-click warns through the real dialog bridge before native opening", async () => {
  const f = await fixture();
  try {
    await f.click(httpsUrl);
    assert.deepEqual(f.invocations, [{ command: "plugin:dialog|message", args: {
      message: `Open this terminal link?\n\n${httpsUrl}`, title: "Open link?", kind: "warning",
      buttons: { OkCancelCustom: ["Open", "Cancel"] },
    } }]);
    assert.equal(openerCalls(f.invocations).length, 0);
    await f.answer("Open");
    assert.deepEqual(openerCalls(f.invocations), [{ command: "plugin:opener|open_url", args: { url: httpsUrl } }]);
  } finally { await f.close(); }
});

test("cancelling the warning never opens the encoded target", async () => {
  const f = await fixture();
  try {
    await f.click(httpsUrl);
    await f.answer("Cancel");
    assert.equal(openerCalls(f.invocations).length, 0);
  } finally { await f.close(); }
});

test("unmodified and Control-only clicks do not prompt or open", async () => {
  const f = await fixture();
  try {
    await f.click(httpsUrl, false);
    await f.click(httpsUrl, false, true);
    assert.deepEqual(f.invocations, []);
  } finally { await f.close(); }
});

test("Command-click preserves an HTTP localhost target for the native opener", async () => {
  const f = await fixture();
  const url = "http://localhost:55000/path?one=two#result";
  try {
    await f.click(url);
    await f.answer("Open");
    assert.deepEqual(openerCalls(f.invocations), [{ command: "plugin:opener|open_url", args: { url } }]);
  } finally { await f.close(); }
});

test("non-web and invalid encoded targets never reach dialog or opener", async () => {
  const f = await fixture();
  try {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "vscode://file/tmp/test", "not a URL"]) {
      await f.click(url);
    }
    assert.deepEqual(f.invocations, []);
    assert.equal(f.screens[0].options.linkHandler?.allowNonHttpProtocols, false);
  } finally { await f.close(); }
});

test("a rejected native warning does not open or escape as an unhandled rejection", async () => {
  const f = await fixture({ confirmError: "fixture warning unavailable" });
  try {
    await f.click(httpsUrl);
    assert.equal(openerCalls(f.invocations).length, 0);
    assert.equal(f.errors.length, 1);
  } finally { await f.close(); }
});

test("a rejected native opener is handled after the confirmed target", async () => {
  const f = await fixture({ openerError: "fixture opener unavailable" });
  try {
    await f.click(httpsUrl);
    await f.answer("Open");
    assert.equal(openerCalls(f.invocations).length, 1);
    assert.equal(f.errors.length, 1);
  } finally { await f.close(); }
});

test("output updates still append through the production outputUpdate module", async () => {
  const f = await fixture();
  try {
    await f.update("first\nsecond\n");
    assert.deepEqual(f.screens[0].writes, ["first\n", "second\n"]);
  } finally { await f.close(); }
});

test("rerun output replaces the old transcript without remounting the terminal", async () => {
  const f = await fixture();
  try {
    await f.update("rerun\n");
    assert.equal(f.screens.length, 1);
    assert.deepEqual(f.screens[0].writes, ["first\n", "\x1bcrerun\n"]);
  } finally { await f.close(); }
});

test("unmount still disposes the terminal and its subscriptions once", async () => {
  const f = await fixture();
  await f.close();
  assert.equal(f.screens[0].disposed, 1);
  assert.deepEqual(f.subscriptions(), { fontOff: 1, scrollbackOff: 1 });
  assert.deepEqual(f.invocations, []);
});
