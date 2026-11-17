import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PtyEvent } from "../../../src/features/terminal/events.ts";

const dependencies = createRequire(new URL("../../../package.json", import.meta.url));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = readFileSync(process.env.LOGIN_TERMINAL_SOURCE_FILE ?? new URL("../../../src/settings/agents/parts.tsx", import.meta.url), "utf8");
const markerId = "login-pty";

function fixture({ rejectSpawn = false, deferSpawn = false, deferListener = false, completeDuringSpawn = false } = {}) {
  const screens: Screen[] = [];
  const spawns: { cwd: string; cols: number; rows: number; initialCommand: string }[] = [];
  const writes: { id: string; data: string }[] = [];
  const killed: string[] = [];
  let event: ((event: PtyEvent) => void) | undefined;
  let resolveSpawn: ((id: string) => void) | undefined;
  let resolveListener: ((unlisten: () => void) => void) | undefined;
  let refreshed = 0;
  let unlistened = 0;
  const noop = () => {};
  class Screen {
    cols = 80;
    rows = 24;
    input: (data: string) => void = noop;
    output: (string | Uint8Array)[] = [];
    disposed = false;
    osc: ((data: string) => boolean) | undefined;
    parser = {
      registerOscHandler: (id: number, handler: (data: string) => boolean) => {
        assert.equal(id, 633);
        this.osc = handler;
        return { dispose: () => { this.osc = undefined; } };
      },
    };
    constructor() { screens.push(this); }
    loadAddon() {}
    open() {}
    onData(handler: (data: string) => void) { this.input = handler; return { dispose: noop }; }
    onResize() { return { dispose: noop }; }
    write(data: string | Uint8Array) { this.output.push(data); }
    dispose() { this.disposed = true; }
  }
  const exports: Partial<Pick<typeof import("../../../src/settings/agents/parts"), "LoginButton">> = {};
  const javascript = ts.transpileModule(source, {
    fileName: "parts.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = (name: string): unknown => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name.endsWith(".css")) return {};
    if (name === "@xterm/xterm") return { Terminal: Screen };
    if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
    if (name === "../../features/terminal/pty") return {
      onPtyEvent: async (handler: (event: PtyEvent) => void) => {
        event = handler;
        if (deferListener) return new Promise<() => void>((resolve) => { resolveListener = resolve; });
        return () => { unlistened++; };
      },
      ptySpawn: async (args: (typeof spawns)[number]) => {
        spawns.push(args);
        if (rejectSpawn) throw new Error("fixture spawn failed");
        if (completeDuringSpawn) screens[0].osc?.(`Conductor;CommandDone;${markerId}`);
        if (deferSpawn) return new Promise<string>((resolve) => { resolveSpawn = resolve; });
        return "login-pty";
      },
      ptyWrite: async (id: string, data: string) => { writes.push({ id, data }); },
      ptyKill: async (id: string) => { killed.push(id); },
      ptyResize: async () => {},
    };
    if (name === "./agentAuth") return {};
    if (name === "./api") return { homeDir: async () => "/fixture-home" };
    if (name === "./icons") return new Proxy({}, { get: () => () => null });
    throw new Error(`Unexpected parts dependency: ${name}`);
  };
  runInNewContext(javascript, {
    exports, require, crypto: { randomUUID: () => markerId },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: { documentElement: {} },
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  assert.ok(exports.LoginButton);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.LoginButton, {
      command: "fixture-cli login", label: "fixture-cli login", onDone: () => { refreshed++; },
    }), { createNodeMock: () => ({}) });
  });
  const text = () => {
    const walk = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(walk).join("");
      if (value && typeof value === "object" && "children" in value) return walk(value.children);
      return "";
    };
    return walk(renderer.toJSON());
  };
  const buttons = () => renderer.root.findAllByType("button");
  const button = (label: string) => buttons().find((node: { children: unknown[]; props: { "aria-label"?: string } }) => node.props["aria-label"] === label || node.children.filter((child) => typeof child === "string").join("") === label);
  return {
    screens, spawns, writes, killed, text,
    refreshed: () => refreshed,
    unlistened: () => unlistened,
    done: () => button("Done"),
    async start() { await act(async () => { button("Run fixture-cli login").props.onClick(); }); },
    async finishSpawn() { await act(async () => { assert.ok(resolveSpawn); resolveSpawn("login-pty"); }); },
    async activateListener() { await act(async () => { assert.ok(resolveListener); resolveListener(() => { unlistened++; }); }); },
    async emit(value: PtyEvent) { await act(async () => { assert.ok(event); event(value); }); },
    async marker(value = `Conductor;CommandDone;${markerId}`) { await act(async () => { screens[0].osc?.(value); }); },
    async input(data: string) { await act(async () => { screens[0].input(data); }); },
    async click(label: string) { await act(async () => { const target = button(label); assert.ok(target, `Missing ${label} button`); target.props.onClick(); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("login bootstrap keeps the shell alive and marks command completion", async () => {
  const view = fixture();
  try {
    await view.start();
    assert.equal(view.spawns.length, 1);
    assert.equal(view.spawns[0].cwd, "/fixture-home");
    assert.ok(!view.spawns[0].initialCommand.includes("; exit"), "Login must not force the interactive shell to exit");
    assert.ok(view.spawns[0].initialCommand.includes(`Conductor;CommandDone;${markerId}`), "Bootstrap must emit its own completion marker");
    assert.equal(view.done(), undefined);
    assert.match(view.text(), /Running fixture-cli login/);
  } finally { await view.close(); }
});

test("command completion enables Done while shell input remains usable", async () => {
  const view = fixture();
  try {
    await view.start();
    await view.marker();
    assert.ok(view.done(), "Command completion must enable Done without a PTY exit");
    assert.match(view.text(), /Finished fixture-cli login\. You can keep using this shell or click done\./);
    assert.deepEqual(view.killed, []);
    assert.equal(view.refreshed(), 0);
    await view.input("echo still-open\r");
    assert.deepEqual(view.writes, [{ id: "login-pty", data: "echo still-open\r" }]);
    await view.click("Done");
    assert.equal(view.refreshed(), 1);
    assert.deepEqual(view.killed, ["login-pty"]);
    assert.equal(view.unlistened(), 1);
    assert.ok(view.screens[0].disposed);
  } finally { await view.close(); }
});

test("shell exit before completion reports the premature exit", async () => {
  const view = fixture();
  try {
    await view.start();
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 1, signal: null });
    assert.match(view.text(), /Shell exited before the command completed\./, "PTY exit alone must not claim the command completed");
    assert.ok(view.done());
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("other completion markers cannot complete this login", async () => {
  const view = fixture();
  try {
    await view.start();
    await view.marker("Conductor;CommandDone;another-terminal");
    await view.marker(`Other;CommandDone;${markerId}`);
    assert.equal(view.done(), undefined);
    assert.match(view.text(), /Running fixture-cli login/);
  } finally { await view.close(); }
});

test("late ready and shell exit cannot erase observed command completion", async () => {
  const view = fixture();
  try {
    await view.start();
    await view.marker();
    await view.emit({ kind: "ready", id: "login-pty", pid: 123 });
    await view.emit({ kind: "exit", id: "login-pty", exitCode: 0, signal: null });
    assert.match(view.text(), /Finished fixture-cli login\./);
    assert.ok(view.done());
  } finally { await view.close(); }
});

test("Close dismisses the terminal without refreshing authentication", async () => {
  const view = fixture();
  try {
    await view.start();
    await view.click("Close terminal");
    assert.equal(view.refreshed(), 0);
    assert.deepEqual(view.killed, ["login-pty"]);
    assert.equal(view.screens[0].osc, undefined);
    assert.equal(view.unlistened(), 1);
  } finally { await view.close(); }
});

test("spawn failure stays distinct from command completion", async () => {
  const view = fixture({ rejectSpawn: true });
  try {
    await view.start();
    assert.match(view.text(), /fixture spawn failed/);
    assert.equal(view.done(), undefined);
    assert.equal(view.refreshed(), 0);
  } finally { await view.close(); }
});

test("login waits for terminal observation before spawning", async () => {
  const view = fixture({ deferListener: true });
  try {
    await view.start();
    assert.equal(view.spawns.length, 0, "Login must register the PTY listener before spawning");
    await view.activateListener();
    assert.equal(view.spawns.length, 1);
  } finally { await view.close(); }
});

test("spawn resolution cannot erase a fast command completion", async () => {
  const view = fixture({ completeDuringSpawn: true });
  try {
    await view.start();
    assert.match(view.text(), /Finished fixture-cli login\./, "Spawn resolution must preserve an observed command completion");
    assert.ok(view.done());
  } finally { await view.close(); }
});

test("unmount during spawn kills the late PTY without refreshing authentication", async () => {
  const view = fixture({ deferSpawn: true });
  await view.start();
  await view.close();
  await view.finishSpawn();
  assert.deepEqual(view.killed, ["login-pty"]);
  assert.equal(view.refreshed(), 0);
  assert.ok(view.screens[0].disposed);
});
