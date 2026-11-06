import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PALETTE_IDS, paletteFrom } from "./palettes.ts";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule whose selector list contains `selector` exactly. */
function block(selector: string): Map<string, string> {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1]!.split(",").map((s) => s.trim()).includes(selector)) continue;
    return new Map([...m[2]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1]!, d[2]!.trim()]));
  }
  throw new Error(`no rule for ${selector}`);
}
const sel = (id: string, suffix = "") => `:root[data-color-palette="${id}"]${suffix}`;

test("every palette sets the same tokens in light, dark and system dark", () => {
  const names = [...block(sel("neutral")).keys()].sort();
  assert.ok(names.length > 30);
  for (const id of PALETTE_IDS) {
    assert.deepEqual([...block(sel(id)).keys()].sort(), names, `${id} light`);
    assert.deepEqual([...block(sel(id, '[data-theme="dark"]')).keys()].sort(), names, `${id} dark`);
    assert.deepEqual([...block(sel(id, ':not([data-theme="light"])')).keys()].sort(), names, `${id} system dark`);
  }
});

// --warning keeps its amber: like diff and status colours it carries meaning.
const MEANINGFUL = new Set(["--warning"]);

test("Neutral is the default and has no hue: every surface, text and line token has R = G = B", () => {
  assert.equal(paletteFrom(undefined), "neutral");
  assert.equal(paletteFrom("purple"), "neutral");
  for (const suffix of ["", '[data-theme="dark"]', '[data-low-contrast][data-theme="dark"]']) {
    const neutral = block(sel("neutral", suffix));
    assert.deepEqual(block(`:root:not([data-color-palette])${suffix}`), neutral, "no palette attribute means Neutral");
    for (const [name, value] of neutral) {
      if (MEANINGFUL.has(name)) continue;
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(value);
      assert.ok(m, `${name}: ${value} is a hex colour`);
      assert.ok(m[1] === m[2] && m[2] === m[3], `Neutral${suffix} ${name}: ${value} has a hue`);
    }
  }
});

test("Stone keeps Conductor's values for the surfaces Sven compared", () => {
  const light = block(sel("stone"));
  const dark = block(sel("stone", '[data-theme="dark"]'));
  assert.equal(light.get("--highlight"), "#faf7f5");
  assert.equal(dark.get("--highlight"), "#2a1e1d");
  assert.equal(dark.get("--bg"), "#141110");
  assert.equal(dark.get("--sidebar-background"), "#211e1c");
  assert.equal(light.get("--border"), "#eae8e6");
});

test("--unread is Conductor's text-unread colour in every palette: light, dark and system dark", () => {
  // renderApp-BYEcFwvt.css: `:root,.light{--unread:#a4847f}` and `.dark{--unread:#cca694}`.
  assert.equal(block(":root").get("--unread"), "#a4847f");
  assert.equal(block(':root[data-theme="dark"]').get("--unread"), "#cca694");
  assert.equal(block(':root:not([data-theme="light"])').get("--unread"), "#cca694");
});
