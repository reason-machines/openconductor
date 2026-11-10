import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

const source = readFileSync(new URL("./AppearancePage.tsx", import.meta.url), "utf8");
const input = source.match(/<input\s+type="text"\s+className="settings-field"\s+aria-label="Custom mono font"[\s\S]*?\n            \/>/u)?.[0];
assert.ok(input, "the production custom mono-font input exists");
const attribute = input.match(/onChange=\{([\s\S]*?)\}\s*onBlur=/u)?.[1];
assert.ok(attribute, "the production input has a change callback");
assert.doesNotMatch(attribute, /commitCustom|onBlur|onKeyDown/);
const appearance = stripTypeScriptTypes(readFileSync(new URL("./appearance.ts", import.meta.url), "utf8"));
const helpers = ["monoFontError", "withAppearance"].map((name) => {
  const match = appearance.match(new RegExp(`export function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} production helper exists`);
  return match[0].replace(/^export /, "");
}).join("\n");
const change = new Function("e", "setCustom", "settings", "save", "saved", `${helpers}\nreturn (${attribute})(e);`);

function inputChange(value: string, saved = "Old Font") {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    appearance: { ...DEFAULT_SETTINGS.appearance, mono_font: saved, terminal_font_size: 17 },
  };
  let draft = saved;
  const saves: Settings[] = [];
  change({ target: { value } }, (next: string) => { draft = next; }, settings, (next: Settings) => saves.push(next), saved);
  return { draft, saves, settings };
}

test("source-only: custom mono-font changes save valid edits without blur or Enter", () => {
  for (const value of ["FiraCode Nerd Font", "  Blåbær Mono  "]) {
    const { draft, saves, settings } = inputChange(value);
    assert.equal(draft, value);
    assert.equal(saves.length, 1, "onChange must save the valid mono font directly");
    assert.deepEqual(saves[0], {
      ...settings,
      appearance: { ...settings.appearance, mono_font: value.trim() },
    });
    assert.equal(settings.appearance.mono_font, "Old Font");
  }
});

test("source-only: invalid and empty mono-font drafts stay local without saving", () => {
  for (const value of ["", "   ", 'Fira";color:red', "a;b", "x{", "a\\b", "x".repeat(101), "a\nb"]) {
    const { draft, saves } = inputChange(value);
    assert.equal(draft, value);
    assert.deepEqual(saves, []);
  }
});

test("source-only: unchanged normalized mono-font edits do not save", () => {
  for (const value of ["Old Font", "  Old Font  "]) {
    const { draft, saves } = inputChange(value);
    assert.equal(draft, value);
    assert.deepEqual(saves, []);
  }
});

test("source-only: each valid changed mono-font event forwards its current value", () => {
  for (const value of ["F", "Fi", "Fira", "Fira C"]) {
    const { saves } = inputChange(value);
    assert.equal(saves.length, 1, "each valid changed edit must be forwarded");
    assert.equal(saves[0].appearance.mono_font, value);
  }
});
