// parity:diff.appearance:data
// The Code theme setting for diffs. Conductor (REA read of the renderApp chunk,
// 0.87.6) registers each code theme as a Shiki theme with Pierre, named after
// the theme id for a dark palette and "<id>-light" for a light one, and gives
// Pierre `{dark, light}`: the chosen theme on the mode it has a palette for,
// the default theme on the other. Each of its eight themes has one mode
// (Catppuccin Latte light, the others dark). The colours below are the themes'
// own published palettes; the token-to-scope mapping is ours.
import { PIERRE_THEME } from "./pierre.ts";

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

export const CODE_THEMES: Record<Exclude<CodeTheme, "default">, CodeThemeDef> = {
  "catppuccin-latte": {
    label: "Catppuccin Latte",
    mode: "light",
    palette: { fg: "#4c4f69", bg: "#eff1f5", comment: "#8c8fa1", keyword: "#8839ef", string: "#40a02b", number: "#fe640b", function: "#1e66f5", class: "#df8e1d", tag: "#d20f39", operator: "#04a5e5", variable: "#4c4f69" },
  },
  "catppuccin-macchiato": {
    label: "Catppuccin Macchiato",
    mode: "dark",
    palette: { fg: "#cad3f5", bg: "#24273a", comment: "#8087a2", keyword: "#c6a0f6", string: "#a6da95", number: "#f5a97f", function: "#8aadf4", class: "#eed49f", tag: "#ed8796", operator: "#91d7e3", variable: "#cad3f5" },
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    mode: "dark",
    palette: { fg: "#cdd6f4", bg: "#1e1e2e", comment: "#7f849c", keyword: "#cba6f7", string: "#a6e3a1", number: "#fab387", function: "#89b4fa", class: "#f9e2af", tag: "#f38ba8", operator: "#89dceb", variable: "#cdd6f4" },
  },
  dracula: {
    label: "Dracula",
    mode: "dark",
    palette: { fg: "#f8f8f2", bg: "#282a36", comment: "#6272a4", keyword: "#ff79c6", string: "#f1fa8c", number: "#bd93f9", function: "#50fa7b", class: "#8be9fd", tag: "#ff79c6", operator: "#ff79c6", variable: "#f8f8f2" },
  },
  nord: {
    label: "Nord",
    mode: "dark",
    palette: { fg: "#d8dee9", bg: "#2e3440", comment: "#616e88", keyword: "#81a1c1", string: "#a3be8c", number: "#b48ead", function: "#88c0d0", class: "#8fbcbb", tag: "#81a1c1", operator: "#81a1c1", variable: "#d8dee9" },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    mode: "dark",
    palette: { fg: "#a9b1d6", bg: "#1a1b26", comment: "#565f89", keyword: "#bb9af7", string: "#9ece6a", number: "#ff9e64", function: "#7aa2f7", class: "#2ac3de", tag: "#f7768e", operator: "#89ddff", variable: "#c0caf5" },
  },
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    mode: "dark",
    palette: { fg: "#ebdbb2", bg: "#282828", comment: "#928374", keyword: "#fb4934", string: "#b8bb26", number: "#d3869b", function: "#8ec07c", class: "#fabd2f", tag: "#83a598", operator: "#fe8019", variable: "#ebdbb2" },
  },
  "solarized-dark": {
    label: "Solarized Dark",
    mode: "dark",
    palette: { fg: "#839496", bg: "#002b36", comment: "#586e75", keyword: "#859900", string: "#2aa198", number: "#d33682", function: "#268bd2", class: "#b58900", tag: "#268bd2", operator: "#859900", variable: "#839496" },
  },
};

export const CODE_THEME_IDS = Object.keys(CODE_THEMES) as Array<Exclude<CodeTheme, "default">>;

/** Normalises a stored value: anything unknown is the default theme. */
export const codeThemeFrom = (v: unknown): CodeTheme => (typeof v === "string" && v in CODE_THEMES ? (v as CodeTheme) : "default");

/** The Shiki theme name a code theme registers under: the id for dark, "<id>-light" for light. */
export const shikiNameOf = (id: Exclude<CodeTheme, "default">): string => (CODE_THEMES[id].mode === "light" ? `${id}-light` : id);

/** Pierre's `theme` option for a Code theme setting (Conductor's rule, see the header). */
export function diffThemeFor(theme: CodeTheme): { dark: string; light: string } {
  if (theme === "default") return { ...PIERRE_THEME };
  const def = CODE_THEMES[theme];
  return def.mode === "dark" ? { dark: shikiNameOf(theme), light: PIERRE_THEME.light } : { dark: PIERRE_THEME.dark, light: shikiNameOf(theme) };
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
