// parity:diff.appearance:ui
// Applies the diff-related Appearance settings to the document root, as
// Conductor's theme provider does (REA read of the renderApp chunk, 0.87.6):
// the mono font as the diff font (--diffs-font-family), the Code ligatures
// switch (--file-code-font-variant-ligatures, plus Pierre's
// --diffs-font-features), and Accessible colors as a root attribute that
// appearance.css turns into Pierre's --diffs-addition/deletion-color-override.
// The Code theme reaches Pierre through useDiffTheme.ts.
import { codeThemeFrom, type CodeTheme } from "./codeThemes.ts";

export type ColorVision = "default" | "protanopia-deuteranopia" | "tritanopia";
export const COLOR_VISIONS: ReadonlyArray<{ value: ColorVision; label: string }> = [
  { value: "default", label: "Default" },
  { value: "protanopia-deuteranopia", label: "Deuteranopia / Protanopia" },
  { value: "tritanopia", label: "Tritanopia" },
];

export interface DiffAppearanceSettings {
  mono_font_stack: string;
  file_ligatures_enabled?: boolean;
  color_vision?: unknown;
  code_theme?: unknown;
}

export const colorVisionFrom = (v: unknown): ColorVision => (v === "protanopia-deuteranopia" || v === "tritanopia" ? v : "default");

/** Root custom properties for the diff font and ligatures. */
export function diffRootVars(a: DiffAppearanceSettings): Record<string, string> {
  const ligatures = a.file_ligatures_enabled !== false;
  return {
    "--diffs-font-family": a.mono_font_stack,
    "--file-code-font-variant-ligatures": ligatures ? "normal" : "none",
    "--diffs-font-features": ligatures ? "normal" : '"liga" 0, "calt" 0',
  };
}

type Listener = () => void;
let codeTheme: CodeTheme = "default";
const listeners = new Set<Listener>();

/** The Code theme last applied; useDiffTheme subscribes to it. */
export const currentCodeTheme = (): CodeTheme => codeTheme;
export function subscribeCodeTheme(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Sets the root variables, the colour-vision attribute and the current Code theme. */
export function applyDiffAppearance(a: DiffAppearanceSettings, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(diffRootVars(a))) root.style.setProperty(k, v);
  const cv = colorVisionFrom(a.color_vision);
  if (cv === "default") delete root.dataset.colorVision;
  else root.dataset.colorVision = cv;
  const next = codeThemeFrom(a.code_theme);
  if (next !== codeTheme) {
    codeTheme = next;
    for (const l of listeners) l();
  }
}
