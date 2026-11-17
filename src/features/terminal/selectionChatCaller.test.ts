import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";

const deps = createRequire(import.meta.url);
const ts: typeof import("typescript") = deps("typescript");
const workspacePath = "src/components/WorkspaceView.tsx";
const stripPath = "src/components/PanelStrip.tsx";
const javascript = (text: string) => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function findNode(path: string, predicate: (node: import("typescript").Node, source: import("typescript").SourceFile) => boolean) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result: import("typescript").Node | undefined;
  const visit = (node: import("typescript").Node) => {
    if (predicate(node, source)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(result, `actual ${path} source region exists`);
  return result.getText(source);
}

function callbackFixture() {
  const callback = findNode(workspacePath, (node, source) => ts.isVariableDeclaration(node) && node.name.getText(source) === "addTerminalSelection");
  const tab = findNode(workspacePath, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "tabOfChat");
  const attachments: { name: string; text: string }[] = [];
  const shownChat = { current: "chat-A" };
  const displayedWorkspace = { current: "workspace-A" };
  const frames: (() => void)[] = [];
  const tabs: string[] = [];
  let focusCount = 0;
  const chatBridge: { current: { attach(attachment: { name: string; text: string }): void; focusAtEnd(): void } | null } = {
    current: { attach: (attachment) => attachments.push(attachment), focusAtEnd: () => { focusCount++; } },
  };
  const emit: (sessionId: string, text: string) => boolean = runInNewContext(javascript(`${tab}\nconst ${callback};\naddTerminalSelection;`), {
    useCallback: (fn: unknown) => fn, workspace: { id: "workspace-A" }, primaryId: "chat-A",
    shownChat, displayedWorkspace, chatBridge, setMainTab: (tab: string) => tabs.push(tab),
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; }, Date,
  });
  return { emit, attachments, tabs, shownChat, displayedWorkspace, chatBridge,
    focusCount: () => focusCount,
    frame() { for (const callback of frames.splice(0)) callback(); },
  };
}

function terminalElement(path: string, tag: "TerminalHost" | "PanelStrip", globals: Record<string, unknown>) {
  const expression = findNode(path, (node, source) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === tag);
  const exports: { element?: ReactElement<Record<string, unknown>> } = {};
  runInNewContext(javascript(`export const element = ${expression};`), {
    exports,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return deps(name); },
    ...globals,
  });
  assert.ok(exports.element);
  return exports.element.props;
}

for (const [path, tag] of [[workspacePath, "TerminalHost"], [workspacePath, "PanelStrip"], [stripPath, "TerminalHost"]] as const) {
  test(`actual ${path} ${tag} forwards target-chat selection requests`, () => {
    const requests: string[] = [];
    const emit = (sessionId: string, text: string) => { requests.push(`${sessionId}:${text}`); return true; };
    const activeTerm = { id: "term", status: "running" };
    const props = terminalElement(path, tag, {
      TerminalHost: () => null, PanelStrip: () => null, centerTerminal: activeTerm, activeTerm,
      selectedChat: "chat-B", chatSessionId: "chat-B", addTerminalSelection: emit,
      onAddTerminalSelection: (text: string) => emit("chat-B", text),
      repo: { path: "/repo" }, workspace: { id: "workspace-A", status: "idle" },
      stripOpen: true, stripView: "terminal", setStripOpen() {}, setStripView() {}, askSetupAgent() {}, openPreview() {},
    });
    assert.equal(props[tag === "PanelStrip" ? "chatSessionId" : "sessionId"], "chat-B");
    const callback = props[tag === "PanelStrip" ? "onAddTerminalSelection" : "onAddToChat"];
    assert.equal(typeof callback, "function", "actual caller supplies the selection action");
    assert.ok(typeof callback === "function");
    assert.equal(callback("selected output"), true);
    assert.deepEqual(requests, ["chat-B:selected output"]);
  });
}

test("actual selection caller accepts attachment into the target chat and focuses after revealing it", () => {
  const f = callbackFixture();
  assert.equal(f.emit("chat-A", "selected output"), true);
  assert.equal(f.attachments.length, 1);
  assert.match(f.attachments[0].name, /^terminal-selection-.+\.txt$/);
  assert.equal(f.attachments[0].text, "selected output");
  assert.deepEqual(f.tabs, ["chat"]); assert.equal(f.focusCount(), 0);
  f.frame(); assert.equal(f.focusCount(), 1);
});

test("actual selection caller retains a review-chat target instead of switching to primary", () => {
  const f = callbackFixture();
  f.shownChat.current = "review-B";
  assert.equal(f.emit("review-B", "review output"), true);
  assert.deepEqual(f.tabs, ["review-B"]);
  f.frame(); assert.equal(f.focusCount(), 1);
});

test("stale session, stale workspace and missing composer cannot accept selection", () => {
  for (const stale of ["session", "workspace", "bridge"] as const) {
    const f = callbackFixture();
    if (stale === "session") f.shownChat.current = "chat-B";
    if (stale === "workspace") f.displayedWorkspace.current = "workspace-B";
    if (stale === "bridge") f.chatBridge.current = null;
    assert.equal(f.emit("chat-A", "must not leak"), false);
    assert.deepEqual(f.attachments, []); assert.deepEqual(f.tabs, []);
    f.frame(); assert.equal(f.focusCount(), 0);
  }
});

test("an accepted request cannot focus a later session or workspace", () => {
  for (const stale of ["session", "workspace"] as const) {
    const f = callbackFixture();
    assert.equal(f.emit("chat-A", "accepted only into A"), true);
    if (stale === "session") f.shownChat.current = "chat-B";
    else f.displayedWorkspace.current = "workspace-B";
    f.frame(); assert.equal(f.focusCount(), 0);
    assert.equal(f.attachments.length, 1);
  }
});
