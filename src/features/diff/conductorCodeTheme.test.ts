import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDUCTOR_DARK, conductorRules, conductorShikiTheme } from "./conductorCodeTheme.ts";

test("the Shiki theme carries every scope rule and the editor colours", () => {
  const theme = conductorShikiTheme("conductor-dark", "Conductor Dark", "dark", CONDUCTOR_DARK);
  assert.equal(theme.settings.length, conductorRules(CONDUCTOR_DARK).length);
  assert.equal(theme.colors["editor.background"], CONDUCTOR_DARK.bg);
  assert.equal(theme.colors["editor.lineHighlightBackground"], `${CONDUCTOR_DARK.fg}1f`);
  assert.equal(theme.settings.find((r) => r.scope === "keyword")?.settings.foreground, CONDUCTOR_DARK.keyword);
  // variable.other comes after variable, so plain identifiers take the foreground colour.
  assert.equal(theme.settings.find((r) => r.scope === "variable.other")?.settings.foreground, CONDUCTOR_DARK.fg);
});
