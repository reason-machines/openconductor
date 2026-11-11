import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const checkout = resolve(process.env.OPENCONDUCTOR_CHECKOUT ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
const require = createRequire(resolve(checkout, "package.json"));
const React = require("react");
const Renderer = require("react-test-renderer");
const ts = require("typescript");
const fixture = JSON.parse(readFileSync(new URL("./transcriptFind.fixture.json", import.meta.url), "utf8"));
const bindings = new Map();

function useKeybindings(handlers) {
  React.useEffect(() => {
    for (const [name, callback] of Object.entries(handlers)) bindings.set(name, callback);
    return () => { for (const name of Object.keys(handlers)) bindings.delete(name); };
  });
}

const cache = new Map();
function sourceModule(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, URL, setTimeout, clearTimeout,
    require(name) {
      if (name.endsWith("KeybindingsProvider.tsx")) return { useKeybindings };
      if (name.endsWith(".css")) return {};
      if (!name.startsWith(".")) return require(name);
      let target = resolve(dirname(path), name);
      if (!extname(target)) target = [".ts", ".tsx", ".js"].map((suffix) => target + suffix).find(existsSync);
      assert.ok(target, `resolved production dependency ${name}`);
      return sourceModule(target);
    },
  }, { filename: path });
  return module.exports;
}

