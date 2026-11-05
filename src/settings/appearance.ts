// Appearance settings: Conductor's App zoom, Low-contrast dark mode and Mono
// Font rows (evidence/settings/NOTES.md), plus applying them to the document.
// Pure helpers first so node --test covers them without a DOM.
import type { Settings } from "./types";
import { setTerminalFont, terminalFontFrom } from "../features/terminal/font.ts";
import { scrollbackRows, setScrollbackRows } from "../features/terminal/scrollback.ts";
import { customCommandsFrom, presetFrom, setBigTerminal } from "../features/terminal/bigTerminal.ts";
import { executablePaths } from "./agentSettings.ts";
import { applyDiffAppearance } from "../features/diff/appearance.ts";

/** Conductor's zoom steps: 50% to 300% in 10% steps, 100% by default. */
export const ZOOM_PERCENTS: readonly number[] = Array.from({ length: (300 - 50) / 10 + 1 }, (_, i) => 50 + i * 10);
export const DEFAULT_ZOOM = 1;

/** A stored zoom fraction as the whole percentage the picker shows. */
export const zoomPercent = (zoom: number): number => Math.round(zoom * 100);

/** One ⌘+ / ⌘− step from `zoom`, clamped to 50%–300%, as Conductor's `xZn` does. */
export function zoomStep(zoom: number, direction: "in" | "out"): number {
  const next = zoomPercent(zoom) + (direction === "in" ? 10 : -10);
  return Math.min(300, Math.max(50, next)) / 100;
}

/** The fonts Conductor offers before "Custom...". */
export const MONO_FONTS: readonly string[] = ["Geist Mono", "iA Writer Mono"];

/** The stack used when no mono font is chosen (ours; Conductor bundles Geist Mono). */
export const BUILTIN_MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/**
 * Same rule as `valid_font_family` in src-tauri/src/settings/validate.rs: the
 * name is quoted into CSS, so it may not carry characters that end the string.
 * Returns an error message, or null when valid.
 */
export function monoFontError(font: string): string | null {
  const f = font.trim();
  if (f === "") return "Enter a font name.";
  if ([...f].length > 100) return "Font names are at most 100 characters.";
  return /["'\\;{}<>\u0000-\u001f\u007f-\u009f]/.test(f) ? "Font names cannot contain quotes, \\ ; { } < or >." : null;
}

/** The CSS font-family for `font`, falling back to the built-in stack. */
export const monoFontStack = (font: string | null | undefined): string =>
  font && monoFontError(font) === null ? `"${font.trim()}", ${BUILTIN_MONO}` : BUILTIN_MONO;

/** A copy of `s` with one Appearance field set; everything else is kept. */
export function withAppearance<K extends keyof Settings["appearance"]>(s: Settings, field: K, value: Settings["appearance"][K]): Settings {
  return { ...s, appearance: { ...s.appearance, [field]: value } };
}

/**
 * Applies theme and appearance to the document root: `data-theme` (absent for
 * "system"), CSS zoom, `data-low-contrast` (styles.css applies it only while
 * dark is in effect) and `--font-mono`; and the terminal font, scrollback
 * limit and Big terminal preset to terminals.
 */
export function applyAppearance(s: Settings): void {
  const root = document.documentElement;
  if (s.general.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.general.theme;
  const a = s.appearance ?? { zoom_level_v2: DEFAULT_ZOOM, low_contrast_dark_mode: false };
  root.style.zoom = a.zoom_level_v2 === DEFAULT_ZOOM ? "" : String(a.zoom_level_v2);
  if (a.low_contrast_dark_mode) root.dataset.lowContrast = "";
  else delete root.dataset.lowContrast;
  if (a.mono_font) {
    root.dataset.monoFont = "";
    root.style.setProperty("--font-mono", monoFontStack(a.mono_font));
  } else {
    delete root.dataset.monoFont;
    root.style.removeProperty("--font-mono");
  }
  applyDiffAppearance({ ...a, mono_font_stack: monoFontStack(a.mono_font) }, root);
  setTerminalFont(terminalFontFrom(a));
  setScrollbackRows(scrollbackRows(s.advanced?.terminal_scrollback_limit_bytes));
  setBigTerminal({
    enabled: s.experimental?.experimental_big_terminal_mode === true,
    preset: presetFrom(s.terminal?.big_terminal_preset),
    customCommands: customCommandsFrom(s.terminal?.big_terminal_custom_commands),
    requiresToolApprovals: s.tool_approvals_enabled === true,
    executablePaths: executablePaths(s),
  });
}

/** Fired after something outside the settings view saved settings (e.g. ⌘+), so open views reload. */
export const SETTINGS_CHANGED = "openconductor:settings-changed";
