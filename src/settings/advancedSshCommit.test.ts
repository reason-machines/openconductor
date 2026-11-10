import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

const source = readFileSync(new URL("./AdvancedPage.tsx", import.meta.url), "utf8");
const row = source.slice(source.indexOf("function PathRow("), source.indexOf("function ScrollbackRow("));
const input = row.match(/<input[\s\S]*?\n        \/>/u)?.[0];
assert.ok(input, "the production SSH input exists");
const changeAttribute = input.match(/onChange=\{([\s\S]*?)\}\s*onBlur=/u)?.[1];
assert.ok(changeAttribute, "the production SSH input has a change callback");
const change = new Function("e", "setText", "onChange", `return (${changeAttribute})(e);`);
const topLevel = readFileSync(new URL("./agentSettings.ts", import.meta.url), "utf8")
  .match(/export function withTopLevel\([\s\S]*?\n\}/u)?.[0];
assert.ok(topLevel, "the existing top-level setting mapper exists");
const helpers = stripTypeScriptTypes(topLevel.replace(/^export /u, ""));

function saveThrough(attribute: "onChange" | "onSave", value: string) {
  const usage = source.match(/<PathRow\s[\s\S]*?\n      \/>/u)?.[0];
  assert.ok(usage, "Advanced renders the SSH row");
  const pattern = attribute === "onChange"
    ? /onChange=\{([\s\S]*?)\}\n\s*onSave=/u
    : /onSave=\{([\s\S]*?)\}\n\s*\/>/u;
  const callback = usage.match(pattern)?.[1];
  assert.ok(callback, `the production SSH row passes ${attribute}`);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ssh_key_path: "synthetic-original-key",
    appearance: { ...DEFAULT_SETTINGS.appearance, terminal_font_size: 17 },
    git: { ...DEFAULT_SETTINGS.git, worktree_push_auto_setup_remote: false },
  };
  const before = structuredClone(settings);
  const saved: Settings[] = [];
  new Function("value", "settings", "save", `${helpers}\nreturn (${callback})(value);`)(
    value, settings, (next: Settings) => saved.push(next),
  );
  assert.deepEqual(settings, before, "the callback must not mutate the previous settings");
  return { saved, settings };
}

test("source-only: SSH edits forward their raw value without blur or Enter", () => {
  for (const value of ["s", "synthetic-edited-key", "", "   ", "  synthetic padded key  ", "synthetic-雪-æ-key"]) {
    let draft = "synthetic-original-key";
    const forwarded: string[] = [];
    change({ target: { value } }, (next: string) => { draft = next; }, (next: string) => forwarded.push(next));
    assert.equal(draft, value);
    assert.deepEqual(forwarded, [value], "each onChange must forward its current raw value directly");
  }
});

test("source-only: every SSH change event forwards once, including repeated and clearing values", () => {
  const values = ["s", "sy", "synthetic", "synthetic", "", " ", "synthetic-final"];
  const drafts: string[] = [];
  const forwarded: string[] = [];
  for (const value of values) {
    change({ target: { value } }, (next: string) => drafts.push(next), (next: string) => forwarded.push(next));
  }
  assert.deepEqual(drafts, values);
  assert.deepEqual(forwarded, values);
});

test("source-only: the SSH edit callback saves raw strings and preserves every other setting", () => {
  for (const value of ["synthetic-edited-key", "", "   ", "  synthetic padded key  ", "synthetic-雪-æ-key"]) {
    const { saved, settings } = saveThrough("onChange", value);
    assert.deepEqual(saved, [{ ...settings, ssh_key_path: value }]);
    assert.equal(saved[0].appearance, settings.appearance);
    assert.equal(saved[0].git, settings.git);
    assert.equal(saved[0].models, settings.models);
  }
});

test("source-only: the separate SSH browse/reset save mapper keeps its existing normalization", () => {
  for (const { value, expected } of [
    { value: "  synthetic-picked-key  ", expected: "synthetic-picked-key" },
    { value: "", expected: null },
    { value: "   ", expected: null },
  ]) {
    const { saved, settings } = saveThrough("onSave", value);
    assert.deepEqual(saved, [{ ...settings, ssh_key_path: expected }]);
  }
});
