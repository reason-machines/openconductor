import { test } from "node:test";
import assert from "node:assert/strict";
import { activeDialogIdFromDom, bindCommands } from "./bind.ts";
import { createDispatcher, type DispatchEvent, type FocusContext } from "./dispatcher.ts";
import { logical } from "./types.ts";

const key = (k: string, mods: Partial<DispatchEvent> = {}): DispatchEvent => ({
  key: k,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});
const idle: FocusContext = { activeDialogId: null, typing: false, inTerminal: false };

test("bindCommands registers every default shortcut of a command", () => {
  const d = createDispatcher();
  let ran = 0;
  bindCommands(d, { "view.toggleLeftSidebar": () => void ran++ });
  assert.equal(d.handlers().length, 2);
  assert.equal(d.dispatch(key("b", { metaKey: true }), idle).kind, "ran");
  assert.equal(d.dispatch(key("["), idle).kind, "ran");
  assert.equal(ran, 2);
});

test("a bare-key shortcut does not fire while typing; its modifier shortcut does", () => {
  const d = createDispatcher();
  bindCommands(d, { "view.toggleLeftSidebar": () => {} });
  const typing = { ...idle, typing: true };
  assert.equal(d.dispatch(key("["), typing).kind, "pass");
  assert.equal(d.dispatch(key("b", { metaKey: true }), typing).kind, "ran");
});

test("a non-global command stays off while a dialog is open; a global one runs", () => {
  const d = createDispatcher();
  const ran: string[] = [];
  bindCommands(d, { "workspace.create": () => void ran.push("create"), "nav.quickOpen": () => void ran.push("quick") });
  const inDialog = { ...idle, activeDialogId: "dialog" };
  assert.equal(d.dispatch(key("n", { metaKey: true }), inDialog).kind, "pass");
  assert.equal(d.dispatch(key("p", { metaKey: true }), inDialog).kind, "ran");
  assert.deepEqual(ran, ["quick"]);
});

test("overrides replace the default shortcut", () => {
  const d = createDispatcher();
  bindCommands(d, { "workspace.create": () => {} }, { overrides: { "workspace.create": [logical("j", ["meta"])] } });
  assert.equal(d.dispatch(key("n", { metaKey: true }), idle).kind, "pass");
  assert.equal(d.dispatch(key("j", { metaKey: true }), idle).kind, "ran");
});

test("undefined callbacks are skipped and the remover takes back only its own handlers", () => {
  const d = createDispatcher();
  const keep = bindCommands(d, { toggleCommandPalette: () => {} });
  const off = bindCommands(d, { "workspace.create": () => {}, "nav.home": undefined });
  assert.equal(d.handlers().length, 2);
  off();
  assert.deepEqual(d.handlers().map((h) => h.commandId), ["toggleCommandPalette"]);
  keep();
  assert.equal(d.handlers().length, 0);
});

test("a callback returning false passes the key on", () => {
  const d = createDispatcher();
  bindCommands(d, { "workspace.create": () => false });
  assert.equal(d.dispatch(key("n", { metaKey: true }), idle).kind, "pass");
});

test("unknown command ids throw", () => {
  assert.throws(() => bindCommands(createDispatcher(), { "no.such.command": () => {} }), /Unknown keybinding/);
});

test("hidden chat bindings cannot cancel or attach from a center terminal", () => {
  const d = createDispatcher();
  const ran: string[] = [];
  bindCommands(d, {
    "chat.cancel": () => void ran.push("cancel"),
    "chat.addAttachment": () => void ran.push("attach"),
  }, { isFocusedScope: false });
  const terminal = { ...idle, typing: true, inTerminal: true };
  assert.equal(d.dispatch(key("Backspace", { metaKey: true, shiftKey: true }), terminal).kind, "pass");
  assert.equal(d.dispatch(key("u", { metaKey: true }), terminal).kind, "pass");
  assert.deepEqual(ran, []);
});

test("focused chat shortcuts still work while its panel terminal has keyboard focus", () => {
  const d = createDispatcher();
  const ran: string[] = [];
  bindCommands(d, {
    "chat.cancel": () => void ran.push("cancel"),
    "chat.addAttachment": () => void ran.push("attach"),
  }, { isFocusedScope: true });
  const terminal = { ...idle, typing: true, inTerminal: true };
  assert.equal(d.dispatch(key("Backspace", { metaKey: true, shiftKey: true }), terminal).kind, "ran");
  assert.equal(d.dispatch(key("u", { metaKey: true }), terminal).kind, "ran");
  assert.deepEqual(ran, ["cancel", "attach"]);
});

const doc = (tagged: (string | undefined)[], modal: boolean) => ({
  querySelectorAll: () => tagged.map((dialogId) => ({ dataset: { dialogId } })),
  querySelector: () => (modal ? {} : null),
});

test("activeDialogIdFromDom: the last tagged dialog, else any modal, else none", () => {
  assert.equal(activeDialogIdFromDom(doc(["command-palette", "keyboard-shortcuts"], true)), "keyboard-shortcuts");
  assert.equal(activeDialogIdFromDom(doc([], true)), "dialog");
  assert.equal(activeDialogIdFromDom(doc([], false)), null);
});

test("a higher-priority binding runs first and passes the key on by returning false", () => {
  const d = createDispatcher();
  const ran: string[] = [];
  let fileHasComment = true;
  bindCommands(d, { "diff.nextComment": () => void ran.push("across files") });
  bindCommands(d, { "diff.nextComment": () => (ran.push("in file"), fileHasComment) }, {}, { priority: 101 });
  const j = key("j", { code: "KeyJ", metaKey: true, altKey: true });
  d.dispatch(j, idle);
  assert.deepEqual(ran, ["in file"]);
  fileHasComment = false;
  d.dispatch(j, idle);
  assert.deepEqual(ran, ["in file", "in file", "across files"]);
});