function productionTranscript() {
  const path = resolve(checkout, "src/features/chat/Transcript.tsx");
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = ["Transcript", "rowTurn", "groupTurns"].map((name) => {
    const node = ast.statements.find((statement) =>
      (ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
      (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => declaration.name.getText(ast) === name)));
    assert.ok(node, `${name} exists in actual production component`);
    return node.getText(ast);
  }).join("\n");
  const searchPath = resolve(checkout, "src/features/chat/TranscriptSearch.tsx");
  const search = existsSync(searchPath) ? sourceModule(searchPath) : {};
  const exports = {};
  const compiled = ts.transpileModule(selected, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(compiled.outputText, {
    exports, React,
    require(name) { assert.equal(name, "react/jsx-runtime"); return require(name); },
    useMemo: React.useMemo, useState: React.useState, useRef: React.useRef,
    useEffect: React.useEffect, useLayoutEffect: React.useLayoutEffect,
    useSyncExternalStore: React.useSyncExternalStore, useKeybindings,
    ...sourceModule(resolve(checkout, "src/features/chat/view.ts")),
    ...sourceModule(resolve(checkout, "src/features/chat/toolGroups.ts")),
    ...search,
    useBoolPref: () => false,
    turnDayClock: () => ({ subscribe: () => () => {}, getSnapshot: () => "2026-11-11T12:00:00Z" }),
    LinkMenuNotify: React.createContext(undefined),
    Row: () => React.createElement("div", { "data-unrelated-row-leaf": true }),
    TurnFooter: () => null,
  }, { filename: path });
  assert.equal(typeof exports.Transcript, "function");
  return (props) => React.createElement(exports.Transcript, { searchEnabled: true, ...props });
}

function text(node) {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}

function count(root, expected) {
  assert.ok(root.findAll((node) => node.type === "span" && text(node) === expected).length > 0, `actual find count is ${expected}`);
}

function command(name) {
  const callback = bindings.get(name);
  assert.equal(typeof callback, "function", `actual Transcript host binds ${name}`);
  Renderer.act(() => { callback(); });
}

test("actual Transcript host opens and navigates top-level text matches, then closes", () => {
  const Transcript = productionTranscript();
  let tree;
  Renderer.act(() => { tree = Renderer.create(React.createElement(Transcript, { transcript: fixture, now: () => "2026-11-11T12:00:00Z" })); });
  try {
    assert.equal(tree.root.findAllByProps({ placeholder: "Find in top-level messages" }).length, 0);
    command("chat.search");
    const input = tree.root.findByProps({ placeholder: "Find in top-level messages" });
    Renderer.act(() => { input.props.onChange({ target: { value: "needle" } }); });
    count(tree.root, "1 of 3");
    command("chat.searchNext");
    count(tree.root, "2 of 3");
    command("chat.searchPrevious");
    count(tree.root, "1 of 3");
    command("chat.searchPrevious");
    count(tree.root, "3 of 3");
    command("chat.searchNext");
    count(tree.root, "1 of 3");
    const capture = tree.root.findAll((node) => typeof node.props.onKeyDownCapture === "function").find((node) => text(node).includes("1 of 3"));
    assert.ok(capture, "real find bar captures Escape");
    Renderer.act(() => { capture.props.onKeyDownCapture({ key: "Escape", preventDefault() {}, stopPropagation() {} }); });
    assert.equal(tree.root.findAllByProps({ placeholder: "Find in top-level messages" }).length, 0);
  } finally {
    Renderer.act(() => { tree?.unmount(); });
    bindings.clear();
  }
});

function mount(transcript = fixture, props = {}) {
  const Transcript = productionTranscript();
  let tree;
  Renderer.act(() => { tree = Renderer.create(React.createElement(Transcript, { transcript, ...props })); });
  return {
    tree,
    update(transcript, next = props) { Renderer.act(() => tree.update(React.createElement(Transcript, { transcript, ...next }))); },
    input(value) {
      const input = tree.root.findByProps({ placeholder: "Find in top-level messages" });
      Renderer.act(() => input.props.onChange({ target: { value } }));
    },
    close() { Renderer.act(() => tree.unmount()); bindings.clear(); },
  };
}

test("blank and zero matches disable navigation; Enter and buttons wrap and close resets", () => {
  const f = mount();
  try {
    command("chat.search");
    f.input(" ");
    count(f.tree.root, "0 of 0");
    for (const label of ["Previous match", "Next match"]) assert.equal(f.tree.root.findByProps({ "aria-label": label }).props.disabled, true);
    f.input("absent");
    command("chat.searchNext");
    count(f.tree.root, "0 of 0");
    f.input("needle");
    const bar = f.tree.root.findByProps({ role: "search" });
    Renderer.act(() => bar.props.onKeyDownCapture({ key: "Enter", shiftKey: true, preventDefault() {}, stopPropagation() {} }));
    count(f.tree.root, "3 of 3");
    Renderer.act(() => f.tree.root.findByProps({ "aria-label": "Next match" }).props.onClick());
    count(f.tree.root, "1 of 3");
    Renderer.act(() => f.tree.root.findByProps({ "aria-label": "Close search" }).props.onClick());
    command("chat.search");
    assert.equal(f.tree.root.findByProps({ placeholder: "Find in top-level messages" }).props.value, "");
    count(f.tree.root, "0 of 0");
  } finally { f.close(); }
});

test("case-insensitive, nonoverlapping, literal query across newline-joined text blocks only", () => {
  const transcript = structuredClone(fixture);
  transcript.messages[0].blocks = [{ type: "text", text: "aaaa" }, { type: "thinking", text: "needle" }, { type: "text", text: "b" }];
  transcript.messages[1].blocks = [{ type: "text", text: "a+b a+b" }];
  const f = mount(transcript);
  try {
    command("chat.search");
    f.input("aa"); count(f.tree.root, "1 of 2");
    f.input("aa\nb"); count(f.tree.root, "1 of 1");
    f.input("a+b"); count(f.tree.root, "1 of 2");
    f.input(" a+b "); count(f.tree.root, "0 of 0");
    f.input("needle"); count(f.tree.root, "0 of 0");
  } finally { f.close(); }
});

test("session switching resets selection; streaming updates recompute and clamp results", () => {
  const f = mount();
  try {
    command("chat.search"); f.input("needle"); command("chat.searchPrevious"); count(f.tree.root, "3 of 3");
    const switched = structuredClone(fixture);
    switched.sessionId = "second";
    switched.messages = switched.messages.slice(0, 1).map((message) => ({ ...message, sessionId: "second" }));
    f.update(switched); count(f.tree.root, "1 of 2");
    const streamed = structuredClone(switched);
    streamed.messages[0].blocks = [{ type: "text", text: "needle needle needle needle" }];
    f.update(streamed); count(f.tree.root, "1 of 4");
    command("chat.searchPrevious"); count(f.tree.root, "4 of 4");
    f.update(switched); count(f.tree.root, "2 of 2");
  } finally { f.close(); }
});

test("inactive content does not bind chat find and unmount removes its registrations", () => {
  const f = mount(fixture, { searchEnabled: false });
  try {
    assert.equal(bindings.has("chat.search"), false);
    f.update(fixture, { searchEnabled: true });
    command("chat.search"); f.input("needle"); count(f.tree.root, "1 of 3");
    command("chat.scrollToMatch");
    f.update(fixture, { searchEnabled: false });
    assert.equal(bindings.has("chat.search"), false);
    assert.equal(bindings.has("chat.searchNext"), false);
    assert.equal(f.tree.root.findAllByProps({ placeholder: "Find in top-level messages" }).length, 0);
  } finally { f.close(); }
});
