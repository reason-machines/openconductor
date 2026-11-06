import { test } from "node:test";
import assert from "node:assert/strict";
import { findColors } from "./check-colors.mjs";

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
