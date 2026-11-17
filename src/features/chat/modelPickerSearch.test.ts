import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const path = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_REGRESSION_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");

function section(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from !== -1 && to > from, `ModelPicker source contains ${start} before ${end}`);
  return source.slice(from, to);
}

const listAndControls = section('<div className="oc-model-list">', '<div className="oc-model-footer">');

test("source-only: model search mode treats blank and whitespace queries as the default menu", () => {
  const predicate = source.match(/const searching = ([^;\n]+);/);
  assert.ok(predicate, "ModelPicker declares the search-mode predicate used by its menu controls");
  const searching = new Function("query", `return ${predicate[1]};`);
  for (const query of ["", " ", "\t\n"]) assert.equal(searching(query), false, JSON.stringify(query));
  for (const query of ["sonnet", " sonnet ", "no matching model"]) assert.equal(searching(query), true, JSON.stringify(query));
});

test("source-only: search excludes injected entries, Add models, effort, Fast and their separator", () => {
  assert.match(listAndControls, /\{!searching \? children : null\}/, "injected menu entries are default-menu only");
  assert.match(listAndControls, /\{!searching && onOpenSettings \? \([\s\S]*?Add models/, "Add models is default-menu only");
  assert.match(listAndControls, /\{!searching && \(efforts \|\| fastSupported\) \? <div className="oc-model-sep" \/> : null\}/, "the controls separator is default-menu only");
  assert.match(listAndControls, /\{!searching && efforts \? \([\s\S]*?className="oc-model-sub"/, "the effort trigger and submenu are default-menu only");
  assert.match(listAndControls, /\{!searching && fastSupported \? \(\s*showFast \? fastRow : \(\s*<Tooltip content="Not supported for this model" side="right">\s*<div>\{fastRow\}<\/div>\s*<\/Tooltip>\s*\)\s*\) : null\}/, "both supported and disabled Fast rows are default-menu only");
  const fastRow = section("  const fastRow = (", "  return (");
  assert.match(fastRow, /role="menuitemcheckbox"/);
  assert.match(fastRow, /disabled=\{disabled \|\| !showFast\}/, "the shared Fast row cannot enable an unsupported or disabled picker");
  assert.match(source, /const showFast = fastSupported && fastModeAvailable\(value\.model\);/, "Fast activation still requires model capability");
});

test("source-only: model results, no-match text, search input and footer are not search-hidden", () => {
  const rows = section('<div className="oc-model-list">', "              {items.map");
  assert.match(rows, /items\.length === 0[\s\S]*?No models found/);
  assert.doesNotMatch(rows, /!searching/);
  const results = section("              {items.map", "              })}");
  assert.match(results, /data-model-result=\{index\}/);
  assert.doesNotMatch(results, /!searching/);
  assert.match(source, /<input ref=\{search\} aria-label="Search models"/);
  const footer = source.slice(source.indexOf('<div className="oc-model-footer">'));
  assert.match(footer, /\{onOpenSettings \? \([\s\S]*?className="oc-model-edit"/);
  assert.match(footer, /\{efforts \? \([\s\S]*?Cycle effort/);
  assert.doesNotMatch(footer, /searching|query/);
});
