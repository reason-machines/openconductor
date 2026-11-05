import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_MONO, monoFontError, monoFontStack, withAppearance, zoomPercent, ZOOM_PERCENTS, zoomStep } from "./appearance.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

test("zoom steps match Conductor: 50% to 300% in 10% steps", () => {
  assert.equal(ZOOM_PERCENTS[0], 50);
  assert.equal(ZOOM_PERCENTS.at(-1), 300);
  assert.equal(ZOOM_PERCENTS.length, 26);
  assert.ok(ZOOM_PERCENTS.includes(100));
});

test("zoomStep moves one step and clamps at both ends", () => {
  assert.equal(zoomStep(1, "in"), 1.1);
  assert.equal(zoomStep(1.1, "in"), 1.2);
  assert.equal(zoomStep(1, "out"), 0.9);
  assert.equal(zoomStep(0.5, "out"), 0.5);
  assert.equal(zoomStep(3, "in"), 3);
  // A stored float that drifted still lands on a whole step.
  assert.equal(zoomPercent(zoomStep(1.2000000000000002, "in")), 130);
});

test("monoFontError mirrors the backend's valid_font_family", () => {
  for (const ok of ["Geist Mono", "iA Writer Mono", "JetBrains Mono NL"]) assert.equal(monoFontError(ok), null, ok);
  for (const bad of ["", "  ", 'Fira"; color: red', "a;b", "x{", "a\\b", "x".repeat(101), "a\nb"]) {
    assert.notEqual(monoFontError(bad), null, JSON.stringify(bad));
  }
});

test("monoFontStack quotes a valid font and falls back otherwise", () => {
  assert.equal(monoFontStack("Geist Mono"), `"Geist Mono", ${BUILTIN_MONO}`);
  assert.equal(monoFontStack(null), BUILTIN_MONO);
  assert.equal(monoFontStack('x"; }'), BUILTIN_MONO);
});

test("withAppearance changes one field and keeps the rest", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, future: 1 } };
  const next = withAppearance(s, "low_contrast_dark_mode", true);
  assert.equal(next.appearance.low_contrast_dark_mode, true);
  assert.equal(next.appearance.zoom_level_v2, 1);
  assert.equal(next.appearance.future, 1);
  assert.equal(next.general, s.general);
});
