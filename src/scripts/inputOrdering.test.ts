import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import type { ScriptOutput } from "../components/ScriptOutput";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Renderer = { unmount: () => void; update: (element: ReactElement) => void };
const { create, act }: {
  create: (element: ReactElement, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");

async function fixture(baseline = false) {
  const sent: string[] = [];
  let release: (() => void) | undefined;
  const input = async (data: string) => {
    sent.push(data);
    if (data === "a") await new Promise<void>((resolve) => { release = resolve; });
  };
  const screens: Screen[] = [];
  class Screen {
    options: Record<string, unknown>;
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    listeners = new Set<(data: string) => void>();
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() {}
    write() {}
    focus() {}
    getSelection() { return ""; }
    onData(callback: (data: string) => void) { this.listeners.add(callback); return { dispose: () => this.listeners.delete(callback) }; }
    dispose() {}
    type(data: string) { if (this.options.disableStdin !== true) for (const callback of this.listeners) callback(data); }
  }
  const inert = () => null;
  const font = { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: () => () => {}, TERMINAL_LINE_HEIGHT: 1.2 };
  const boundary: Record<string, unknown> = {
    "react": React, "react/jsx-runtime": deps("react/jsx-runtime"),
    "@xterm/xterm": { Terminal: Screen }, "@xterm/addon-fit": { FitAddon: class { fit() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "../features/terminal/font": font,
    "../features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: () => () => {} },
    "../features/terminal/FindBar": { FindBar: inert, useBufferFind: () => ({ open: inert }) },
    "../keybindings/KeybindingsProvider": { useKeybindings: inert },
    "../keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
  };
  class Observer { observe() {} disconnect() {} }
  function load(path: string): Record<string, unknown> & { ScriptOutput?: typeof ScriptOutput } {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name: string): unknown => {
      if (name.endsWith(".css")) return {};
      if (name === "../scripts/output") return load("src/scripts/output.ts");
      assert.ok(Object.hasOwn(boundary, name), `unexpected dependency ${name}`);
      return boundary[name];
    };
    runInNewContext(`(function(require,module,exports){${code}\n})`, {
      console, document: { documentElement: {}, activeElement: null }, getComputedStyle: () => ({ getPropertyValue: () => "" }),
      ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const path = baseline ? "evidence/scripts/running-input-1f/current/src/components/ScriptOutput.tsx" : "src/components/ScriptOutput.tsx";
  const { ScriptOutput: Component } = load(path);
  assert.ok(Component);
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
  let renderer: Renderer;
  await act(async () => { renderer = create(React.createElement(Component, { output: "output\n", onInput: input }), { createNodeMock: () => host }); });
  return {
    sent,
    type: (...inputs: string[]) => act(async () => { for (const data of inputs) screens[0].type(data); }),
    release: () => act(async () => { assert.ok(release); release(); }),
    disable: () => act(async () => { renderer.update(React.createElement(Component, { output: "output\n" })); }),
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("frozen shipped-project baseline cannot send script input", async (t) => {
  const f = await fixture(true);
  t.after(f.close);
  await f.type("a", "b");
  assert.deepEqual(f.sent, [], "baseline replay observes the missing subscription, not a loader failure");
});

test("the input queue preserves event order while the first write is pending", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.type("a", "b", "c");
  assert.deepEqual(f.sent, ["a"], "later events wait for the first backend write");
  await f.release();
  assert.deepEqual(f.sent, ["a", "b", "c"]);
});

test("stopping input cancels bytes queued behind an in-flight write", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.type("a", "b");
  await f.disable();
  await f.release();
  await f.type("c");
  assert.deepEqual(f.sent, ["a"], "queued input must not survive stop or rerun cleanup");
});

test("unmount cancels queued bytes after the current write completes", async () => {
  const f = await fixture();
  await f.type("a", "b");
  await f.close();
  await f.release();
  assert.deepEqual(f.sent, ["a"]);
});
