// parity:diff.appearance:data
// The Code theme setting for diffs. Conductor (REA read of the renderApp chunk,
// 0.87.6) registers each code theme as a Shiki theme with Pierre, named after
// the theme id for a dark palette and "<id>-light" for a light one, and gives
// Pierre `{dark, light}`: the chosen theme on the mode it has a palette for,
// the default theme on the other. Each of its eight themes has one mode
// (Catppuccin Latte light, the others dark). The colours below are the themes'
// own published palettes, kept as --syntax-<theme>-<key> in src/theme/tokens.css
// (Shiki passes var() colours through to the inline styles it emits); the
// token-to-scope mapping is ours.
import { CONDUCTOR_THEME } from "./conductorCodeTheme.ts";

export type CodeTheme =
  | "default"
  | "catppuccin-latte"
  | "catppuccin-macchiato"
  | "catppuccin-mocha"
  | "dracula"
  | "nord"
  | "tokyo-night"
  | "gruvbox-dark"
  | "solarized-dark";

export type Mode = "light" | "dark";

export interface CodePalette {
  fg: string;
  bg: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  function: string;
  class: string;
  tag: string;
  operator: string;
  variable: string;
}

export interface CodeThemeDef {
  label: string;
  mode: Mode;
  palette: CodePalette;
}

const PALETTE_KEYS = ["fg", "bg", "comment", "keyword", "string", "number", "function", "class", "tag", "operator", "variable"] as const;

/** A code theme's colours as references to its tokens in src/theme/tokens.css. */
export function syntaxTokens(theme: Exclude<CodeTheme, "default">): CodePalette {
  return Object.fromEntries(PALETTE_KEYS.map((k) => [k, `var(--syntax-${theme}-${k})`])) as unknown as CodePalette;
}

export const CODE_THEMES: Record<Exclude<CodeTheme, "default">, CodeThemeDef> = {
  "catppuccin-latte": {
    label: "Catppuccin Latte",
    mode: "light",
    palette: syntaxTokens("catppuccin-latte"),
  },
  "catppuccin-macchiato": {
    label: "Catppuccin Macchiato",
    mode: "dark",
    palette: syntaxTokens("catppuccin-macchiato"),
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    mode: "dark",
    palette: syntaxTokens("catppuccin-mocha"),
  },
  dracula: {
    label: "Dracula",
    mode: "dark",
    palette: syntaxTokens("dracula"),
  },
  nord: {
    label: "Nord",
    mode: "dark",
    palette: syntaxTokens("nord"),
  },
  "tokyo-night": {
    label: "Tokyo Night",
    mode: "dark",
    palette: syntaxTokens("tokyo-night"),
  },
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    mode: "dark",
    palette: syntaxTokens("gruvbox-dark"),
  },
  "solarized-dark": {
    label: "Solarized Dark",
    mode: "dark",
    palette: syntaxTokens("solarized-dark"),
  },
};

export const CODE_THEME_IDS = Object.keys(CODE_THEMES) as Array<Exclude<CodeTheme, "default">>;

/** Normalises a stored value: anything unknown is the default theme. */
export const codeThemeFrom = (v: unknown): CodeTheme => (typeof v === "string" && v in CODE_THEMES ? (v as CodeTheme) : "default");

/** The Shiki theme name a code theme registers under: the id for dark, "<id>-light" for light. */
export const shikiNameOf = (id: Exclude<CodeTheme, "default">): string => (CODE_THEMES[id].mode === "light" ? `${id}-light` : id);

/** Pierre's `theme` option for a Code theme setting (Conductor's rule, see the header). */
export function diffThemeFor(theme: CodeTheme): { dark: string; light: string } {
  if (theme === "default") return { ...CONDUCTOR_THEME };
  const def = CODE_THEMES[theme];
  return def.mode === "dark" ? { dark: shikiNameOf(theme), light: CONDUCTOR_THEME.light } : { dark: CONDUCTOR_THEME.dark, light: shikiNameOf(theme) };
}

/** A TextMate/Shiki theme for one palette. */
export function shikiTheme(name: string, def: CodeThemeDef) {
  const p = def.palette;
  const rule = (scope: string[], foreground: string, fontStyle?: string) => ({ scope, settings: fontStyle ? { foreground, fontStyle } : { foreground } });
  return {
    name,
    displayName: def.label,
    type: def.mode,
    fg: p.fg,
    bg: p.bg,
    colors: { "editor.background": p.bg, "editor.foreground": p.fg },
    tokenColors: [
      { settings: { foreground: p.fg, background: p.bg } },
      rule(["comment", "punctuation.definition.comment", "string.comment"], p.comment, "italic"),
      rule(["keyword", "storage", "storage.type", "storage.modifier", "keyword.control"], p.keyword),
      rule(["keyword.operator", "punctuation.accessor", "punctuation.separator.key-value"], p.operator),
      rule(["string", "string.quoted", "string.template", "punctuation.definition.string"], p.string),
      rule(["constant.numeric", "constant.language", "constant.character", "constant.other", "support.constant"], p.number),
      rule(["entity.name.function", "support.function", "meta.function-call entity.name.function", "variable.function"], p.function),
      rule(["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class"], p.class),
      rule(["entity.name.tag", "meta.tag.sgml", "punctuation.definition.tag"], p.tag),
      rule(["entity.other.attribute-name"], p.class),
      rule(["variable", "variable.other", "variable.parameter", "meta.definition.variable"], p.variable),
      rule(["invalid", "invalid.illegal"], p.tag),
      rule(["markup.inserted"], p.string),
      rule(["markup.deleted"], p.tag),
      rule(["markup.heading", "entity.name.section"], p.function, "bold"),
    ],
  };
}
