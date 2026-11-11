import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, extname } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const deps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, "package.json"));
const { JSDOM } = deps("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/", pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "NodeFilter", "MutationObserver"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act, Simulate } = require("react-dom/test-utils");
const ts = require("typescript");
const checkout = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const fixture = JSON.parse(readFileSync(new URL("./transcriptFind.fixture.json", import.meta.url), "utf8"));
const cache = new Map();
const scrolls = [];
dom.window.HTMLElement.prototype.scrollIntoView = function (options) { scrolls.push({ element: this, options }); };
const passthrough = ({ children }) => children;
const empty = () => null;
const leaves = {
  "Tooltip.tsx": { Tooltip: passthrough },
  "ChatSignInCard.tsx": { ChatSignInCard: empty },
  "ContextMenu": { DropdownMenu: passthrough, MenuItem: passthrough },
  "menuIcons": new Proxy({}, { get: () => empty }),
  "LinkMenu.tsx": { LinkMenuNotify: React.createContext(undefined), LinkWithMenu: passthrough },
  "markdown.ts": { Markdown: ({ text, className }) => React.createElement("div", { className }, text) },
  "ToolRows.tsx": { Lucide: empty, ToolIcon: empty, opensByDefault: () => false, ConductorToolRow: () => React.createElement("div", null, "needle from tool") },
  "TurnDetails.tsx": { TurnDetails: empty },
  "backend.ts": { openUrl() { throw new Error("No external actions in this fixture"); } },
  "useBoolPref.ts": { useBoolPref: () => false },
  "SentUserContent.tsx": { SentUserContent: () => React.createElement("span", null, "structured prompt") },
  "UserText.tsx": { UserText: ({ text }) => React.createElement("span", null, text) },
};

function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, URL, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    require(name) {
      if (name.endsWith(".css")) return {};
      for (const [suffix, value] of Object.entries(leaves)) if (name.endsWith("/" + suffix)) return value;
      if (!name.startsWith(".")) return require(name);
      let target = resolve(dirname(path), name);
      if (!extname(target)) target = [".ts", ".tsx", ".js"].map((suffix) => target + suffix).find(existsSync);
      assert.ok(target, `production import ${name} resolves`);
      return load(target);
    },
  }, { filename: path });
  return module.exports;
}
const { Transcript } = load(resolve(checkout, "src/features/chat/Transcript.tsx"));
const { KeybindingsProvider, KeybindingScope } = load(resolve(checkout, "src/keybindings/KeybindingsProvider.tsx"));
const fixedNow = () => Date.parse("2026-11-11T12:00:00Z");

async function mount({ overrides, transcript = fixture } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (next, enabled = true, focused = true) => {
    await act(async () => root.render(React.createElement(KeybindingsProvider, {
      loadOverrides: overrides ? () => Promise.resolve(JSON.stringify({ version: 1, overrides })) : undefined,
    }, React.createElement(KeybindingScope, { focused },
      React.createElement("div", { className: "chat-scroll" },
        React.createElement(Transcript, { transcript: next, searchEnabled: enabled, now: fixedNow, dontCollapseToolCalls: true }))))));
  };
  await render(transcript);
  return {
    container, render,
    async key(key, options = {}, target = document.body) {
      let event;
      await act(async () => { event = new window.KeyboardEvent("keydown", { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); });
      return event;
    },
    async input(value) {
      const input = container.querySelector('input[placeholder="Find in top-level messages"]');
      assert.ok(input, "actual production find input is mounted");
      await act(async () => Simulate.change(input, { target: { value } }));
      return input;
    },
    async frame() { await act(async () => new Promise((resolve) => window.requestAnimationFrame(resolve))); },
    async close() {
      await act(async () => container.querySelector('[aria-label="Close search"]')?.click());
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("actual Transcript DOM highlights only top-level text, centers selection, and cleans up on updates/close", async () => {
  const f = await mount();
  try {
    await f.key("f", { metaKey: true });
    const input = await f.input("needle");
    await f.frame();
    assert.equal(document.activeElement, input, "opening search focuses the real input");
    const marks = () => [...f.container.querySelectorAll('mark[data-search-highlight="true"]')];
    assert.equal(marks().length, 3, "tool and thinking controls never receive marks");
    assert.equal(marks().filter((m) => m.dataset.searchCurrent === "true").length, 1);
    assert.equal(scrolls.at(-1).element.dataset.turnId, "turn-1");
    assert.equal(scrolls.at(-1).options.block, "center");
    await f.key("g", { metaKey: true }, input); await f.frame();
    assert.equal(marks()[1].dataset.searchCurrent, "true");
    const before = scrolls.length;
    await f.key("j", { metaKey: true, altKey: true }, input); await f.frame();
    assert.ok(scrolls.length > before, "scroll-to-current works without changing count");
    const streamed = structuredClone(fixture);
    streamed.messages[0].blocks[0].text = "needle";
    await f.render(streamed); await f.frame();
    assert.equal(marks().length, 2, "streaming redraw replaces old marks without nested marks");
    assert.equal(f.container.querySelectorAll("mark mark").length, 0);
    await f.key("Escape", {}, input);
    assert.equal(f.container.querySelector('[role="search"]'), null);
    assert.equal(marks().length, 0);
    assert.ok(f.container.textContent.includes("needle"), "mark cleanup preserves message text");
  } finally { await f.close(); }
});

test("actual keybinding provider honors overrides, terminal exclusion, inactive scopes, and reopening focus", async () => {
  const f = await mount({ overrides: { "chat.search": [{ key: { kind: "logical", value: "h" }, modifiers: ["meta"] }] } });
  try {
    await f.key("f", { metaKey: true });
    assert.equal(f.container.querySelector('[role="search"]'), null, "default chord is replaced");
    const terminal = document.createElement("textarea"); terminal.dataset.terminal = "true"; document.body.appendChild(terminal);
    try {
      await f.key("h", { metaKey: true }, terminal);
      assert.equal(f.container.querySelector('[role="search"]'), null, "terminal retains its own find routing");
    } finally { terminal.remove(); }
    await f.render(fixture, true, false);
    await f.key("h", { metaKey: true });
    assert.equal(f.container.querySelector('[role="search"]'), null, "hidden workspace scope cannot open search");
    await f.render(fixture);
    await f.key("h", { metaKey: true });
    const input = await f.input("needle");
    await act(async () => input.blur());
    await f.key("h", { metaKey: true });
    assert.equal(document.activeElement, input, "repeated open refocuses");
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, 6);
    await f.render(fixture, false);
    assert.equal(f.container.querySelector('[role="search"]'), null, "non-chat content has no search host");
    await f.key("h", { metaKey: true });
    assert.equal(f.container.querySelector('[role="search"]'), null);
  } finally { await f.close(); }
});
