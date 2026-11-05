import { test } from "node:test";
import assert from "node:assert/strict";
import { pageFromPath, pageLabel } from "./pages.ts";

test("settings start routes", () => {
  assert.equal(pageFromPath("/settings"), "general");
  assert.equal(pageFromPath("/settings/"), "general");
  assert.equal(pageFromPath("/settings/user/general"), "general");
  assert.equal(pageFromPath("/settings/user/appearance"), "appearance");
  assert.equal(pageFromPath("/settings/user/git"), "git");
  assert.equal(pageFromPath("/settings/user/models"), "models");
  assert.equal(pageFromPath("/settings/user/key-bindings"), "key-bindings");
  assert.equal(pageFromPath("/settings/user/providers"), "providers");
  assert.equal(pageFromPath("/settings/user/advanced"), "advanced");
  // A page not built yet still opens settings, on General.
  assert.equal(pageFromPath("/settings/user/nope"), "general");
  assert.equal(pageFromPath("/"), null);
  assert.equal(pageFromPath("/create"), null);
  assert.equal(pageFromPath("/settingsx"), null);
});

test("page labels", () => {
  assert.equal(pageLabel("general"), "General");
  assert.equal(pageLabel("models"), "Default models");
  assert.equal(pageLabel("appearance"), "Appearance");
  assert.equal(pageLabel("git"), "Git");
  assert.equal(pageLabel("key-bindings"), "Keyboard shortcuts");
  assert.equal(pageLabel("providers"), "Agents");
  assert.equal(pageLabel("advanced"), "Advanced");
});
