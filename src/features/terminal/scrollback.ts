// The terminal's scrollback: Conductor's Settings › Advanced › Scrollback
// limit, setting `terminal_scrollback_limit_bytes` (evidence/terminal/NOTES.md).
// Conductor stores bytes, shows whole MB, and gives xterm one row per 160
// bytes (80 columns of 2 bytes). Settings push the current value here; live
// terminals and new ones read it. No DOM or xterm, so node --test covers it.

export const SCROLLBACK_DEFAULT_BYTES = 10_000_000;
export const SCROLLBACK_MIN_BYTES = 1_000_000;
export const SCROLLBACK_MAX_BYTES = 1_000_000_000;
const BYTES_PER_MB = 1_000_000;
const BYTES_PER_ROW = 160;

type Stored = number | string | null | undefined;

/** A stored limit as bytes: Conductor's 10 MB when missing or not a number, else rounded into 1 MB to 1 GB. */
export function scrollbackLimitBytes(setting: Stored): number {
  const v = typeof setting === "string" ? setting.trim() : setting;
  if (v === null || v === undefined || v === "") return SCROLLBACK_DEFAULT_BYTES;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return SCROLLBACK_DEFAULT_BYTES;
  return Math.min(SCROLLBACK_MAX_BYTES, Math.max(SCROLLBACK_MIN_BYTES, Math.round(n)));
}

/** The whole MB the settings field shows for a stored limit. */
export function scrollbackLimitMegabytes(setting: Stored): number {
  return Math.max(1, Math.round(scrollbackLimitBytes(setting) / BYTES_PER_MB));
}

/**
 * The bytes to save for what was typed in the MB field: empty or not a number
 * falls back to 10 MB, anything else rounds to whole MB, then is
 * kept within 1 MB to 1 GB.
 */
export function scrollbackBytesFromMegabytes(input: string): number {
  const v = input.trim();
  const n = v === "" ? NaN : Number(v);
  const mb = Number.isFinite(n) ? Math.round(n) : SCROLLBACK_DEFAULT_BYTES / BYTES_PER_MB;
  return scrollbackLimitBytes(mb * BYTES_PER_MB);
}

/** xterm `scrollback` rows for a stored limit. */
export function scrollbackRows(setting: Stored): number {
  return Math.max(1, Math.floor(scrollbackLimitBytes(setting) / BYTES_PER_ROW));
}

let current = scrollbackRows(undefined);
const listeners = new Set<(rows: number) => void>();

export const currentScrollbackRows = (): number => current;

/** Sets the scrollback every terminal keeps; listeners hear only real changes. */
export function setScrollbackRows(rows: number): void {
  if (rows === current) return;
  current = rows;
  for (const f of listeners) f(rows);
}

export function onScrollbackRows(f: (rows: number) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
