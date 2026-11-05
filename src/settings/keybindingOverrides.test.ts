import { test } from "node:test";
import assert from "node:assert/strict";
import { createOverrideStore, parseOverrides } from "../keybindings/overrides.ts";
import { logical } from "../keybindings/types.ts";
import { KEYBINDING_OVERRIDES_KEY, overridesRaw, settingsOverrideStorage, withOverridesRaw } from "./keybindingOverrides.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

/** A settings holder whose save stores asynchronously, or refuses. */
function holder(initial: Settings, { refuse = false } = {}) {
  let current = initial;
  const saved: Settings[] = [];
  const save = async (next: Settings): Promise<boolean> => {
    await new Promise((r) => setTimeout(r, 2));
    if (refuse) return false;
    current = next;
    saved.push(next);
    return true;
  };
  return { latest: () => current, save, saved, get: () => current };
}

test("overrides live under keybinding_overrides_v1 and only a string counts", () => {
  assert.equal(overridesRaw(DEFAULT_SETTINGS), undefined);
  assert.equal(overridesRaw({ ...DEFAULT_SETTINGS, [KEYBINDING_OVERRIDES_KEY]: 3 }), undefined);
  const s = withOverridesRaw(DEFAULT_SETTINGS, '{"version":1,"overrides":{}}');
  assert.equal(overridesRaw(s), '{"version":1,"overrides":{}}');
  assert.equal(s.general, DEFAULT_SETTINGS.general);
});

test("a shortcut write keeps every other setting", async () => {
  const start: Settings = { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, theme: "dark" } };
  const h = holder(start);
  const store = createOverrideStore(settingsOverrideStorage(h.latest, h.save));
  assert.equal(await store.update({ commandId: "settings.search", shortcuts: [logical("k", ["meta", "shift"])] }), true);
  assert.equal(h.get().general.theme, "dark");
  assert.deepEqual(parseOverrides(overridesRaw(h.get()))["settings.search"], [logical("k", ["meta", "shift"])]);
});

test("two rows saved at once both land, and a reset removes only its own", async () => {
  const h = holder(DEFAULT_SETTINGS);
  const store = createOverrideStore(settingsOverrideStorage(h.latest, h.save));
  await Promise.all([
    store.update({ commandId: "settings.search", shortcuts: [logical(",", ["meta", "alt"])] }),
    store.update({ commandId: "openKeyboardShortcuts", shortcuts: [logical("/", ["meta"])] }),
  ]);
  assert.deepEqual(Object.keys(parseOverrides(overridesRaw(h.get()))).sort(), ["openKeyboardShortcuts", "settings.search"]);
  await store.update({ commandId: "settings.search", shortcuts: undefined });
  assert.deepEqual(Object.keys(parseOverrides(overridesRaw(h.get()))), ["openKeyboardShortcuts"]);
});

test("a refused save reports failure and stores nothing", async () => {
  const h = holder(DEFAULT_SETTINGS, { refuse: true });
  const store = createOverrideStore(settingsOverrideStorage(h.latest, h.save));
  assert.equal(await store.update({ commandId: "settings.search", shortcuts: [logical("k", ["meta"])] }), false);
  assert.equal(overridesRaw(h.get()), undefined);
});
