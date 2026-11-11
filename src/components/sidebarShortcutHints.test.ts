import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { effectiveShortcuts, parseOverrides, type Overrides } from "../keybindings/overrides.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { titleWithShortcut } from "./tooltipPlacement.ts";

const source = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const hintStart = source.indexOf("function hint(");
const hintEnd = source.indexOf("\n}", hintStart);
assert.ok(hintStart >= 0 && hintEnd > hintStart, "Sidebar's production hint function exists");
const hintSource = stripTypeScriptTypes(source.slice(hintStart, hintEnd + 2));
const hint: (commandId: string, overrides: Overrides) => string = new Function(
  "COMMANDS", "effectiveShortcuts", "glyphs", `${hintSource}\nreturn hint;`,
)(COMMANDS, effectiveShortcuts, glyphs);

const rows = [
  { label: "Home", commandId: "nav.home", defaultHint: "⌘⇧H" },
  { label: "Create", commandId: "workspace.create", defaultHint: "⌘N" },
  { label: "Search", commandId: "toggleCommandPalette", defaultHint: "⌘K" },
];

function rowSource(label: string): string {
  const row = source.split("\n").find((line) => line.includes("<NavRow ") && line.includes(`label="${label}"`));
  assert.ok(row, `Sidebar renders its ${label} navigation row`);
  return row;
}

function attribute(label: string, name: string, overrides: Overrides): unknown {
  const expression = rowSource(label).match(new RegExp(`\\b${name}=\\{([^}]+)\\}`))?.[1];
  assert.ok(expression, `${label} has a production ${name} expression`);
  return new Function(
    "hint", "overrides", "effectiveShortcuts", "glyphs", "titleWithShortcut", `return ${expression};`,
  )(hint, overrides, effectiveShortcuts, glyphs, titleWithShortcut);
}

function rowHints(label: string, overrides: Overrides): readonly string[] {
  const value = attribute(label, "shortcut", overrides);
  if (typeof value === "string") return value ? [value] : [];
  assert.ok(Array.isArray(value) && value.every((entry) => typeof entry === "string"), `${label} supplies shortcut glyphs`);
  return value;
}

function snapshot(primary: string, additional: string): Overrides {
  const overrides = Object.fromEntries(rows.map(({ commandId }) => [commandId, [
    { key: { kind: "logical", value: primary }, modifiers: ["meta", "shift"] },
    { key: { kind: "logical", value: additional }, modifiers: ["meta"] },
  ]]));
  const parsed = parseOverrides(JSON.stringify({ version: 1, overrides }));
  for (const { commandId } of rows) {
    assert.equal(parsed[commandId]?.length, 2, `${commandId}'s saved fixture is accepted by the real parser`);
  }
  return parsed;
}

const remapped = snapshot("y", "j");
const changed = snapshot("u", "l");

test("actual Sidebar navigation expressions retain default shortcut hints", () => {
  for (const { label, defaultHint } of rows) assert.deepEqual(rowHints(label, {}), [defaultHint]);
  assert.equal(attribute("Home", "title", {}), "Home ⌘⇧H");
});

for (const { label } of rows) {
  test(`actual Sidebar ${label} expression displays primary and additional saved replacements`, () => {
    assert.deepEqual(rowHints(label, remapped), ["⌘⇧Y", "⌘J"]);
  });
}

test("actual Sidebar navigation expressions follow changed snapshots and reset to defaults", () => {
  for (const { label, defaultHint } of rows) {
    assert.deepEqual(rowHints(label, remapped), ["⌘⇧Y", "⌘J"]);
    assert.deepEqual(rowHints(label, changed), ["⌘⇧U", "⌘L"]);
    assert.deepEqual(rowHints(label, {}), [defaultHint]);
  }
});

test("actual Sidebar Home title uses the effective primary key without adding Create or Search titles", () => {
  assert.equal(attribute("Home", "title", remapped), "Home ⌘⇧Y");
  assert.equal(attribute("Home", "title", changed), "Home ⌘⇧U");
  assert.equal(attribute("Home", "title", {}), "Home ⌘⇧H");
  assert.doesNotMatch(rowSource("Create"), /\btitle=/);
  assert.doesNotMatch(rowSource("Search"), /\btitle=/);
});

test("Sidebar reads the live provider snapshot used by its navigation expressions", () => {
  const component = source.slice(source.indexOf("export function Sidebar("));
  assert.match(source, /import\s*\{[^}]*\buseKeybindingOverrides\b[^}]*\}\s*from\s*["']\.\.\/keybindings\/KeybindingsProvider["']/);
  assert.match(component, /const\s*\{\s*overrides\s*\}\s*=\s*useKeybindingOverrides\(\)/);
});
