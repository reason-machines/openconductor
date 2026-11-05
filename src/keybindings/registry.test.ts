import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS, CONFLICT_BASE, CONFLICT_GROUPS, LEGACY_ALIASES, SEND_KEY_PRESETS } from "./registry.ts";
import { CATEGORIES, MODIFIERS } from "./types.ts";

const evidence = JSON.parse(readFileSync(new URL("../../evidence/keybindings/keybindings.json", import.meta.url), "utf8"));

test("registry matches the extracted evidence exactly", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(COMMANDS)), evidence.commands);
  assert.deepEqual(JSON.parse(JSON.stringify(SEND_KEY_PRESETS)), evidence.sendKeyPresets);
  assert.deepEqual(CONFLICT_BASE, evidence.conflictScopes.base);
  assert.deepEqual(CONFLICT_GROUPS, evidence.conflictScopes.groups);
  assert.deepEqual(LEGACY_ALIASES, evidence.legacyAliases);
  assert.deepEqual([...CATEGORIES], evidence.categoryOrder);
});

test("registry shape: 165 unique ids, known categories and modifiers", () => {
  assert.equal(COMMANDS.length, 165);
  assert.equal(new Set(COMMANDS.map((c) => c.id)).size, COMMANDS.length);
  for (const c of COMMANDS) {
    assert.ok((CATEGORIES as readonly string[]).includes(c.category), c.id);
    for (const s of [c.key, ...(c.additionalKeys ?? [])]) {
      for (const m of s.modifiers ?? []) assert.ok(MODIFIERS.includes(m), `${c.id} ${m}`);
    }
  }
  assert.equal(COMMANDS.filter((c) => c.configurable).length, 142);
  assert.equal(COMMANDS.filter((c) => c.hidden).length, 61);
});

test("every id in scopes, presets and aliases names a command", () => {
  const ids = new Set(COMMANDS.map((c) => c.id));
  for (const id of [...CONFLICT_BASE, ...CONFLICT_GROUPS.flat(), ...Object.values(LEGACY_ALIASES)]) {
    assert.ok(ids.has(id), id);
  }
  for (const byId of Object.values(SEND_KEY_PRESETS)) for (const id of Object.keys(byId)) assert.ok(ids.has(id), id);
});

test("help shortcut defaults to Option+Command+/ (physical Slash)", () => {
  const help = COMMANDS.find((c) => c.id === "openKeyboardShortcuts");
  assert.deepEqual(help?.key, { key: { kind: "physical", code: "Slash", display: "/" }, modifiers: ["meta", "alt"] });
  assert.equal(help?.title, "Shortcuts help");
});
