import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatcher, PRIORITY, type Telemetry } from "./dispatcher.ts";
import { createKeyListeners, installKeyListeners, OPTION_INPUT_SUPPRESS_MS, probeFocus, type ElementLike, type ListenerEvent } from "./listeners.ts";
import { logical, physical } from "./types.ts";

interface FakeEvent extends ListenerEvent {
  stopped: boolean;
}

const el = (tagName: string, over: Partial<ElementLike> = {}): ElementLike & { blurred: number } => {
  const e = { tagName, blurred: 0, closest: () => null, ...over } as ElementLike & { blurred: number };
  e.blur = () => void e.blurred++;
  return e;
};

const ev = (key: string, over: Partial<ListenerEvent> & { path?: unknown[] } = {}): FakeEvent => {
  const { path = [], ...rest } = over;
  const e: FakeEvent = {
    key,
    code: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: path[0],
    defaultPrevented: false,
    stopped: false,
    composedPath: () => path,
    preventDefault() {
      e.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      e.stopped = true;
    },
    ...rest,
  };
  return e;
};

function setup(dialog: string | null = null) {
  let clock = 1000;
  const dispatcher = createDispatcher();
  const sent: Telemetry[] = [];
  const ran: string[] = [];
  const listeners = createKeyListeners({
    dispatcher,
    activeDialogId: () => dialog,
    track: (t) => sent.push(t),
    now: () => clock,
  });
  const add = (commandId: string, shortcut = logical("k", ["meta"]), extra = {}) =>
    dispatcher.register({ commandId, shortcut, priority: PRIORITY.NORMAL, callback: () => void ran.push(commandId), ...extra });
  return { listeners, sent, ran, add, tick: (ms: number) => (clock += ms) };
}

test("probeFocus: input in path, outermost contenteditable, terminal, recorder", () => {
  const input = el("INPUT");
  assert.equal(probeFocus(ev("a", { path: [input, el("DIV")] })).field, input);
  const inner = el("SPAN", { isContentEditable: true });
  const outer = el("DIV", { isContentEditable: true });
  assert.equal(probeFocus(ev("a", { path: [inner, outer, el("BODY")] })).field, outer);
  const term = el("TEXTAREA", { closest: (s) => (s === "[data-terminal]" ? {} : null) });
  assert.deepEqual(probeFocus(ev("a", { path: [term] })).inTerminal, true);
  const rec = el("BUTTON", { dataset: { keybindingRecorderActive: "true" } });
  assert.equal(probeFocus(ev("a", { path: [rec] })).recording, true);
  assert.deepEqual(probeFocus(ev("a", { path: [{}, null, "x"] })), { field: undefined, inTerminal: false, recording: false });
});

test("probeFocus: a data-keybinding-local list reads its own plain keys, like a text field", () => {
  const list = el("OL", { dataset: { keybindingLocal: "true" } });
  assert.equal(probeFocus(ev("ArrowUp", { path: [el("LI"), list, el("BODY")] })).field, list);
  const input = el("TEXTAREA");
  assert.equal(probeFocus(ev("a", { path: [input, list] })).field, input, "a text field inside it still wins");
});

test("a matching shortcut runs, stops propagation and sends telemetry", () => {
  const s = setup("settings");
  s.add("openKeyboardShortcuts", physical("Slash", "/", ["meta", "alt"]), { isGlobal: true });
  const e = ev("÷", { code: "Slash", metaKey: true, altKey: true });
  s.listeners.keydownCapture(e);
  assert.deepEqual(s.ran, ["openKeyboardShortcuts"]);
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.stopped, true);
  assert.deepEqual(s.sent, [{ event: "keyboard_shortcut_used", keybinding_id: "openKeyboardShortcuts", active_dialog_id: "settings" }]);
});

test("an unmatched key passes untouched; Backspace outside a field is prevented", () => {
  const s = setup();
  const a = ev("a");
  s.listeners.keydownCapture(a);
  assert.equal(a.defaultPrevented, false);
  const back = ev("Backspace", { path: [el("DIV")] });
  s.listeners.keydownCapture(back);
  assert.equal(back.defaultPrevented, true);
  assert.equal(back.stopped, false);
  const inField = ev("Backspace", { path: [el("INPUT")] });
  s.listeners.keydownCapture(inField);
  assert.equal(inField.defaultPrevented, false);
});

