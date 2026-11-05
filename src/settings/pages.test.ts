import { test } from "node:test";
import assert from "node:assert/strict";
import { pageLabel, settingsGroups } from "./pages.ts";

test("page labels", () => {
  assert.equal(pageLabel("general"), "General");
  assert.equal(pageLabel("models"), "Default models");
  assert.equal(pageLabel("appearance"), "Appearance");
  assert.equal(pageLabel("git"), "Git");
  assert.equal(pageLabel("key-bindings"), "Keyboard shortcuts");
  assert.equal(pageLabel("providers"), "Agents");
  assert.equal(pageLabel("advanced"), "Advanced");
  assert.equal(pageLabel("experimental"), "Experimental");
  assert.equal(pageLabel("terminal"), "Big terminal");
  assert.equal(pageLabel("account"), "Account");
  assert.equal(pageLabel("environment"), "Environment");
});

test("the Big terminal tab is listed, last, only while Big terminal mode is on", () => {
  const ids = (on: boolean) => settingsGroups(on).flatMap((g) => g.pages.map((p) => p.id));
  assert.ok(!ids(false).includes("terminal"));
  assert.equal(ids(true).at(-1), "terminal");
  assert.deepEqual(ids(true).slice(0, -1), ids(false));
  assert.deepEqual(settingsGroups(false).find((g) => g.title === "More")?.pages.map((p) => p.id), ["experimental", "advanced"]);
});

test("navigation follows Conductor's groups for a local user", () => {
  const groups = settingsGroups(false).map((g) => [g.title, g.pages.map((p) => p.id)]);
  assert.deepEqual(groups, [
    ["Personal", ["general", "account", "appearance", "key-bindings", "models", "git"]],
    ["Agents & environment", ["providers", "environment"]],
    ["More", ["experimental", "advanced"]],
  ]);
});
