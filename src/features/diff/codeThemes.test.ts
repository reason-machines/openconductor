import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_THEME_IDS, CODE_THEMES, codeThemeFrom, diffThemeFor, shikiNameOf, shikiTheme } from "./codeThemes.ts";
import { colorVisionFrom, diffRootVars } from "./appearance.ts";
import { PIERRE_THEME } from "./pierre.ts";

test("the eight code themes Conductor offers, one mode each (Latte light)", () => {
  assert.deepEqual(CODE_THEME_IDS, ["catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha", "dracula", "nord", "tokyo-night", "gruvbox-dark", "solarized-dark"]);
  assert.deepEqual(
    CODE_THEME_IDS.filter((id) => CODE_THEMES[id].mode === "light"),
    ["catppuccin-latte"],
  );
});

test("Shiki names: the id for a dark theme, <id>-light for a light one", () => {
  assert.equal(shikiNameOf("dracula"), "dracula");
  assert.equal(shikiNameOf("catppuccin-latte"), "catppuccin-latte-light");
});

test("Pierre theme: chosen theme on its own mode, default on the other", () => {
  assert.deepEqual(diffThemeFor("default"), PIERRE_THEME);
  assert.deepEqual(diffThemeFor("tokyo-night"), { dark: "tokyo-night", light: PIERRE_THEME.light });
  assert.deepEqual(diffThemeFor("catppuccin-latte"), { dark: PIERRE_THEME.dark, light: "catppuccin-latte-light" });
});

test("unknown stored values fall back to defaults", () => {
  assert.equal(codeThemeFrom("neon"), "default");
  assert.equal(codeThemeFrom(undefined), "default");
  assert.equal(codeThemeFrom("nord"), "nord");
  assert.equal(colorVisionFrom("purple"), "default");
  assert.equal(colorVisionFrom("tritanopia"), "tritanopia");
});

test("a Shiki theme carries its palette and type", () => {
  const t = shikiTheme("nord", CODE_THEMES.nord);
  assert.equal(t.type, "dark");
  assert.equal(t.bg, "var(--syntax-nord-bg)");
  const kw = t.tokenColors.find((r) => "scope" in r && r.scope?.includes("keyword"));
  assert.equal(kw?.settings.foreground, CODE_THEMES.nord.palette.keyword);
});

test("root vars: mono font as the diff font; ligatures on unless switched off", () => {
  const on = diffRootVars({ mono_font_stack: '"Fira Code", monospace' });
  assert.equal(on["--diffs-font-family"], '"Fira Code", monospace');
  assert.equal(on["--file-code-font-variant-ligatures"], "normal");
  const off = diffRootVars({ mono_font_stack: "monospace", file_ligatures_enabled: false });
  assert.equal(off["--file-code-font-variant-ligatures"], "none");
  assert.equal(off["--diffs-font-features"], '"liga" 0, "calt" 0');
});
