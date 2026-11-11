import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentType, ReactElement } from "react";

type Button = { children: unknown[]; props: { onClick(event: { stopPropagation(): void; preventDefault(): void }): void } };
type Renderer = { root: { findAllByType(type: string): Button[] }; update(element: ReactElement): void; unmount(): void };

const deps = createRequire(resolve("package.json"));
const React: typeof import("react") = deps("react");
const renderer = deps("react-test-renderer");
const act: (run: () => void) => void = renderer.act;
const create: (element: ReactElement) => Renderer = renderer.create;
const ts: typeof import("typescript") = deps("typescript");

type SelectionProps = {
  id: string;
  status: "running" | "exited";
  sessionId?: string;
  onAddToChat?: (text: string) => boolean;
};

function fixture({ sessionId: initialSessionId = "chat-A", accept = true, status = "running" }: {
  sessionId?: string;
  accept?: boolean;
  status?: SelectionProps["status"];
} = {}) {
  let sessionId: string | undefined = initialSessionId;
  let selection = "";
  let activeId = "term-A";
  let accepted = accept;
  const listeners = new Map<string, Set<() => void>>();
  const requests: { sessionId: string | undefined; text: string }[] = [];
  let clearSelectionCalls = 0;
  const terminalFor = (id: string) => ({
    getSelection: () => selection,
    onSelectionChange(callback: () => void) {
      const group = listeners.get(id) ?? new Set<() => void>();
      group.add(callback); listeners.set(id, group);
      return { dispose: () => group.delete(callback) };
    },
    clearSelection: () => { clearSelectionCalls++; },
  });
  const file = "src/features/terminal/TerminalPanel.tsx";
  const javascript = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module: { exports: { TerminalHost?: ComponentType<SelectionProps> } } = { exports: {} };
  const require = (name: string): unknown => {
    if (name === "react" || name === "react/jsx-runtime") return deps(name);
    if (name.endsWith(".css")) return {};
    if (name === "./session") return {
      attachTab: () => () => {},
      terminalOf: terminalFor,
      spawnErrorOf: () => undefined,
      retryTab: async () => {},
    };
    if (name === "./FindBar") return { FindBar: () => null, useTerminalFind: () => ({}) };
    if (name === "../../components/Icons") return { TerminalIcon: () => null };
    throw new Error(`Unexpected boundary: ${name}`);
  };
  runInNewContext(`(function(require,module,exports){${javascript}\n})`, { console, Date }, { filename: file })(require, module, module.exports);
  const Host = module.exports.TerminalHost;
  assert.ok(Host, "actual TerminalHost export exists");
  const props = (): SelectionProps => ({
    id: activeId, status, sessionId,
    onAddToChat: (text) => { requests.push({ sessionId, text }); return accepted; },
  });
  let view: ReturnType<typeof create>;
  act(() => { view = create(React.createElement(Host, props())); });
  return {
    requests,
    buttons: () => view.root.findAllByType("button").filter((button) => button.children.join("").includes("Add to chat")),
    emit(text: string, id = activeId) {
      selection = text;
      act(() => { for (const callback of listeners.get(id) ?? []) callback(); });
    },
    click() {
      const button = this.buttons()[0];
      assert.ok(button, "selected terminal exposes Add to chat");
      let stopped = false;
      act(() => button.props.onClick({ stopPropagation() { stopped = true; }, preventDefault() {} }));
      assert.equal(stopped, true, "action click does not refocus terminal through propagation");
    },
    target(chat: string | undefined) { sessionId = chat; act(() => view.update(React.createElement(Host, props()))); },
    switchTerminal(id: string) { activeId = id; act(() => view.update(React.createElement(Host, { ...props(), key: id }))); },
    accept(value: boolean) { accepted = value; },
    clearSelectionCalls: () => clearSelectionCalls,
    listeners: (id = activeId) => listeners.get(id)?.size ?? 0,
    close() { act(() => view.unmount()); },
  };
}

test("actual terminal host exposes selection action only for nonblank text and a target chat", () => {
  const f = fixture();
  try {
    assert.equal(f.buttons().length, 0);
    f.emit(" \t\n"); assert.equal(f.buttons().length, 0);
    f.emit("selected output"); assert.equal(f.buttons().length, 1);
    f.target(undefined); assert.equal(f.buttons().length, 0);
    f.target("chat-B"); assert.equal(f.buttons().length, 1);
    f.emit(""); assert.equal(f.buttons().length, 0);
  } finally { f.close(); }
});

test("selection request sanitizes ANSI/control bytes and trims without truncation", () => {
  const f = fixture();
  const long = "x".repeat(12000);
  try {
    f.emit(`  \u001b[31m${long}\u001b[0m\u0000\n\tsecond line  `);
    f.click();
    assert.deepEqual(f.requests, [{ sessionId: "chat-A", text: `${long}\n\tsecond line` }]);
  } finally { f.close(); }
});

test("accepted selection clears React action state without clearing xterm selection", () => {
  const f = fixture();
  try {
    f.emit("keep actual xterm selection"); f.click();
    assert.equal(f.buttons().length, 0);
    assert.equal(f.clearSelectionCalls(), 0);
    f.emit("next selection"); assert.equal(f.buttons().length, 1);
  } finally { f.close(); }
});

test("a rejected selection request retains the action for retry", () => {
  const f = fixture({ accept: false });
  try {
    f.emit("retry me"); f.click();
    assert.equal(f.buttons().length, 1);
    f.accept(true); f.click();
    assert.equal(f.buttons().length, 0);
    assert.equal(f.requests.length, 2);
    assert.equal(f.clearSelectionCalls(), 0);
  } finally { f.close(); }
});

test("selection action uses the current target chat instead of a stale callback", () => {
  const f = fixture();
  try {
    f.emit("selected in A"); f.target("chat-B"); f.click();
    assert.deepEqual(f.requests, [{ sessionId: "chat-B", text: "selected in A" }]);
  } finally { f.close(); }
});

test("terminal switch and unmount release selection subscriptions", () => {
  const f = fixture();
  try {
    assert.equal(f.listeners("term-A"), 1);
    f.emit("old selected text");
    f.switchTerminal("term-B");
    assert.equal(f.listeners("term-A"), 0);
    assert.equal(f.listeners("term-B"), 1);
    assert.equal(f.buttons().length, 0);
    f.emit("stale A selection", "term-A"); assert.equal(f.buttons().length, 0);
    f.emit("current B selection"); assert.equal(f.buttons().length, 1);
  } finally { f.close(); }
  assert.equal(f.listeners("term-B"), 0);
});

test("retained exited terminal output still offers the selection action", () => {
  const f = fixture({ status: "exited" });
  try { f.emit("historical output"); f.click(); assert.equal(f.requests[0]?.text, "historical output"); }
  finally { f.close(); }
});

test("control-only normalized selection is not emitted", () => {
  const f = fixture();
  try {
    f.emit("\u001b[31m\u001b[0m\u0000");
    if (f.buttons().length > 0) f.click();
    assert.deepEqual(f.requests, []);
    assert.equal(f.clearSelectionCalls(), 0);
  } finally { f.close(); }
});
