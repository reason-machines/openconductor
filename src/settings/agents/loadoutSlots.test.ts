import { test } from "node:test";
import assert from "node:assert/strict";
import { builtIn, clearSlot, equipSlot, loadoutSlots, moveSlot, parseFavorites, slotsToRows, withLoadoutDefault } from "./loadout.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

const first = builtIn("a", "future-claude-model", "high", false, "claude");
const fifth = builtIn("b", "future-codex-model", "xhigh", false, "codex");
const empty = () => Array(5).fill(null);

test("arbitrary equip and persistence retain five physical slots and dynamic agent identity", () => {
  const slots = equipSlot(equipSlot(empty(), first, 0), fifth, 4);
  const rows = slotsToRows(slots);
  assert.deepEqual(rows.map((r) => JSON.parse(r.configuration).slot), [0, 4]);
  assert.deepEqual(loadoutSlots(DEFAULT_SETTINGS, parseFavorites(rows)), slots);
  const restored = parseFavorites(rows)[1];
  assert.equal(restored.type === "built-in" && restored.agent, "codex");
});

test("clear slot1 leaves a hole; slot5 never becomes the default", () => {
  const slots = clearSlot(equipSlot(equipSlot(empty(), first, 0), fifth, 4), 0);
  const settings = withLoadoutDefault(DEFAULT_SETTINGS, slots);
  assert.equal(settings.models.default_initialized, false);
  assert.deepEqual(loadoutSlots(settings, parseFavorites(slotsToRows(slots))), [null, null, null, null, fifth]);
  assert.deepEqual(loadoutSlots(withLoadoutDefault(settings, empty()), []), empty());
});

test("clear the last occupied slot, and reorder through holes without losing any slot", () => {
  const slots = equipSlot(empty(), fifth, 4);
  assert.deepEqual(clearSlot(slots, 4), empty());
  assert.deepEqual(moveSlot(slots, 4, 1), [null, fifth, null, null, null]);
  assert.deepEqual(moveSlot(slots, 4, 0), [fifth, null, null, null, null]);
  assert.deepEqual(slots, [null, null, null, null, fifth]);
});

test("slot1 alone sets default agent, model and effort", () => {
  const settings = withLoadoutDefault(DEFAULT_SETTINGS, [fifth, first, null, null, null]);
  assert.equal(settings.models.default, fifth.model);
  assert.equal(settings.models.default_agent, "codex");
  assert.equal(settings.models.codex.default_thinking_level, "xhigh");
  assert.equal(settings.models.default_initialized, true);
});

test("legacy rows migrate to numbered slots while invalid explicit agent identities are rejected", () => {
  const legacy = parseFavorites([{ id: "old", configuration: '{"type":"built-in","model":"gpt-5.6-sol"}' }]);
  assert.equal(loadoutSlots(DEFAULT_SETTINGS, legacy).length, 5);
  assert.equal(loadoutSlots(DEFAULT_SETTINGS, legacy)[0]?.id, "old");
  assert.deepEqual(parseFavorites([{ id: "bad", configuration: '{"type":"built-in","model":"opus","agent":"cursor"}' }]), []);
});