test("a bare Escape waits for the bubble phase and is skipped if handled", () => {
  const s = setup();
  s.add("chat.cancel", logical("Escape"));
  const first = ev("Escape");
  s.listeners.keydownCapture(first);
  assert.deepEqual(s.ran, []);
  s.listeners.keydownBubble(first);
  assert.deepEqual(s.ran, ["chat.cancel"]);

  const handled = ev("Escape");
  s.listeners.keydownCapture(handled);
  handled.preventDefault(); // a dialog closed itself
  s.listeners.keydownBubble(handled);
  assert.deepEqual(s.ran, ["chat.cancel"]);
});

test("a bare Escape in a text field blurs it", () => {
  const s = setup();
  const input = el("TEXTAREA");
  const e = ev("Escape", { path: [input] });
  s.listeners.keydownBubble(e);
  assert.equal(input.blurred, 1);
  assert.equal(e.defaultPrevented, true);
});

test("the bubble listener ignores everything but a bare Escape", () => {
  const s = setup();
  s.add("x");
  s.listeners.keydownBubble(ev("k", { metaKey: true }));
  s.listeners.keydownBubble(ev("Escape", { shiftKey: true }));
  assert.deepEqual(s.ran, []);
});

test("a key capture takes every key until removed", () => {
  const s = setup();
  s.add("x");
  const seen: string[] = [];
  const remove = s.listeners.captureKeys({ onKeyDown: (e) => seen.push(`down:${e.key}`), onKeyUp: (e) => seen.push(`up:${e.key}`) });
  const down = ev("k", { metaKey: true });
  s.listeners.keydownCapture(down);
  s.listeners.keyupCapture(ev("k"));
  s.listeners.keydownCapture(ev("Escape"));
  assert.deepEqual(seen, ["down:k", "up:k", "down:Escape"]);
  assert.deepEqual(s.ran, []);
  assert.equal(down.defaultPrevented && down.stopped, true);

  const input = ev("t");
  s.listeners.inputCapture(input);
  assert.equal(input.defaultPrevented, true);

  remove();
  assert.equal(s.listeners.capturing(), false);
  s.listeners.keydownCapture(ev("k", { metaKey: true }));
  assert.deepEqual(s.ran, ["x"]);
});

test("removing a replaced capture keeps the newer one", () => {
  const s = setup();
  const removeOld = s.listeners.captureKeys({ onKeyDown() {}, onKeyUp() {} });
  s.listeners.captureKeys({ onKeyDown() {}, onKeyUp() {} });
  removeOld();
  assert.equal(s.listeners.capturing(), true);
});

test("text input is blocked briefly after an Option chord runs", () => {
  const s = setup();
  s.add("opt", physical("KeyT", "T", ["alt"]));
  s.listeners.keydownCapture(ev("†", { code: "KeyT", altKey: true }));
  assert.deepEqual(s.ran, ["opt"]);
  const during = ev("†");
  s.listeners.inputCapture(during);
  assert.equal(during.defaultPrevented, true);
  s.tick(OPTION_INPUT_SUPPRESS_MS);
  const after = ev("x");
  s.listeners.inputCapture(after);
  assert.equal(after.defaultPrevented, false);
});

test("a Command-Option chord does not block text input", () => {
  const s = setup();
  s.add("cmdopt", logical("k", ["meta", "alt"]));
  s.listeners.keydownCapture(ev("k", { metaKey: true, altKey: true }));
  assert.deepEqual(s.ran, ["cmdopt"]);
  const input = ev("x");
  s.listeners.inputCapture(input);
  assert.equal(input.defaultPrevented, false);
});

test("a held-key repeat with no repeatable handler is swallowed", () => {
  const s = setup();
  s.add("x");
  const e = ev("k", { metaKey: true, repeat: true });
  s.listeners.keydownCapture(e);
  assert.deepEqual(s.ran, []);
  assert.equal(e.defaultPrevented && e.stopped, true);
  assert.deepEqual(s.sent, []);
});

test("installKeyListeners wires capture and bubble phases and removes them", () => {
  const calls: string[] = [];
  const target = {
    addEventListener: (type: string, _fn: unknown, cap?: boolean) => void calls.push(`+${type}:${cap}`),
    removeEventListener: (type: string, _fn: unknown, cap?: boolean) => void calls.push(`-${type}:${cap}`),
  };
  const remove = installKeyListeners(target, setup().listeners);
  assert.deepEqual(calls, ["+keydown:true", "+keydown:false", "+keyup:true", "+compositionstart:true", "+beforeinput:true"]);
  calls.length = 0;
  remove();
  assert.deepEqual(calls, ["-keydown:true", "-keydown:false", "-keyup:true", "-compositionstart:true", "-beforeinput:true"]);
});
