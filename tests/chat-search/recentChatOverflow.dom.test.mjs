import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const domDependencies = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS, "package.json"));
const { JSDOM } = domDependencies("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "Element", "Node", "NodeFilter", "Document", "DocumentFragment", "ShadowRoot", "MutationObserver", "Event", "MouseEvent", "KeyboardEvent"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom.window : dom.window[key] });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!dom.window.matchMedia) dom.window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });
class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = dom.window.ResizeObserver = NoLayoutResizeObserver;

const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react-dom/test-utils");
const ts = require("typescript");
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRef = process.env.CHAT_OVERFLOW_SOURCE_REF;
const cache = new Map();
const nullIcon = () => null;

function source(path) {
  return sourceRef ? execFileSync("git", ["show", `${sourceRef}:${path}`], { cwd: checkout, encoding: "utf8" }) : readFileSync(resolve(checkout, path), "utf8");
}

function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const compiled = ts.transpileModule(source(path), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, URL, setTimeout, clearTimeout, queueMicrotask,
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
    require(name) {
      if (name.endsWith(".css")) return {};
      if (name === "../../components/Icons") return { BranchIcon: nullIcon, FolderIcon: nullIcon };
      if (name === "./composerIcons.tsx") return { ModelGlyph: nullIcon };
      if (!name.startsWith(".")) return require(name);
      const base = resolve(checkout, dirname(path), name);
      const absolute = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      assert.ok(absolute, `Missing production dependency ${name} from ${path}`);
      return load(absolute.slice(checkout.length + 1));
    },
  }, { filename: path });
  return module.exports;
}

const { ChatEmptyState } = load("src/features/chat/ChatEmptyState.tsx");
const eligible = Array.from({ length: 6 }, (_, index) => ({
  chatId: `source-${index + 1}`,
  title: ["Source one", "Source two", "Source three", "Source four", "Source five", "Source six"][index],
  agent: "claude",
  lastUserMessageAt: 6000 - index * 1000,
}));

function text(element) { return element.textContent.trim(); }
function pointer(type) {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}
async function settle() {
  await act(async () => { await new Promise((done) => dom.window.setTimeout(done, 40)); });
}

async function click(element) {
  assert.ok(element, "The requested actual DOM control is present");
  await act(async () => {
    element.dispatchEvent(pointer("pointerdown"));
    element.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    if (element instanceof window.HTMLButtonElement) element.focus();
    element.dispatchEvent(pointer("pointerup"));
    element.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  });
  await settle();
}

async function fixture(chats = eligible) {
  const container = document.createElement("div");
  const outside = document.createElement("button");
  outside.textContent = "Outside overflow";
  document.body.append(container, outside);
  const callbacks = [];
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(ChatEmptyState, {
    repoName: "Fixture", directoryName: "fixture", state: "ready", branch: "test",
    otherChats: chats, onAttachTranscript: (chat) => callbacks.push(chat.chatId),
  })));
  const trigger = () => [...container.querySelectorAll("button")].find((button) => text(button) === "+2 more");
  const popup = () => document.querySelector('[role="dialog"]');
  const chipContainer = () => container.querySelector(".oc-new-chat-chips");
  return {
    container, outside, callbacks, trigger, popup, chipContainer, click,
    async open() { await click(trigger()); },
    async escape() {
      assert.ok(popup(), "An actual popup must be open before Escape");
      const target = popup().querySelector("button") ?? popup();
      await act(async () => {
        target.focus();
        target.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      });
      await settle();
    },
    async close() {
      await act(async () => root.unmount());
      container.remove(); outside.remove();
      await settle();
    },
  };
}

function titles(container) {
  return [...container.querySelectorAll("button[title]")].map((button) => button.title);
}

const firstFour = ["Source one", "Source two", "Source three", "Source four"];
const overflowTwo = ["Source five", "Source six"];

