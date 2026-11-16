import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_BINDINGS_PAGE, pageLabel, settingsGroups } from "./pages.ts";

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
  // Conductor's `dti`: appended to the last group's tabs, not a group of its own.
  assert.deepEqual(settingsGroups(true).find((g) => g.title === "More")?.pages.map((p) => p.id), ["experimental", "advanced", "terminal"]);
  assert.equal(settingsGroups(true).length, settingsGroups(false).length);
});

test("navigation follows Conductor's groups for a local user", () => {
  const groups = settingsGroups(false).map((g) => [g.title, g.pages.map((p) => p.id)]);
  // Key-bindings is not in default nav (Conductor: internal builds only).
  assert.deepEqual(groups, [
    ["Personal", ["general", "account", "appearance", "models", "git"]],
    ["Agents & environment", ["providers", "environment"]],
    ["More", ["experimental", "advanced"]],
  ]);
});

test("key-bindings is not in nav by default; appears after Appearance in Personal with internalSettings on", () => {
  const ids = (internal: boolean) => settingsGroups(false, false, internal).flatMap((g) => g.pages.map((p) => p.id));
  // Default: not in nav (Conductor: local users do not see it).
  assert.ok(!ids(false).includes("key-bindings"));
  // Internal: in nav, after Appearance.
  assert.ok(ids(true).includes("key-bindings"));
  const personal = settingsGroups(false, false, true).find((g) => g.title === "Personal")!.pages.map((p) => p.id);
  const appearanceIdx = personal.indexOf("appearance");
  assert.equal(personal[appearanceIdx + 1], "key-bindings", "key-bindings follows Appearance in Personal");
  // Group count unchanged by internalSettings.
  assert.equal(settingsGroups(false, false, true).length, settingsGroups(false).length);
  // KEY_BINDINGS_PAGE constant has the right id and label.
  assert.equal(KEY_BINDINGS_PAGE.id, "key-bindings");
  assert.equal(KEY_BINDINGS_PAGE.label, "Keyboard shortcuts");
});
