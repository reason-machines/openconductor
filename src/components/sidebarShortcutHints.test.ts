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
  // Home switched from native title= to <Tooltip> via NavRow's tooltip prop.
  assert.match(rowSource("Home"), /\btooltip=/, "Home NavRow carries a tooltip prop");
  assert.doesNotMatch(rowSource("Home"), /\btitle=/, "Home NavRow omits the native title=");
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

test("actual Sidebar Home uses a Tooltip shortcut-hint without adding title= or tooltip= to Create or Search", () => {
  // Home uses <Tooltip> via NavRow's tooltip prop; the command ID must be present and must
  // resolve to the right glyphs at every override level.
  const homeRow = rowSource("Home");
  assert.match(homeRow, /\btooltip=/, "Home NavRow has a tooltip prop");
  assert.doesNotMatch(homeRow, /\btitle=/, "Home NavRow omits native title=");
  assert.match(homeRow, /"nav\.home"/, "Home tooltip references the nav.home command ID");
  assert.equal(hint("nav.home", {}), "⌘⇧H");
  assert.equal(hint("nav.home", remapped), "⌘⇧Y");
  assert.equal(hint("nav.home", changed), "⌘⇧U");
  // Create and Search retain no title= (unchanged) and no tooltip=.
  assert.doesNotMatch(rowSource("Create"), /\btitle=|\btooltip=/);
  assert.doesNotMatch(rowSource("Search"), /\btitle=|\btooltip=/);
});

test("Sidebar reads the live provider snapshot used by its navigation expressions", () => {
  const component = source.slice(source.indexOf("export function Sidebar("));
  assert.match(source, /import\s*\{[^}]*\buseKeybindingOverrides\b[^}]*\}\s*from\s*["']\.\.\/keybindings\/KeybindingsProvider["']/);
  assert.match(component, /const\s*\{\s*overrides\s*\}\s*=\s*useKeybindingOverrides\(\)/);
});