test("the installed Popover supports this DOM harness's dismissal and keyboard focus checks", async () => {
  const { Popover } = require("@base-ui/react/popover");
  const host = document.createElement("div");
  const outside = document.createElement("button");
  document.body.append(host, outside);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Popover.Root, null,
    React.createElement(Popover.Trigger, null, "Primitive control"),
    React.createElement(Popover.Portal, null,
      React.createElement(Popover.Positioner, { side: "bottom", align: "start", sideOffset: 4 },
        React.createElement(Popover.Popup, null, React.createElement("button", null, "Control item")))))));
  const trigger = host.querySelector("button");
  try {
    await act(async () => { trigger.focus(); trigger.click(); }); await settle();
    let popup = document.querySelector('[role="dialog"]');
    assert.ok(popup, "The real installed primitive opens in this harness");
    await act(async () => {
      const item = popup.querySelector("button"); item.focus();
      item.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    }); await settle();
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    await click(trigger);
    popup = document.querySelector('[role="dialog"]'); assert.ok(popup);
    await click(outside);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, outside, "Outside mouse dismissal must not steal focus back to the trigger");
  } finally {
    await act(async () => root.unmount()); host.remove(); outside.remove(); await settle();
  }
});

test("six recent chats initially show four chips and one +2 overflow trigger", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(titles(f.chipContainer()), firstFour);
    assert.ok(f.trigger());
    assert.equal(f.popup(), null);
    assert.equal(f.container.querySelector('button[title="Source five"]'), null);
    assert.equal(f.container.querySelector('button[title="Source six"]'), null);
  } finally { await f.close(); }
});

test("opening recent-chat overflow retains its trigger and portals only overflow chips", async () => {
  const f = await fixture();
  try {
    await f.open();
    assert.ok(f.trigger(), "+2 more stays available while its popup is open");
    assert.equal(f.trigger().getAttribute("aria-expanded"), "true");
    assert.ok(f.popup(), "The complete production component opens an actual Popover dialog");
    assert.equal(f.chipContainer().contains(f.popup()), false, "Overflow is not appended to the inline chip list");
    assert.deepEqual(titles(f.chipContainer()), firstFour);
    assert.deepEqual(titles(f.popup()), overflowTwo);
  } finally { await f.close(); }
});

test("Escape dismisses recent-chat overflow and returns keyboard focus to its retained trigger", async () => {
  const f = await fixture();
  try {
    await f.open(); await f.escape();
    assert.equal(f.popup(), null);
    assert.equal(f.trigger().getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, f.trigger());
    assert.deepEqual(f.callbacks, []);
  } finally { await f.close(); }
});

test("an outside press dismisses the actual recent-chat popup without selecting a transcript", async () => {
  const f = await fixture();
  try {
    await f.open();
    assert.ok(f.popup());
    await f.click(f.outside);
    assert.equal(f.popup(), null);
    assert.equal(f.trigger().getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, f.outside, "Outside mouse dismissal must keep focus on the clicked button");
    assert.deepEqual(f.callbacks, []);
  } finally { await f.close(); }
});

test("an overflow source chip reports its own identity without replacing the inline group", async () => {
  const f = await fixture();
  try {
    await f.open();
    assert.ok(f.popup());
    await f.click(f.popup().querySelector('button[title="Source six"]'));
    assert.deepEqual(f.callbacks, ["source-6"]);
    assert.deepEqual(titles(f.chipContainer()), firstFour);
    assert.ok(f.trigger());
    assert.ok(f.popup(), "Selecting a source does not explicitly close the overflow popup");
    assert.equal(f.trigger().getAttribute("aria-expanded"), "true");
  } finally { await f.close(); }
});

test("recent-chat overflow can reopen and dismiss again without duplicating chips", async () => {
  const f = await fixture();
  try {
    await f.open(); await f.escape(); await f.open();
    assert.deepEqual(titles(f.popup()), overflowTwo);
    assert.deepEqual(titles(f.chipContainer()), firstFour);
    await f.click(f.outside);
    assert.equal(f.popup(), null);
    assert.deepEqual(f.callbacks, []);
  } finally { await f.close(); }
});

test("five fitting recent chats need no overflow trigger or popup", async () => {
  const f = await fixture(eligible.slice(0, 5));
  try {
    assert.deepEqual(titles(f.chipContainer()), [...firstFour, "Source five"]);
    assert.equal([...f.container.querySelectorAll("button")].some((button) => /more$/.test(text(button))), false);
    assert.equal(f.popup(), null);
  } finally { await f.close(); }
});
