import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictMessage, findConflict, shareScope } from "./conflicts.ts";
import { logical, physical } from "./types.ts";
import type { KeyEventLike } from "./shortcut.ts";

const ev = (key: string, code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("base commands share a scope with every group; groups do not share with each other", () => {
  assert.equal(shareScope("chat.focus", "toggleCommandPalette"), true);
  assert.equal(shareScope("terminal.search", "nav.quickOpen"), true);
  assert.equal(shareScope("chat.search", "terminal.search"), false);
  assert.equal(shareScope("routine.save", "diff.nextFile"), false);
  assert.equal(shareScope("chat.focus", "workspace.notInAnyScope"), false);
});

test("a shortcut taken by a command in a shared scope is a conflict", () => {
  const other = findConflict({ commandId: "chat.focus", shortcut: logical("k", ["meta"]) });
  assert.equal(other?.id, "toggleCommandPalette");
  assert.equal(conflictMessage(other!), "Already used by Command palette. Type another shortcut.");
});

test("the same keys in unrelated scopes do not conflict", () => {
  // Chat search and terminal search are both Cmd+F by default.
  assert.equal(findConflict({ commandId: "chat.search", shortcut: logical("f", ["meta"]) }), undefined);
});

test("a command never conflicts with itself", () => {
  assert.equal(findConflict({ commandId: "nav.quickOpen", shortcut: logical("p", ["meta"]) }), undefined);
});

test("hidden fixed commands count, as in Conductor (palette Cmd+K vs clear scrollback)", () => {
  const other = findConflict({ commandId: "toggleCommandPalette", shortcut: logical("k", ["meta"]) });
  assert.equal(other?.id, "terminal.clearScrollback");
});

test("additional default keys count (zoom in is Cmd+= as well as Cmd++)", () => {
  assert.equal(findConflict({ commandId: "chat.focus", shortcut: logical("=", ["meta"]) })?.id, "view.zoomIn");
});

test("a physical binding conflicts with the event that presses it", () => {
  // Cmd+Option+T types a dagger on a US layout; toggleTheme is bound by code.
  const event = ev("†", "KeyT", { metaKey: true, altKey: true });
  const other = findConflict({ commandId: "chat.focus", shortcut: physical("KeyT", "T", ["meta", "alt"]), event });
  assert.equal(other?.id, "toggleTheme");
});

test("overrides replace defaults on both sides", () => {
  const overrides = { toggleCommandPalette: [logical("j", ["meta"])] };
  assert.equal(findConflict({ commandId: "chat.focus", shortcut: logical("k", ["meta"]), overrides }), undefined);
  assert.equal(findConflict({ commandId: "chat.focus", shortcut: logical("j", ["meta"]), overrides })?.id, "toggleCommandPalette");
});
