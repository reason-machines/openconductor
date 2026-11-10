import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

const source = readFileSync(new URL("./TerminalFont.tsx", import.meta.url), "utf8");
const inputStart = source.indexOf("<input\n");
const input = source.slice(inputStart, source.indexOf("\n      />", inputStart));
const changeStart = input.indexOf("onChange={");
const changeEnd = input.indexOf("\n        onBlur=", changeStart);
assert.ok(inputStart >= 0 && changeStart >= 0 && changeEnd > changeStart);
const attribute = input.slice(changeStart, changeEnd).trim();
assert.ok(attribute.endsWith("}"));
assert.doesNotMatch(attribute, /onBlur|onKeyDown|commitFamily/);
const callback = attribute.slice("onChange={".length, -1);
const appearance = stripTypeScriptTypes(readFileSync(new URL("./appearance.ts", import.meta.url), "utf8"));
const helpers = ["monoFontError", "withAppearance"].map((name) => {
  const match = appearance.match(new RegExp(`export function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} production helper exists`);
  return match[0].replace(/^export /, "");
}).join("\n");
const change = new Function("e", "setFamily", "settings", "save", "saved", `${helpers}\nreturn (${callback})(e);`);

function inputChange(value: string, saved = "Geist Mono") {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    appearance: { ...DEFAULT_SETTINGS.appearance, terminal_font_family: saved, terminal_font_size: 15 },
  };
  let draft = saved;
  const saves: Settings[] = [];
  change({ target: { value } }, (next: string) => { draft = next; }, settings, (next: Settings) => saves.push(next), saved);
  return { draft, saves, settings };
}

test("source-only: the family change callback saves a valid edited value without blur or Enter", () => {
  const { draft, saves, settings } = inputChange("  JetBrains Mono  ");
  assert.equal(draft, "  JetBrains Mono  ");
  assert.equal(saves.length, 1, "onChange must save the valid family directly");
  assert.deepEqual(saves[0], {
    ...settings,
    appearance: { ...settings.appearance, terminal_font_family: "JetBrains Mono" },
  });
  assert.equal(settings.appearance.terminal_font_family, "Geist Mono");
});

test("source-only: empty family changes save the existing null reset mapping", () => {
  for (const value of ["", "   "]) {
    const { draft, saves } = inputChange(value);
    assert.equal(draft, value);
    assert.equal(saves.length, 1, "onChange must save the reset directly");
    assert.equal(saves[0].appearance.terminal_font_family, null);
  }
});

test("source-only: invalid family changes stay local and never save", () => {
  for (const value of ['Fira"; color: red', "a;b", "x{", "a\\b", "x".repeat(101), "a\nb"]) {
    const { draft, saves } = inputChange(value);
    assert.equal(draft, value);
    assert.deepEqual(saves, []);
  }
  assert.match(source, /const error = family\.trim\(\) === "" \? null : monoFontError\(family\)/);
  assert.match(input, /aria-invalid=\{error !== null\}/);
});

test("source-only: unchanged normalized family changes do not save", () => {
  for (const value of ["Geist Mono", "  Geist Mono  "]) assert.deepEqual(inputChange(value).saves, []);
  assert.deepEqual(inputChange("", "").saves, []);
});
