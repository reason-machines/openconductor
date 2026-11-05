// The terminal's font: Conductor's Appearance › Terminal font row, settings
// `terminal_font_family` and `terminal_font_size` (evidence/terminal/NOTES.md).
// Settings push the current value here; live terminals and new ones read it.
// No DOM or xterm, so node --test covers it.

/** Conductor's terminal stack; a chosen family goes in front of it. */
export const TERMINAL_FALLBACK_FONTS = "Menlo, Monaco, 'Courier New', 'Symbols Nerd Font Mono', monospace";
export const DEFAULT_TERMINAL_FONT_SIZE = 12;
/** Conductor's Terminal Font Size slider range (the backend refuses others). */
export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 20;
/** Conductor's terminal line height. */
export const TERMINAL_LINE_HEIGHT = 1.2;

export interface TerminalFont {
  family: string;
  size: number;
}

/** The CSS font-family for a stored `terminal_font_family`, as Conductor builds it. */
export function terminalFontFamily(setting: string | null | undefined): string {
  const f = setting?.trim();
  return f ? `${f}, ${TERMINAL_FALLBACK_FONTS}` : TERMINAL_FALLBACK_FONTS;
}

/** A stored `terminal_font_size` as whole px in the slider's range; 12 when missing. */
export function terminalFontSize(setting: number | null | undefined): number {
  if (typeof setting !== "number" || !Number.isFinite(setting)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(setting)));
}

export function terminalFontFrom(appearance: { terminal_font_family?: string | null; terminal_font_size?: number } | undefined): TerminalFont {
  return { family: terminalFontFamily(appearance?.terminal_font_family), size: terminalFontSize(appearance?.terminal_font_size) };
}

let current: TerminalFont = terminalFontFrom(undefined);
const listeners = new Set<(f: TerminalFont) => void>();

export const currentTerminalFont = (): TerminalFont => current;

/** Sets the font every terminal uses; listeners hear only real changes. */
export function setTerminalFont(next: TerminalFont): void {
  if (next.family === current.family && next.size === current.size) return;
  current = next;
  for (const f of listeners) f(next);
}

export function onTerminalFont(f: (font: TerminalFont) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
