#!/usr/bin/env node
// Fails when a component hard-codes a colour. Every colour in the app comes
// from a semantic CSS variable (src/theme/palettes.ts sets them, src/theme/
// tokens.css derives the rest), so these forms are errors outside the allowlist:
//   - hex colours (#rgb, #rgba, #rrggbb, #rrggbbaa)
//   - functional colours (rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color())
//   - Tailwind colour classes (bg-blue-500, text-stone-700, ...)
//   - the CSS keywords white and black used as a colour value
// Comments are not checked. Run: npm run lint:colors
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Where literal colours are allowed, and why:
const ALLOW = [
  // The palette source: the only place colour values are written.
  { re: /^src\/theme\//, why: "the palette source" },
  // Vendor syntax-highlighting themes (Catppuccin, Dracula, ...): data, one table per theme.
  { re: /^src\/features\/diff\/codeThemes(\.test)?\.ts$/, why: "vendor syntax theme tables" },
  // Conductor's app icon artwork, drawn as SVG fills.
  { re: /^src\/components\/Icons\.tsx$/, why: "Conductor app icon artwork" },
  // Tests may use fixture colours.
  { re: /\.test\.tsx?$/, why: "test fixtures" },
];

const TAILWIND = /(?:^|[\s"'`{:])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|divide|accent|caret|placeholder|decoration|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const KEYWORD_CSS = /:\s*(?:white|black)\s*(?:[;}!,)]|$)/;

/** Blank out comments, keeping line numbers. */
export function stripComments(src, file) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // `//` line comments, but not inside a URL like https://
  out = out.replace(/(^|[^:"'`\w])\/\/.*$/gm, (m, pre) => pre + " ".repeat(m.length - pre.length));
  return out;
}

export function scanSource(file, src) {
  const problems = [];
  const lines = stripComments(src, file).split("\n");
  const css = file.endsWith(".css");
  lines.forEach((line, i) => {
    const hits = [];
    if (HEX.test(line)) hits.push("hex colour");
    if (FUNC.test(line)) hits.push("functional colour (rgb/hsl/oklch/...)");
    if (TAILWIND.test(line)) hits.push("Tailwind colour class");
    if (css && KEYWORD_CSS.test(line)) hits.push("white/black keyword");
    for (const h of hits) problems.push({ file, line: i + 1, what: h, text: line.trim().slice(0, 160) });
  });
  return problems;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(css|ts|tsx)$/.test(e.name)) yield p;
  }
}

export function allowed(rel) {
  return ALLOW.some((a) => a.re.test(rel));
}

function main() {
  const problems = [];
  for (const abs of walk(path.join(root, "src"))) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (allowed(rel)) continue;
    problems.push(...scanSource(rel, fs.readFileSync(abs, "utf8")));
  }
  if (problems.length) {
    for (const p of problems) console.error(`${p.file}:${p.line}: ${p.what}: ${p.text}`);
    console.error(`\n${problems.length} hard-coded colour(s). Use a semantic variable (see src/theme/tokens.css).`);
    process.exit(1);
  }
  console.log("colours: no hard-coded colour outside the allowlist");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
