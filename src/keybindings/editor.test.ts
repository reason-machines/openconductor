import assert from "node:assert/strict";
import test from "node:test";
import {
  editorRows,
  filterRows,
  heldGlyphs,
  readRecorderKey,
  recorderLabel,
  recordKey,
  startsTypeMode,
  typedQuery,
  type RecorderEvent,
} from "./editor.ts";
import { COMMANDS } from "./registry.ts";
import { logical } from "./types.ts";

const press = (key: string, code: string, mods: Partial<RecorderEvent> = {}): RecorderEvent => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("lists configurable or visible commands; the opposite follow-up needs queued messages", () => {
  const rows = editorRows();
  const expected = COMMANDS.filter((c) => (c.configurable || !c.hidden) && c.id !== "chat.submitOppositeFollowUp");
  assert.deepEqual(rows.map((r) => r.id), expected.map((c) => c.id));
  assert.equal(rows.length, 146);
  // Hidden but configurable commands are listed.
  assert.ok(rows.some((r) => r.id === "settings.close"));
  assert.ok(!rows.some((r) => r.id === "chat.submitOppositeFollowUp"));
  assert.ok(editorRows({}, { queuedMessagesEnabled: true }).some((r) => r.id === "chat.submitOppositeFollowUp"));
});

test("non-configurable and send-key commands are fixed", () => {
  const rows = new Map(editorRows().map((r) => [r.id, r]));
  assert.equal(rows.get("toggleCommandPalette")?.recordable, true);
  assert.equal(rows.get("openSettings")?.recordable, false);
  for (const id of ["chat.newLine", "chat.submitMessage", "chat.question.submit"]) assert.equal(rows.get(id)?.recordable, false, id);
});

test("rows carry overrides and key search text", () => {
  const custom = [logical("p", ["meta", "shift"])];
  const row = editorRows({ toggleCommandPalette: custom }).find((r) => r.id === "toggleCommandPalette");
  assert.deepEqual(row?.shortcuts, custom);
  assert.equal(row?.customized, true);
  assert.equal(row?.keyText, "command cmd ⌘ shift ⇧ p P");
  assert.equal(editorRows().find((r) => r.id === "toggleCommandPalette")?.customized, false);
});

test("search ranks over title, category, command id and key names", () => {
  const rows = editorRows();
  assert.equal(filterRows(rows, "  ").length, rows.length);
  assert.deepEqual(filterRows(rows, "zoom").map((r) => r.id).slice(0, 3), ["view.zoomIn", "view.zoomOut", "view.resetZoom"]);
  assert.equal(filterRows(rows, "nav.quickOpen")[0]?.id, "nav.quickOpen");
  assert.equal(filterRows(rows, "cmd k")[0]?.id, "toggleCommandPalette");
});

test("a typed shortcut keeps rows with a key that fires on that press", () => {
  const rows = editorRows();
  assert.deepEqual(filterRows(rows, "⌘K", press("k", "KeyK", { metaKey: true })).map((r) => r.id), ["toggleCommandPalette"]);
  const remapped = editorRows({ toggleCommandPalette: [logical("p", ["meta", "shift"])] });
  assert.ok(!filterRows(remapped, "", press("k", "KeyK", { metaKey: true })).some((r) => r.id === "toggleCommandPalette"));
});

test("recorder keys: repeats ignored, modifiers held, bare Escape cancels", () => {
  assert.deepEqual(readRecorderKey(press("k", "KeyK", { metaKey: true, repeat: true })), { kind: "ignore" });
  assert.deepEqual(readRecorderKey(press("a", "KeyA", { isComposing: true })), { kind: "ignore" });
  assert.deepEqual(readRecorderKey(press("Meta", "MetaLeft", { metaKey: true })), { kind: "modifier", held: ["meta"] });
  assert.deepEqual(readRecorderKey(press("Escape", "Escape")), { kind: "cancel", held: [] });
  assert.deepEqual(readRecorderKey(press("Dead", "Quote", { altKey: true })), { kind: "held", held: ["alt"] });
  assert.deepEqual(readRecorderKey(press("Escape", "Escape", { metaKey: true })), {
    kind: "shortcut",
    held: ["meta"],
    shortcut: logical("Escape", ["meta"]),
  });
});

test("recording saves a free shortcut and reports a taken one", () => {
  assert.deepEqual(recordKey("toggleCommandPalette", press("j", "KeyJ", { metaKey: true, shiftKey: true })), {
    kind: "save",
    shortcut: logical("j", ["meta", "shift"]),
  });
  // Cmd+K is the hidden "Clear terminal scrollback" too (README, "Conflicts").
  const taken = recordKey("toggleCommandPalette", press("k", "KeyK", { metaKey: true }));
  assert.equal(taken.kind, "conflict");
  assert.equal(taken.kind === "conflict" && taken.title, "Clear terminal scrollback");
  assert.deepEqual(recordKey("toggleCommandPalette", press("Escape", "Escape")), { kind: "cancel" });
});

test("the search box's Type shortcut mode and its text", () => {
  assert.equal(startsTypeMode("", undefined, "Meta"), true);
  assert.equal(startsTypeMode("", undefined, "k"), false);
  assert.equal(startsTypeMode("z", undefined, "Meta"), false);
  assert.equal(startsTypeMode("", press("k", "KeyK", { metaKey: true }), "Meta"), false);
  assert.equal(heldGlyphs(["meta", "shift"]), "⌘⇧");
  assert.equal(typedQuery(logical("k", ["meta"])), "⌘K");
});

test("recorder labels match Conductor's", () => {
  const keys = [logical("k", ["meta"])];
  assert.equal(recorderLabel("Command palette", keys, false, []), "Change shortcut for Command palette. Current shortcuts: Command+K.");
  assert.equal(recorderLabel("Command palette", keys, true, []), "Recording shortcut for Command palette. Press modifiers and a key.");
  assert.equal(
    recorderLabel("Command palette", keys, true, ["meta", "alt"]),
    "Recording shortcut for Command palette. Held modifiers: Command+Option. Press a key.",
  );
});
