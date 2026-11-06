#!/usr/bin/env node
// Fails when app source has a colour literal outside src/theme/: a hex colour,
// rgb()/rgba()/hsl()/hsla()/oklch()/oklab()/hwb(), a named colour in a CSS
// value, or a Tailwind colour class. Every colour belongs in
// src/theme/tokens.css; components use its variables (var(--text), ...).
//
//   node scripts/check-colors.mjs            scan src/ and index.html
//   node scripts/check-colors.mjs <files>    scan only these files
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTENSIONS = /\.(css|ts|tsx|js|jsx|mjs|html|svg)$/;
const ALLOWED_DIR = `src${sep}theme${sep}`;

const HEX = "[0-9a-fA-F]";
const HEX_COLOR = `#(?:${HEX}{8}|${HEX}{6}|${HEX}{3,4})(?![\\w-])`;
const NAMED = "white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta";
const TW_HUE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TW_PREFIX = "bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|decoration|shadow";

const RULES = [
  // In CSS any hex is a colour; in scripts and markup only one in a string or style
  // value ("#fff", fill="#fff", `color: #fff`), so "PR #128" and "#106" are not.
  { name: "hex colour", css: new RegExp(`(?<![\\w&-])${HEX_COLOR}`, "g"), other: new RegExp(`(?<=["'\`(]|:\\s?)${HEX_COLOR}`, "g") },
  { name: "colour function", any: /(?<![\w-])(?:rgba?|hsla?|oklch|oklab|hwb)\(/g },
  { name: "named colour", css: new RegExp(`(?<=:[^;{}]*)(?<![\\w-])(?:${NAMED})(?![\\w-])`, "g") },
  { name: "Tailwind colour class", any: new RegExp(`(?<![\\w-])(?:${TW_PREFIX})-(?:(?:${TW_HUE})-(?:50|[1-9]00|950)|white|black)(?![\\w-])`, "g") },
];

/** Removes comments, keeping line numbers. */
function stripComments(text, isCss) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (isCss) return out;
  out = out.replace(/<!--[\s\S]*?-->/g, blank);
  // `//` comments, but not `://` in URLs.
  return out.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

/** Colour literals in one file's text: [{ line, rule, match }]. */
export function findColors(text, path) {
  const isCss = path.endsWith(".css");
  const lines = stripComments(text, isCss).split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      const re = rule.any ?? (isCss ? rule.css : rule.other);
      if (!re) continue;
      for (const m of line.matchAll(re)) hits.push({ line: i + 1, rule: rule.name, match: m[0] });
    }
  });
  return hits;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTENSIONS.test(name)) out.push(p);
  }
  return out;
}

function main(args) {
  const files = args.length ? args.map((f) => join(process.cwd(), f)) : [...walk(join(ROOT, "src")), join(ROOT, "index.html")];
  let count = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel.startsWith(ALLOWED_DIR)) continue;
    for (const hit of findColors(readFileSync(file, "utf8"), rel)) {
      console.error(`${rel}:${hit.line}: ${hit.rule} ${hit.match}`);
      count++;
    }
  }
  if (count) {
    console.error(`\n${count} colour literal(s) outside src/theme/. Use a token from src/theme/tokens.css (add one there if none fits).`);
    process.exit(1);
  }
  console.log(`check-colors: no colour literals outside src/theme/ (${files.length} files).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
