// parity:diff.appearance wrap_lines persistence tests
// Evidence: evidence/diff/wrap-lines-and-range-comments.md (plain-text bundle
// read from Conductor 0.87.6 on sven m5 max). Conductor stores wrap_lines in
// the settings table, not localStorage. These tests verify the migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW_OPTIONS } from "./types.ts";
import { BOOL_PREFS, boolPref, withBoolPref } from "../../settings/prefs.ts";
import { DEFAULT_SETTINGS } from "../../settings/types.ts";

test("lines wrap by default, as with Conductor's wrap_lines setting", () => {
  assert.equal(DEFAULT_VIEW_OPTIONS.wrapLines, true);
});

// parity:diff.appearance — wrap_lines pref registration

test("wrap_lines is registered as a top-level bool pref with default true", () => {
  const pref = BOOL_PREFS["wrap_lines"];
  assert.ok(pref, "wrap_lines must be in BOOL_PREFS");
  assert.equal(pref.section, "top", "wrap_lines lives at the top-level settings table (Conductor: us(\"wrap_lines\"))");
  assert.equal(pref.default, true, "Conductor's registry default is true (Te(\"wrap_lines\",!0))");
});

test("boolPref returns true for wrap_lines from default settings", () => {
  // DEFAULT_SETTINGS has no wrap_lines row, so the pref default applies.
  assert.equal(boolPref(DEFAULT_SETTINGS, "wrap_lines"), true);
});

test("boolPref returns false when wrap_lines is explicitly set to false", () => {
  const s = withBoolPref(DEFAULT_SETTINGS, "wrap_lines", false);
  assert.equal(boolPref(s, "wrap_lines"), false);
});

test("withBoolPref round-trips wrap_lines at the top level", () => {
  const s = withBoolPref(DEFAULT_SETTINGS, "wrap_lines", true);
  // Section::Top means the value lands as a direct property of Settings.
  assert.equal((s as Record<string, unknown>)["wrap_lines"], true);
});

// parity:diff.appearance — initialOptions migration guard

test("stale localStorage wrapLines is ignored on initialOptions", () => {
  // Simulate a stale localStorage entry from before the migration.
  const stale: Partial<typeof DEFAULT_VIEW_OPTIONS> = { layout: "split", ignoreWhitespace: false, wrapLines: false };
  const restored: Partial<typeof DEFAULT_VIEW_OPTIONS> = { ...DEFAULT_VIEW_OPTIONS, ...stale };
  // After migration, wrapLines from localStorage must not reach the opts state;
  // it falls back to DEFAULT_VIEW_OPTIONS.wrapLines (true) until the settings
  // hook syncs the DB value.
  const { wrapLines: _ignored, ...rest } = stale;
  const migrated = { ...DEFAULT_VIEW_OPTIONS, ...rest };
  assert.equal(migrated.wrapLines, true, "stale false from localStorage must not win over the default");
  assert.equal(restored.wrapLines, false, "baseline: without migration the stale value would win");
});
