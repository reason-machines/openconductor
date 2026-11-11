import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findColors, findNeutralLeaks, hasHue, neutralModes } from "./check-colors.mjs";

const rules = (text, path) => findColors(text, path).map((h) => `${h.rule}: ${h.match}`);

test("flags the literals main had before tokens.css", () => {
  // The dialog's bluish panel, a menu shadow, the Stone user bubble, the logo fill.
  assert.deepEqual(rules("  --panel: #1d2025;\n.menu { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18); }", "a.css"), ["hex colour: #1d2025", "colour function: rgba("]);
  assert.deepEqual(rules('.transcript { --oc-highlight: #faf7f5; --oc-input: #fff3; }', "a.css"), ["hex colour: #faf7f5", "hex colour: #fff3"]);
  assert.deepEqual(rules('<rect fill="#262e40" />', "a.tsx"), ["hex colour: #262e40"]);
  assert.deepEqual(rules('background: cssVar("--panel", "#1d2025"),', "a.ts"), ["hex colour: #1d2025"]);
  assert.deepEqual(rules("--code-bg: hsl(30 9% 95%);", "a.css"), ["colour function: hsl("]);
  assert.deepEqual(rules(".x { color: white; }", "a.css"), ["named colour: white"]);
  assert.deepEqual(rules('<div className="bg-blue-500 text-white" />', "a.tsx"), ["Tailwind colour class: bg-blue-500", "Tailwind colour class: text-white"]);
});

test("ignores issue numbers, comments, token names and non-colour words", () => {
  assert.deepEqual(rules('assert.equal(fromLabel(pr), "PR #128 Fix login redirect");', "a.test.ts"), []);
  assert.deepEqual(rules("// Keeps a transcript across restarts (issue #272).\n/**\n * of origin (#106).\n */", "a.ts"), []);
  assert.deepEqual(rules("/* was #14100f0d light, #ffffff0d dark */\n.x { color: var(--collab-blue); white-space: nowrap; }", "a.css"), []);
  assert.deepEqual(rules('.n[data-color="blue"] { color: var(--tint-blue-600); }', "a.css"), []);
  assert.deepEqual(rules('const url = "https://example.com/#abc";', "a.ts"), []);
});

// A cut-down tokens.css: Neutral greys, one fixed Stone token, one meaningful hue.
const TOKENS = `
:root { --conductor-accent: #fafaf9; --success: #16a34a; --mix: color-mix(in srgb, var(--conductor-accent) 50%, transparent); }
:root[data-theme="dark"] { --conductor-accent: #2c2826; }
:root:not([data-color-palette]), :root[data-color-palette="neutral"] { --bg: #ffffff; --surface-accent: #f5f5f5; }
:root[data-color-palette="neutral"][data-theme="dark"] { --bg: #0a0a0a; --surface-accent: #262626; }
:root[data-color-palette="neutral"][data-low-contrast][data-theme="dark"] { --bg: #1c1c1c; }
`;
const leaks = (text) => findNeutralLeaks(text, "a.css", neutralModes(TOKENS)).map((h) => `${h.line} ${h.token} ${h.mode} ${h.value}`);

test("flags a fixed Stone token under Neutral: the Agents auth cards' leak before the fix", () => {
  // agents.css on main mapped the card surfaces to Conductor's Stone values.
  assert.deepEqual(leaks(".oc-ag {\n  --ag-accent: var(--conductor-accent);\n}"), ["2 --conductor-accent light #fafaf9"]);
  assert.deepEqual(leaks(".x { background: var(--mix); }"), ["1 --mix light color-mix(in srgb, var(--conductor-accent) 50%, transparent)"]);
});

test("passes palette tokens and colours that carry meaning", () => {
  assert.deepEqual(leaks(".oc-ag { --ag-accent: var(--surface-accent); --ag-bg: var(--bg); color: var(--success); }"), []);
  assert.deepEqual(leaks("/* var(--conductor-accent) */ .x { color: var(--undefined-token); }"), []);
});

test("hasHue reads hex, short hex, alpha hex, hsl() and rgb()", () => {
  const none = new Map();
  for (const v of ["#262626", "#fff", "#ffffff1a", "hsl(0 0% 50%)", "rgb(20, 20, 20)", "transparent"]) assert.equal(hasHue(v, none), false, v);
  for (const v of ["#2c2826", "#fea", "#14100f1a", "hsl(30 8% 91%)", "rgb(44, 40, 38)"]) assert.equal(hasHue(v, none), true, v);
});

test("the real tokens.css: Neutral has no hue in the Agents page's palette tokens", () => {
  const modes = neutralModes(readFileSync(new URL("../src/theme/tokens.css", import.meta.url), "utf8"));
  const css = readFileSync(new URL("../src/settings/agents/agents.css", import.meta.url), "utf8");
  assert.deepEqual(findNeutralLeaks(css, "src/settings/agents/agents.css", modes), []);
});
