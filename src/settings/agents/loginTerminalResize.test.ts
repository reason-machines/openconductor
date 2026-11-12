import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PtyEvent } from "../../features/terminal/events.ts";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
type RendererNode = { children: unknown[]; props: { onClick: () => void } };
type Renderer = {
  root: { findByType: (type: string) => RendererNode; findAllByType: (type: string) => RendererNode[] };
  unmount: () => void;
};
const { act, create }: {
  act: {
    (callback: () => Promise<void>): Promise<void>;
    (callback: () => void): void;
  };
  create: (element: ReturnType<typeof React.createElement>, options: { createNodeMock: () => object }) => Renderer;
} = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const source = readFileSync(process.env.LOGIN_TERMINAL_RESIZE_SOURCE_FILE ?? new URL("./parts.tsx", import.meta.url), "utf8");
const terminalId = "login-resize-pty";

type Size = { cols: number; rows: number };

function fixture() {
  const transport: (Size & { id: string })[] = [];
  const screens: Screen[] = [];
  let emitEvent: ((event: PtyEvent) => void) | undefined;
  let observedResize: (() => void) | undefined;
  let desiredSize: Size = { cols: 80, rows: 24 };
  let fitCalls = 0;
  let refreshed = 0;

  class Screen {
    cols = 80;
    rows = 24;
    resize: ((size: Size) => void) | undefined;
    osc: ((data: string) => boolean) | undefined;
    parser = {
      registerOscHandler: (_id: number, handler: (data: string) => boolean) => {
        this.osc = handler;
        return { dispose: () => { this.osc = undefined; } };
      },
    };
    constructor() { screens.push(this); }
    loadAddon(addon: Fit) { addon.activate(this); }
    open() {}
    onData() { return { dispose() {} }; }
    onResize(handler: (size: Size) => void) {
      this.resize = handler;
      return { dispose: () => { this.resize = undefined; } };
    }
    write(_data: Uint8Array, done: () => void) { done(); }
    dispose() {}
  }
  class Fit {
    screen: Screen | undefined;
    activate(screen: Screen) { this.screen = screen; }
    fit() {
      fitCalls++;
      assert.ok(this.screen);
      this.screen.cols = desiredSize.cols;
      this.screen.rows = desiredSize.rows;
      this.screen.resize?.(desiredSize);
    }
  }
  const exports: Partial<Pick<typeof import("./parts"), "LoginButton">> = {};
  const javascript = ts.transpileModule(source, {
    fileName: "parts.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = (name: string): unknown => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name.endsWith(".css")) return {};
    if (name === "@xterm/xterm") return { Terminal: Screen };
    if (name === "@xterm/addon-fit") return { FitAddon: Fit };
    if (name === "../../features/terminal/pty") return {
      onPtyEvent: async (handler: (event: PtyEvent) => void) => {
        emitEvent = handler;
        return () => { emitEvent = undefined; };
      },
      ptySpawn: async () => terminalId,
      ptyResize: async (id: string, cols: number, rows: number) => { transport.push({ id, cols, rows }); },
      ptyWrite: async () => {},
      ptyAckBytes: async () => {},
      ptyKill: async () => {},
    };
    if (name === "./agentAuth") return {};
    if (name === "./api") return { homeDir: async () => "/fixture-home" };
    if (name === "./icons") return new Proxy({}, { get: () => () => null });
    throw new Error(`Unexpected login terminal dependency: ${name}`);
  };
  runInNewContext(javascript, {
    exports, require, crypto: { randomUUID: () => terminalId },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: { documentElement: {} },
    ResizeObserver: class {
      constructor(handler: () => void) { observedResize = handler; }
      observe() {}
      disconnect() { observedResize = undefined; }
    },
  });
  const LoginButton = exports.LoginButton;
  assert.ok(LoginButton);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(LoginButton, {
      command: "fixture-cli login", label: "fixture-cli login", onDone: () => { refreshed++; },
    }), { createNodeMock: () => ({}) });
  });
  return {
    transport,
    refreshed: () => refreshed,
    done: () => renderer.root.findAllByType("button").some((button) => button.children.includes("Done")),
    async start() {
      await act(async () => { renderer.root.findByType("button").props.onClick(); });
      assert.equal(screens.length, 1);
    },
    async emit(event: PtyEvent) {
      assert.ok(emitEvent);
      await act(async () => { emitEvent?.(event); });
    },
    async complete() {
      assert.ok(screens[0].osc);
      await act(async () => { screens[0].osc?.(`Conductor;CommandDone;${terminalId}`); });
    },
    async resize() {
      assert.ok(observedResize);
      desiredSize = { cols: 112, rows: 36 };
      const before = fitCalls;
      await act(async () => { observedResize?.(); });
      assert.equal(fitCalls, before + 1, "Local terminal fitting must remain active");
      assert.equal(screens[0].cols, 112, "Local terminal columns must still resize");
      assert.equal(screens[0].rows, 36, "Local terminal rows must still resize");
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const ownExit: PtyEvent = { kind: "exit", id: terminalId, exitCode: 0, signal: null };
const dispatched = (view: ReturnType<typeof fixture>) => view.transport.map(({ id, cols, rows }) => ({ id, cols, rows }));

for (const completed of [false, true]) {
  test(`${completed ? "completed then exited" : "exited"} login shells keep local fitting without dispatching resize`, async () => {
    const view = fixture();
    try {
      await view.start();
      if (completed) await view.complete();
      await view.emit(ownExit);
      assert.equal(view.done(), true, "The matching exit must settle before the resize");
      await view.resize();
      assert.deepEqual(dispatched(view), [], "A settled matching exit must suppress PTY resize transport");
      assert.equal(view.refreshed(), 0);
    } finally { await view.close(); }
  });
}

for (const state of ["running", "completed but live", "foreign exit"]) {
  test(`${state} login shells still fit and dispatch resize to their own PTY`, async () => {
    const view = fixture();
    try {
      await view.start();
      if (state === "completed but live") await view.complete();
      if (state === "foreign exit") await view.emit({ ...ownExit, id: "another-pty" });
      assert.equal(view.done(), state === "completed but live");
      await view.resize();
      assert.deepEqual(dispatched(view), [{ id: terminalId, cols: 112, rows: 36 }]);
      assert.equal(view.refreshed(), 0);
    } finally { await view.close(); }
  });
}
