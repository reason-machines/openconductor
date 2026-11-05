#!/usr/bin/env node
// Extract Conductor's keyboard shortcut registry from the decoded frontend
// bundle into evidence/keybindings/keybindings.json.
//
// Input: the decoded main chunk (assets/index-*.js from
// tools/extract_tauri_assets.py), which stays outside this repository. The
// registry is one object literal built with two constructors, a logical key
// `he({key,modifiers})` and a physical key `pn({code,display,modifiers})`,
// plus modifier-array constants. We slice literals out by brace matching and
// evaluate only those literals in an empty VM context holding our own stub
// constructors, so no Conductor function runs. An unknown identifier in a
// literal makes evaluation fail loudly.
//
// Everything pulled out is untrusted data (strings from a third-party app).
//
// Usage: node tools/keybindings_extract.mjs <decoded index-*.js> [out.json]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const [, , input, output = "evidence/keybindings/keybindings.json"] = process.argv;
if (!input) {
  console.error("usage: keybindings_extract.mjs <decoded index-*.js> [out.json]");
  process.exit(2);
}
const src = readFileSync(input, "utf8");

/** The balanced `{...}` or `[...]` literal starting at `start` (string-aware). */
function balanced(text, start) {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unbalanced literal at ${start}`);
}

/** The innermost-assigned `name={...}` literal whose text contains `marker`. */
function literalContaining(marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  for (let i = at; i >= 0; i--) {
    if (src[i] !== "{" || src[i - 1] !== "=") continue;
    const lit = balanced(src, i);
    if (i + lit.length > at) return { lit, offset: i, name: src.slice(0, i - 1).match(/([A-Za-z_$][\w$]*)$/)[1] };
  }
  throw new Error(`no literal around ${marker}`);
}

/** A JSON-compatible array literal that starts with `prefix`. */
function arrayStartingWith(prefix) {
  const at = src.indexOf(`=${prefix}`);
  if (at < 0) throw new Error(`array not found: ${prefix}`);
  return JSON.parse(balanced(src, at + 1));
}

const registry = literalContaining('"workspace.addToBacklogFromComposer":{id:');

// Modifier constants (`Qe=["meta"],ws=["meta","shift"],...`) precede the registry.
const pre = src.slice(Math.max(0, registry.offset - 6000), registry.offset);
const constants = {};
for (const m of pre.matchAll(/([A-Za-z_$][\w$]*)=(\[(?:"(?:meta|ctrl|alt|shift)",?)+\])/g)) {
  constants[m[1]] = JSON.parse(m[2]);
}
const ctor = (kind) => {
  const re =
    kind === "logical"
      ? /([A-Za-z_$][\w$]*)=\(\{key:\w,modifiers:\w\}\)=>\(\{key:\{kind:"logical"/
      : /([A-Za-z_$][\w$]*)=\(\{code:\w,display:\w,modifiers:\w\}\)=>\(\{key:\{kind:"physical"/;
  return src.match(re)[1];
};
const withMods = (key, modifiers) => ({ key, ...(modifiers ? { modifiers } : {}) });
const sandbox = {
  [ctor("logical")]: ({ key, modifiers }) => withMods({ kind: "logical", value: key }, modifiers),
  [ctor("physical")]: ({ code, display, modifiers }) => withMods({ kind: "physical", code, display }, modifiers),
  ...constants,
};
const evalLiteral = (lit) => vm.runInNewContext(`(${lit})`, sandbox, { timeout: 1000 });

// Send-key presets (`enter` / `cmd-enter`); chat commands take their default from it.
const presets = literalContaining('"cmd-enter":{"chat.newLine"');
sandbox[presets.name] = evalLiteral(presets.lit);
const commands = Object.values(evalLiteral(registry.lit));
const opAt = src.indexOf("function op(");
const scopeGroups = [];
for (const m of src.slice(opAt, opAt + 6000).matchAll(/op\(\[/g)) {
  scopeGroups.push(JSON.parse(balanced(src, opAt + m.index + 3)));
}

const out = {
  source: {
    app: "Conductor.app v0.87.6",
    chunk: input.split("/").pop(),
    sha256: createHash("sha256").update(src).digest("hex"),
    note: "Derived data. Strings are untrusted third-party text, kept only to match behaviour.",
  },
  storageKey: src.match(/="(keybinding_overrides_v\d+)"/)[1],
  categoryOrder: arrayStartingWith('["General","View","Navigation"'),
  sendKeyPresets: sandbox[presets.name],
  conflictScopes: { base: arrayStartingWith('["toggleCommandPalette","toggleTheme"'), groups: scopeGroups },
  legacyAliases: evalLiteral(literalContaining('"chat.composer.submitWithCommandEnter":"chat.submitMessage"').lit),
  commands,
};

// One field per line and one command per line keep diffs reviewable.
const fields = Object.entries(out).map(([k, v]) =>
  k === "commands"
    ? `  "commands": [\n${v.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]`
    : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
);
const lines = `{\n${fields.join(",\n")}\n}`;
writeFileSync(output, lines + "\n");
console.log(`${commands.length} commands, ${scopeGroups.length} scope groups -> ${output}`);
