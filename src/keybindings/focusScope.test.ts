import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const ts: typeof import("typescript") = require("typescript");

class ListenerTarget {
  listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(type: string, callback: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(callback);
  }
  removeEventListener(type: string, callback: (event: unknown) => void) {
    this.listeners.get(type)?.delete(callback);
  }
}

function workspaceChatHost(KeybindingScope: unknown, ChatPanel: unknown) {
  const path = fileURLToPath(new URL("../components/WorkspaceView.tsx", import.meta.url));
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hosts: string[] = [];
  const visit = (node: import("typescript").Node) => {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute: import("typescript").JsxAttributeLike) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "className" &&
      attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "ws-chat-host")) {
      hosts.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(hosts.length, 1, "run the actual WorkspaceView chat host JSX, not a copied wrapper");
  const compiled = ts.transpileModule(`function ChatHost({centerTerminal, showBrowser = false}) { return (${hosts[0]}); } module.exports = ChatHost;`, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    KeybindingScope, ChatPanel,
    activeReview: undefined, primaryId: "workspace", workspace: { id: "workspace", name: "Workspace" }, repo: {},
    dispatch: () => {}, notify: undefined, chatBridge: {}, setAgentWorking: () => {}, diff: {},
    prBase: undefined, hasNextUnread: undefined, selectedChat: "workspace", onNextUnread: undefined,
    reviews: { tabs: [], fork: () => {} }, showFile: false, showDiff: false, showPr: false,
  })(createRequire(path), module, module.exports);
  return module.exports;
}

function fixture(actualWorkspaceHost = false) {
  const window = new ListenerTarget();
  const document = Object.assign(new ListenerTarget(), {
    querySelectorAll: () => [], querySelector: () => null,
  });
  const path = fileURLToPath(new URL("./KeybindingsProvider.tsx", import.meta.url));
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(`(function(require,module,exports){${compiled}\n})`, { window, document })(
    createRequire(path), module, module.exports,
  );
  const { KeybindingsProvider, KeybindingScope, useKeybindings } = module.exports as {
    KeybindingsProvider: (props: { children: unknown }) => unknown;
    KeybindingScope: (props: { focused: boolean; children: unknown }) => unknown;
    useKeybindings: (handlers: Record<string, () => void>) => void;
  };
  const ran: string[] = [];
  let mounts = 0;
  function Chat() {
    const [draft] = React.useState("retained draft");
    React.useEffect(() => { mounts++; }, []);
    useKeybindings({
      "chat.cancel": () => { ran.push("cancel"); },
      "chat.addAttachment": () => { ran.push("attach"); },
    });
    return React.createElement("span", null, draft);
  }
  function Shell() {
    useKeybindings({ "view.toggleLeftSidebar": () => { ran.push("sidebar"); } });
    return null;
  }
  const ChatHost = actualWorkspaceHost ? workspaceChatHost(KeybindingScope, Chat) : undefined;
  const tree = (focused: boolean, nested = false, browserPreview = false) => React.createElement(KeybindingsProvider, null,
    React.createElement(Shell),
    ChatHost ? React.createElement(ChatHost, { centerTerminal: focused || browserPreview ? undefined : { id: "terminal" }, showBrowser: browserPreview })
      : React.createElement(KeybindingScope, { focused }, nested
        ? React.createElement(KeybindingScope, { focused: true }, React.createElement(Chat))
        : React.createElement(Chat)),
  );
  let root: { update(tree: unknown): void; unmount(): void; toJSON(): unknown };
  const render = (focused: boolean, nested = false, browserPreview = false) => act(() => {
    if (root) root.update(tree(focused, nested, browserPreview));
    else root = create(tree(focused, nested, browserPreview));
  });
  const key = (value: string, shiftKey = false) => {
    let stopped = false;
    const target = { tagName: "TEXTAREA", closest: () => ({}) };
    const event = {
      key: value, code: "", metaKey: true, ctrlKey: false, altKey: false, shiftKey, repeat: false,
      target, defaultPrevented: false, composedPath: () => [target],
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { stopped = true; },
    };
    act(() => {
      for (const listener of window.listeners.get("keydown") ?? []) {
        if (stopped) break;
        listener(event);
      }
    });
  };
  return { render, key, ran, mounts: () => mounts, content: () => root.toJSON(), dispose: () => act(() => root.unmount()) };
}

test("a mounted chat stops handling terminal keys while hidden and resumes without losing its draft", () => {
  const f = fixture();
  try {
    f.render(true);
    f.key("Backspace", true);
    f.key("u");
    assert.deepEqual(f.ran, ["cancel", "attach"]);
    f.render(false);
    f.key("Backspace", true);
    f.key("u");
    assert.deepEqual(f.ran, ["cancel", "attach"]);
    f.key("b");
    assert.deepEqual(f.ran, ["cancel", "attach", "sidebar"]);
    f.render(true);
    f.key("u");
    assert.deepEqual(f.ran, ["cancel", "attach", "sidebar", "attach"]);
    assert.equal(f.mounts(), 1);
    assert.deepEqual(f.content(), { type: "span", props: {}, children: ["retained draft"] });
  } finally { f.dispose(); }
});

for (const hiddenBy of ["center terminal", "Browser preview"] as const) {
  test(`WorkspaceView's actual retained chat host suppresses shortcuts behind a ${hiddenBy}`, () => {
    const f = fixture(true);
    try {
      f.render(true);
      f.key("Backspace", true);
      f.key("u");
      assert.deepEqual(f.ran, ["cancel", "attach"]);
      f.render(false, false, hiddenBy === "Browser preview");
      f.key("Backspace", true);
      f.key("u");
      assert.deepEqual(f.ran, ["cancel", "attach"], `hidden WorkspaceView chat must not handle ${hiddenBy} keys`);
      assert.equal((f.content() as { props: { hidden: boolean } }).props.hidden, true);
      f.key("b");
      assert.deepEqual(f.ran, ["cancel", "attach", "sidebar"]);
      f.render(true);
      f.key("u");
      assert.deepEqual(f.ran, ["cancel", "attach", "sidebar", "attach"]);
      assert.equal(f.mounts(), 1, "switching center tabs must retain the draft's mounted chat");
      assert.deepEqual(f.content(), {
        type: "div", props: { className: "ws-chat-host", hidden: false },
        children: [{ type: "span", props: {}, children: ["retained draft"] }],
      });
    } finally { f.dispose(); }
  });
}

test("a nested focused scope cannot reactivate a hidden parent chat", () => {
  const f = fixture();
  try {
    f.render(false, true);
    f.key("Backspace", true);
    f.key("u");
    assert.deepEqual(f.ran, []);
    f.render(true, true);
    f.key("u");
    assert.deepEqual(f.ran, ["attach"]);
  } finally { f.dispose(); }
});
