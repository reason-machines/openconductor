// parity:diff.appearance:data
// Conductor's own default code themes, "Conductor Dark" and "Conductor Light".
// With the Code theme setting on Default, Conductor gives Pierre's worker pool
// {dark: "conductor-dark", light: "conductor-light"} (REA, renderApp 0.87.6:
// `Dgi` @1,440,937 and `eJr`'s setRenderOptions), not Pierre's own pierre-dark;
// a chosen theme replaces only the mode it has a palette for. Both themes are
// built by `TWe` from a palette (`QXr` dark, `YXr` light; src/theme/conductorCode.ts)
// with the scope rules of `XXr` below, read from the bundle.

import { CONDUCTOR_DARK, CONDUCTOR_LIGHT, type ConductorPalette } from "../../theme/conductorCode.ts";

export { CONDUCTOR_DARK, CONDUCTOR_LIGHT };

type Rule = { scope: string | string[]; settings: { foreground?: string; background?: string; fontStyle?: string } };

/** `XXr`: the TextMate scope rules, in Conductor's order. */
export function conductorRules(t: ConductorPalette): Rule[] {
  const fg = (scope: string | string[], foreground: string, fontStyle?: string): Rule => ({ scope, settings: fontStyle ? { fontStyle, foreground } : { foreground } });
  const m = t.markup;
  return [
    fg(["comment", "punctuation.definition.comment", "string.comment"], t.comment),
    fg(["constant", "entity.name.constant", "variable.other.constant", "variable.other.enummember", "variable.language"], t.constant),
    fg(["entity", "entity.name"], t.entity),
    fg("variable.parameter.function", t.fg),
    fg("entity.name.tag", t.tag),
    fg("keyword", t.keyword),
    fg(["storage", "storage.type"], t.keyword),
    fg(["storage.modifier.package", "storage.modifier.import", "storage.type.java"], t.fg),
    fg(["string", "punctuation.definition.string", "string punctuation.section.embedded source"], t.string),
    fg("support", t.constant),
    fg("meta.property-name", t.constant),
    fg("variable", t.variable),
    fg("variable.other", t.variableOther),
    fg("invalid.broken", t.invalid, "italic"),
    fg("invalid.deprecated", t.invalid, "italic"),
    fg("invalid.illegal", t.invalid, "italic"),
    fg("invalid.unimplemented", t.invalid, "italic"),
    { scope: "carriage-return", settings: { background: t.keyword, fontStyle: "italic underline", foreground: t.bg } },
    fg("message.error", t.error),
    fg("string variable", t.constant),
    fg(["source.regexp", "string.regexp"], t.regex),
    fg(["string.regexp.character-class", "string.regexp constant.character.escape", "string.regexp source.ruby.embedded", "string.regexp string.regexp.arbitrary-repitition"], t.regex),
    fg("string.regexp constant.character.escape", t.tag, "bold"),
    fg("support.constant", t.constant),
    fg("support.variable", t.constant),
    fg("meta.module-reference", t.constant),
    fg("punctuation.definition.list.begin.markdown", t.variable),
    fg(["markup.heading", "markup.heading entity.name"], m.heading, "bold"),
    fg("markup.quote", m.quote),
    fg("markup.italic", t.fg, "italic"),
    fg("markup.bold", t.fg, "bold"),
    { scope: ["markup.underline"], settings: { fontStyle: "underline" } },
    { scope: ["markup.strikethrough"], settings: { fontStyle: "strikethrough" } },
    fg("markup.inline.raw", t.constant),
    { scope: ["markup.deleted", "meta.diff.header.from-file", "punctuation.definition.deleted"], settings: { background: m.deletedBg, foreground: m.deleted } },
    { scope: ["markup.inserted", "meta.diff.header.to-file", "punctuation.definition.inserted"], settings: { background: m.insertedBg, foreground: m.inserted } },
    { scope: ["markup.changed", "punctuation.definition.changed"], settings: { background: m.changedBg, foreground: m.changed } },
    { scope: ["markup.ignored", "markup.untracked"], settings: { background: t.constant, foreground: t.bg } },
    fg("meta.diff.range", t.entity, "bold"),
    fg("meta.diff.header", t.constant),
    fg("meta.separator", t.constant, "bold"),
    fg("meta.output", t.constant),
    fg(["brackethighlighter.tag", "brackethighlighter.curly", "brackethighlighter.round", "brackethighlighter.square", "brackethighlighter.angle", "brackethighlighter.quote"], t.bracket),
    fg("brackethighlighter.unmatched", t.error),
    fg(["constant.other.reference.link", "string.other.link"], t.string, "underline"),
  ];
}

export const CONDUCTOR_DARK_THEME = "conductor-dark";
export const CONDUCTOR_LIGHT_THEME = "conductor-light";
/** Pierre's `theme` with the Code theme setting on Default. */
export const CONDUCTOR_THEME = { dark: CONDUCTOR_DARK_THEME, light: CONDUCTOR_LIGHT_THEME } as const;

/** `TWe`: the Shiki theme Conductor registers for a palette. */
export function conductorShikiTheme(name: string, displayName: string, type: "dark" | "light", t: ConductorPalette) {
  return {
    name,
    displayName,
    type,
    fg: t.fg,
    bg: t.bg,
    semanticHighlighting: true,
    colors: {
      "editor.background": t.bg,
      "editor.foreground": t.fg,
      "editor.lineHighlightBackground": `${t.fg}1f`,
      "editor.selectionBackground": `${t.constant}33`,
      "editorCursor.foreground": t.fg,
      "gitDecoration.addedResourceForeground": t.markup.inserted,
      "gitDecoration.deletedResourceForeground": t.markup.deleted,
      "gitDecoration.modifiedResourceForeground": t.entity,
    },
    settings: conductorRules(t),
  };
}
