import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatcher, isEnabled, PRIORITY, type DispatchEvent, type FocusContext, type HandlerSpec } from "./dispatcher.ts";
import { logical } from "./types.ts";

const ev = (key: string, mods: Partial<DispatchEvent> = {}): DispatchEvent => ({
  key,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});
const idle: FocusContext = { activeDialogId: null, typing: false, inTerminal: false };
const typing: FocusContext = { ...idle, typing: true };
const terminal: FocusContext = { ...idle, inTerminal: true };
const inDialog = (id: string): FocusContext => ({ ...idle, activeDialogId: id });

const spec = (commandId: string, over: Partial<HandlerSpec> = {}): HandlerSpec => ({
  commandId,
  shortcut: logical("k", ["meta"]),
  priority: PRIORITY.NORMAL,
  callback: () => {},
  ...over,
});

test("a bare key is off while typing unless allowWhileTyping", () => {
  const bare = { shortcut: logical("[") };
  assert.equal(isEnabled(bare, idle), true);
  assert.equal(isEnabled(bare, typing), false);
  assert.equal(isEnabled({ ...bare, enableOnInputFocus: true }, typing), false);
  assert.equal(isEnabled({ ...bare, allowWhileTyping: true, enableOnInputFocus: true }, typing), true);
});

test("a modified key needs enableOnInputFocus or isGlobal while typing", () => {
  const cmdK = { shortcut: logical("k", ["meta"]) };
  assert.equal(isEnabled(cmdK, typing), false);
  assert.equal(isEnabled({ ...cmdK, enableOnInputFocus: true }, typing), true);
  assert.equal(isEnabled({ ...cmdK, isGlobal: true }, typing), true);
});

test("terminal focus gates enableOnTerminalFocus and requireTerminalFocus", () => {
  const cmdK = { shortcut: logical("k", ["meta"]) };
  assert.equal(isEnabled({ ...cmdK, isGlobal: true }, terminal), false);
  assert.equal(isEnabled({ ...cmdK, isGlobal: true, enableOnTerminalFocus: true }, terminal), true);
  assert.equal(isEnabled({ ...cmdK, requireTerminalFocus: true }, idle), false);
  // requireTerminalFocus lets a bare key through inside the terminal.
  assert.equal(isEnabled({ shortcut: logical("c"), requireTerminalFocus: true, enableOnTerminalFocus: true }, terminal), true);
});

test("dialogs: only listed dialog ids, and nothing unlisted while a dialog is open", () => {
  const cmdK = { shortcut: logical("k", ["meta"]) };
  const palette = { ...cmdK, enableOnDialogIds: ["command-palette-dialog"] };
  assert.equal(isEnabled(palette, idle), false);
  assert.equal(isEnabled(palette, inDialog("command-palette-dialog")), true);
  assert.equal(isEnabled(palette, inDialog("settings")), false);
  assert.equal(isEnabled(cmdK, inDialog("settings")), false);
  assert.equal(isEnabled({ ...cmdK, isGlobal: true }, inDialog("settings")), true);
});

test("higher priority runs first, then more modifiers; false passes on", () => {
  const d = createDispatcher();
  const calls: string[] = [];
  d.register(spec("low", { callback: () => void calls.push("low") }));
  d.register(spec("dialog", { priority: PRIORITY.DIALOG, callback: () => (calls.push("dialog"), false) }));
  d.register(spec("high", { priority: PRIORITY.HIGH, callback: () => void calls.push("high") }));
  const out = d.dispatch(ev("k", { metaKey: true }), idle);
  assert.deepEqual(calls, ["dialog", "high"]);
  assert.equal(out.kind, "ran");
  assert.equal(out.kind === "ran" && out.commandId, "high");

  const e = createDispatcher();
  e.register(spec("plain", { shortcut: logical("?") }));
  e.register(spec("shifted", { shortcut: logical("?", ["shift"]) }));
  const o2 = e.dispatch(ev("?", { shiftKey: true }), idle);
  assert.equal(o2.kind === "ran" && o2.commandId, "shifted");
});

test("telemetry carries the dialog id and context only when present", () => {
  const d = createDispatcher();
  d.register(spec("toggleCommandPalette", { isGlobal: true, telemetryContext: "sidebar" }));
  const a = d.dispatch(ev("k", { metaKey: true }), idle);
  assert.deepEqual(a.kind === "ran" && a.telemetry, {
    event: "keyboard_shortcut_used",
    keybinding_id: "toggleCommandPalette",
    telemetry_context: "sidebar",
  });
  const b = d.dispatch(ev("k", { metaKey: true }), inDialog("settings"));
  assert.equal(b.kind === "ran" && b.telemetry.active_dialog_id, "settings");
});

test("held-key repeats are swallowed unless a handler allows repeat", () => {
  const d = createDispatcher();
  let n = 0;
  d.register(spec("once", { callback: () => void n++ }));
  assert.equal(d.dispatch(ev("k", { metaKey: true, repeat: true }), idle).kind, "swallow");
  assert.equal(n, 0);
  d.register(spec("zoom", { allowRepeat: true, callback: () => void n++ }));
  const out = d.dispatch(ev("k", { metaKey: true, repeat: true }), idle);
  assert.equal(out.kind === "ran" && out.commandId, "zoom");
  assert.equal(n, 1);
});

test("Escape blurs a focused input before any handler; not in the terminal", () => {
  const d = createDispatcher();
  d.register(spec("close", { shortcut: logical("Escape"), isGlobal: true, allowWhileTyping: true }));
  assert.equal(d.dispatch(ev("Escape"), typing).kind, "blur");
  assert.equal(d.dispatch(ev("Escape"), idle).kind, "ran");
  assert.equal(d.dispatch(ev("Escape"), terminal).kind, "pass");
});

test("recorder, lone modifiers, unfocused scopes and unregister all pass", () => {
  const d = createDispatcher();
  const id = d.register(spec("a"));
  assert.equal(d.dispatch(ev("k", { metaKey: true }), { ...idle, recording: true }).kind, "pass");
  assert.equal(d.dispatch(ev("Meta", { metaKey: true }), idle).kind, "pass");
  d.unregister(id);
  d.register(spec("b", { isFocusedScope: false }));
  assert.equal(d.dispatch(ev("k", { metaKey: true }), idle).kind, "pass");
});

test("Backspace outside a text field is prevented even when nothing handles it", () => {
  const d = createDispatcher();
  assert.deepEqual(d.dispatch(ev("Backspace"), idle), { kind: "pass", preventDefault: true });
  assert.deepEqual(d.dispatch(ev("Backspace"), typing), { kind: "pass", preventDefault: false });
});
