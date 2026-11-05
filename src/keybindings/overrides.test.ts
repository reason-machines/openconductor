import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOverrideStore,
  currentSendKeyMode,
  effectiveShortcuts,
  parseOverrides,
  parseShortcut,
  serializeOverrides,
} from "./overrides.ts";
import { SEND_KEY_PRESETS } from "./registry.ts";
import { logical, physical } from "./types.ts";

const doc = (overrides: Record<string, unknown>) => JSON.stringify({ version: 1, overrides });
const cmdJ = { key: { kind: "logical", value: "j" }, modifiers: ["meta"] };

test("bad documents give no overrides", () => {
  for (const raw of [undefined, "not json", "null", "[]", '{"version":2,"overrides":{}}', '{"version":1}']) {
    assert.deepEqual(parseOverrides(raw), {}, String(raw));
  }
});

test("shortcut parsing canonicalizes modifiers and rejects junk", () => {
  assert.deepEqual(parseShortcut({ key: { kind: "logical", value: "k" }, modifiers: ["shift", "meta"] }), logical("k", ["meta", "shift"]));
  assert.deepEqual(parseShortcut({ key: { kind: "physical", code: "KeyT", display: "T" }, modifiers: [] }), physical("KeyT", "T"));
  assert.equal(parseShortcut({ key: { kind: "logical", value: "Shift" } }), undefined);
  assert.equal(parseShortcut({ key: { kind: "logical", value: "k" }, modifiers: ["hyper"] }), undefined);
  assert.equal(parseShortcut({ key: { kind: "logical", value: "" } }), undefined);
  assert.equal(parseShortcut({ key: { kind: "physical", code: "KeyT" } }), undefined);
});

test("unknown, non-configurable and invalid entries are dropped", () => {
  const parsed = parseOverrides(
    doc({
      "view.toggleTerminalPanel": cmdJ,
      "nav.back": [cmdJ, { key: { kind: "logical", value: "ArrowLeft" }, modifiers: ["meta"] }],
      openSettings: cmdJ,
      "no.such.command": cmdJ,
      "nav.forward": [cmdJ, { key: { kind: "bogus" } }],
    }),
  );
  assert.deepEqual(Object.keys(parsed).sort(), ["nav.back", "view.toggleTerminalPanel"]);
  assert.equal(parsed["nav.back"].length, 2);
});

test("legacy ids migrate to their replacements", () => {
  const p = parseOverrides(doc({ "workspace.contextMenu.togglePinOrImportance": cmdJ, "chat.question.submitWithEnter": cmdJ }));
  assert.deepEqual(p["workspace.contextMenu.togglePin"], [logical("j", ["meta"])]);
  assert.deepEqual(p["chat.question.submit"], [logical("j", ["meta"])]);
  const current = { key: { kind: "logical", value: "x" } };
  const q = parseOverrides(doc({ "chat.question.submit": current, "chat.question.submitWithEnter": cmdJ }));
  assert.deepEqual(q["chat.question.submit"], [logical("x")]);
});

test("old cmd-enter setups regain Shift+Enter for new line", () => {
  const preset = SEND_KEY_PRESETS["cmd-enter"];
  const raw = serializeOverrides({}, [
    { commandId: "chat.newLine", shortcuts: [logical("Enter")] },
    { commandId: "chat.submitMessage", shortcuts: preset["chat.submitMessage"] },
    { commandId: "chat.submitOppositeFollowUp", shortcuts: preset["chat.submitOppositeFollowUp"] },
    { commandId: "chat.question.submit", shortcuts: preset["chat.question.submit"] },
  ]);
  const p = parseOverrides(raw);
  assert.deepEqual(p["chat.newLine"], preset["chat.newLine"]);
  assert.equal(currentSendKeyMode(p), "cmd-enter");
  assert.equal(currentSendKeyMode({}), "enter");
});

test("serialize stores singles bare, lists as arrays, and deletes resets", () => {
  const raw = serializeOverrides({ "nav.back": [logical("j", ["meta"])] }, [
    { commandId: "nav.forward", shortcuts: [logical("k", ["meta"]), logical("l")] },
    { commandId: "nav.back", shortcuts: undefined },
  ]);
  assert.deepEqual(JSON.parse(raw), {
    version: 1,
    overrides: { "nav.forward": [logical("k", ["meta"]), logical("l")] },
  });
  assert.deepEqual(parseOverrides(raw)["nav.forward"], [logical("k", ["meta"]), logical("l")]);
});

test("effective shortcuts fall back to key plus additionalKeys", () => {
  assert.deepEqual(effectiveShortcuts("view.toggleLeftSidebar"), [logical("b", ["meta"]), logical("[")]);
  assert.deepEqual(effectiveShortcuts("view.toggleLeftSidebar", { "view.toggleLeftSidebar": [logical("x")] }), [logical("x")]);
  assert.throws(() => effectiveShortcuts("nope"));
});

test("store serializes concurrent updates without losing either", async () => {
  let value: string | undefined;
  const store = createOverrideStore({
    read: async () => value,
    write: async (raw) => {
      await new Promise((r) => setTimeout(r, 5));
      value = raw;
      return true;
    },
  });
  const results = await Promise.all([
    store.update({ commandId: "nav.back", shortcuts: [logical("j", ["meta"])] }),
    store.update({ commandId: "nav.forward", shortcuts: [logical("k", ["meta"])] }),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(Object.keys(parseOverrides(value)).sort(), ["nav.back", "nav.forward"]);
  await store.update({ commandId: "nav.back", shortcuts: undefined });
  assert.deepEqual(Object.keys(parseOverrides(value)), ["nav.forward"]);
});
