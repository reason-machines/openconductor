import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_TOKENS, DEFAULT_PALETTE, FIXED_TOKENS, PALETTE_IDS, PALETTES, applyPalette, paletteCss, paletteFrom } from "./palettes.ts";

/** The RGB channels of a #rgb, #rgba, #rrggbb or #rrggbbaa colour; alpha is ignored. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
const achromatic = (hex: string) => {
  const [r, g, b] = channels(hex);
  return r === g && g === b;
};

/** Status and diff colours carry meaning, so they may have a hue in Neutral. */
const MEANING = new Set(["success", "warning", "destructive", "diff-addition", "diff-deletion", "diff-modified"]);

test("every palette defines every base token in light and dark", () => {
  for (const id of PALETTE_IDS) {
    for (const mode of ["light", "dark"] as const) {
      for (const token of BASE_TOKENS) {
        assert.match(PALETTES[id][mode][token], /^#[0-9a-f]{6,8}$/i, `${id} ${mode} ${token}`);
      }
    }
    for (const token of Object.keys(PALETTES[id].lowContrast)) {
      assert.ok((BASE_TOKENS as readonly string[]).includes(token), `${id} low-contrast ${token} is not a base token`);
    }
  }
});

test("Neutral is the default and has no hue outside status and diff colours", () => {
  assert.equal(DEFAULT_PALETTE, "neutral");
  for (const mode of ["light", "dark"] as const) {
    for (const token of BASE_TOKENS) {
      if (MEANING.has(token)) continue;
      assert.ok(achromatic(PALETTES.neutral[mode][token]), `neutral ${mode} ${token} = ${PALETTES.neutral[mode][token]}`);
    }
  }
  for (const [token, value] of Object.entries(PALETTES.neutral.lowContrast)) {
    if (!MEANING.has(token)) assert.ok(achromatic(value as string), `neutral low-contrast ${token}`);
  }
});

test("the accent in Neutral is black on light and white on dark", () => {
  assert.equal(PALETTES.neutral.light.primary, "#171717");
  assert.equal(PALETTES.neutral.dark.primary, "#fafafa");
  assert.equal(PALETTES.neutral.light.ring, "#171717");
});

test("Stone is Conductor's warm palette verbatim", () => {
  assert.equal(PALETTES.stone.light.background, "#ffffff");
  assert.equal(PALETTES.stone.light.primary, "#413030");
  assert.equal(PALETTES.stone.light.border, "#eae8e6");
  assert.equal(PALETTES.stone.dark.background, "#141110");
  assert.equal(PALETTES.stone.dark.sidebar, "#211e1c");
  assert.equal(PALETTES.stone.dark.border, "#ffffff1a");
  assert.equal(PALETTES.stone.lowContrast.background, "#1f1c1a");
  assert.equal(PALETTES.stone.lowContrast.sidebar, "#292623");
});

test("paletteFrom keeps known palettes and falls back to Neutral", () => {
  for (const id of PALETTE_IDS) assert.equal(paletteFrom(id), id);
  assert.equal(paletteFrom("sepia"), "neutral");
  assert.equal(paletteFrom(undefined), "neutral");
  assert.equal(paletteFrom(42), "neutral");
});

test("the generated stylesheet scopes each palette by data-color-palette and mode", () => {
  const css = paletteCss();
  for (const id of PALETTE_IDS) {
    assert.ok(css.includes(`:root[data-color-palette="${id}"] {`), `${id} light block`);
    assert.ok(css.includes(`:root[data-color-palette="${id}"][data-theme="dark"] {`), `${id} dark block`);
    assert.ok(css.includes(`:root[data-color-palette="${id}"][data-low-contrast][data-theme="dark"] {`), `${id} low-contrast block`);
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{/);
  assert.ok(css.includes(`  --background: ${PALETTES.stone.dark.background};`));
  assert.ok(css.includes(`  --status-merged: ${FIXED_TOKENS.light["status-merged"]};`));
  // The palette holds literal values only: nothing in it refers to another variable.
  assert.ok(!css.includes("var("), "palette values are literal colours");
});

test("applyPalette sets the palette attribute on the root", () => {
  const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
  applyPalette("slate", root);
  assert.equal(root.dataset.colorPalette, "slate");
});
