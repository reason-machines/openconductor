import { test } from "node:test";
import assert from "node:assert/strict";
import { displayedLoadout, parseFavorites } from "./loadout.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

test("a stored Cursor default shows slot 1 as the default model, and stored Cursor favorites are dropped", () => {
  const s = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: "composer-2.5" } };
  assert.deepEqual(displayedLoadout(s, [])[0], { id: "default", type: "built-in", agent: "claude", model: "opus", thinkingLevel: "high", fastMode: false });
  const rows = [{ id: "c", configuration: '{"type":"built-in","agent":"cursor","model":"grok-4.7","thinkingLevel":"high","fastMode":false}' }];
  assert.deepEqual(parseFavorites(rows), []);
});
