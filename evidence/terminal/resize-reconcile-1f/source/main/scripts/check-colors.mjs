#!/usr/bin/env node
// Fails when app source has a colour literal outside src/theme/: a hex colour,
// rgb()/rgba()/hsl()/hsla()/oklch()/oklab()/hwb(), a named colour in a CSS
// value, or a Tailwind colour class. Every colour belongs in
// src/theme/tokens.css; components use its variables (var(--text), ...).
//
// It also fails when a colour token a component uses has a hue under Neutral,
// the default palette, which must be pure grey (R = G = B): each var(--token)
// is resolved through src/theme/tokens.css for Neutral light, dark and
// low-contrast dark. Tokens whose colour carries meaning (diff, status,
// syntax, brand, success, destructive, warning) are exempt.
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

/** Every `--token: value` of each rule in tokens.css, keyed by its selector list entries. */
function ruleBlocks(tokensCss) {
  const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((x) => x.trim()),
    decls: new Map([...m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()])),
  }));
}

/** The token values in effect under Neutral, per mode, from tokens.css. */
export function neutralModes(tokensCss) {
  const blocks = ruleBlocks(tokensCss);
  const rule = (selector) => {
    const b = blocks.find((x) => x.selectors.includes(selector));
    if (!b) throw new Error(`tokens.css has no rule for ${selector}`);
    return b.decls;
  };
  const neutral = (suffix) => rule(`:root[data-color-palette="neutral"]${suffix}`);
  const light = new Map([...rule(":root"), ...neutral("")]);
  const dark = new Map([...light, ...rule(':root[data-theme="dark"]'), ...neutral('[data-theme="dark"]')]);
  const lowContrast = new Map([...dark, ...neutral('[data-low-contrast][data-theme="dark"]')]);
  return { light, dark, "low-contrast dark": lowContrast };
}

/** Tokens whose colour carries meaning, the same in every palette. */
const MEANINGFUL_TOKEN = /^--(?:diff-|status-|code-|syntax-|collab-|brand-|logo-|terminal-|conductor-status-|conductor-slot-icon$|success$|destructive$|amber$|warning$|unread$)/;

/** True when `value` (after resolving var()s through `tokens`) holds a colour with R, G and B not all equal. */
export function hasHue(value, tokens, seen = new Set()) {
  const resolved = value.replace(/var\((--[\w-]+)[^)]*\)/g, (m, name) => {
    if (seen.has(name) || !tokens.has(name)) return "";
    return ` ${tokens.get(name)} `;
  });
  if (resolved !== value) return hasHue(resolved, tokens, new Set([...seen, ...[...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])]));
  for (const m of resolved.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const h = m[1].length <= 4 ? [...m[1].slice(0, 3)].map((c) => c + c) : [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
    if (new Set(h.map((x) => x.toLowerCase())).size > 1) return true;
  }
  for (const m of resolved.matchAll(/hsla?\(\s*[\d.]+(?:deg)?[\s,]+([\d.]+)%/gi)) if (Number(m[1]) > 0) return true;
  for (const m of resolved.matchAll(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/gi)) if (!(m[1] === m[2] && m[2] === m[3])) return true;
  return false;
}

/**
 * Tokens one file uses that have a hue under Neutral: [{ line, token, mode, value }].
 * `modes` comes from neutralModes().
 */
export function findNeutralLeaks(text, path, modes) {
  const lines = stripComments(text, path.endsWith(".css")).split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\((--[\w-]+)/g)) {
      const token = m[1];
      if (MEANINGFUL_TOKEN.test(token)) continue;
      for (const [mode, tokens] of Object.entries(modes)) {
        if (!tokens.has(token) || !hasHue(`var(${token})`, tokens)) continue;
        hits.push({ line: i + 1, token, mode, value: tokens.get(token) });
        break;
      }
    }
  });
  return hits;
}

/**
 * Menus that still copy Conductor's Stone in every palette. Listed per file and
 * token so nothing new joins them; an entry that stops leaking fails until removed.
 */
export const NEUTRAL_LEAK_BASELINE = new Set([
  "src/components/menu/contextMenu.css --conductor-popover",
  "src/components/menu/contextMenu.css --conductor-popover-fg",
  "src/components/menu/contextMenu.css --conductor-popover-accent",
  "src/components/menu/contextMenu.css --conductor-popover-ring",
  "src/components/menu/contextMenu.css --conductor-accent-fg",
  "src/components/menu/contextMenu.css --conductor-muted-fg",
  "src/components/menu/contextMenu.css --conductor-border",
  "src/components/popoverMenu.css --conductor-popover",
  "src/components/popoverMenu.css --conductor-popover-accent",
  "src/components/popoverMenu.css --conductor-popover-ring",
  "src/components/popoverMenu.css --conductor-fg",
  "src/components/popoverMenu.css --conductor-muted-fg",
]);

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
  const modes = neutralModes(readFileSync(join(ROOT, "src/theme/tokens.css"), "utf8"));
  let count = 0;
  let leaks = 0;
  const baselineSeen = new Set();
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel.startsWith(ALLOWED_DIR)) continue;
    const text = readFileSync(file, "utf8");
    for (const hit of findColors(text, rel)) {
      console.error(`${rel}:${hit.line}: ${hit.rule} ${hit.match}`);
      count++;
    }
    for (const hit of findNeutralLeaks(text, rel, modes)) {
      const key = `${rel.split(sep).join("/")} ${hit.token}`;
      if (NEUTRAL_LEAK_BASELINE.has(key)) {
        baselineSeen.add(key);
        continue;
      }
      console.error(`${rel}:${hit.line}: hued under Neutral (${hit.mode}) var(${hit.token}) = ${hit.value}`);
      leaks++;
    }
  }
  if (!args.length) {
    for (const key of NEUTRAL_LEAK_BASELINE) {
      if (baselineSeen.has(key)) continue;
      console.error(`NEUTRAL_LEAK_BASELINE: "${key}" no longer leaks; remove it from scripts/check-colors.mjs.`);
      leaks++;
    }
  }
  if (count) console.error(`\n${count} colour literal(s) outside src/theme/. Use a token from src/theme/tokens.css (add one there if none fits).`);
  if (leaks) console.error(`\n${leaks} Neutral leak(s). Neutral must be pure grey: use a palette token (--bg, --surface-accent, --text, ...), not a fixed Stone one.`);
  if (count || leaks) process.exit(1);
  console.log(`check-colors: no colour literals outside src/theme/ and no hue under Neutral (${files.length} files).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
