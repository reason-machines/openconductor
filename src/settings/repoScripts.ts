// Settings › Repository › Scripts: pure helpers, ported from Conductor 0.87.6
// (renderApp-D_fmY7hW.js `hma`, `ama`, `uma`, `FCe`; index-BGEQ8YjU.js `bNe`,
// `pf`, `lo`). Read with REA as untrusted reference data.
import type { RunScript } from "../scripts/model.ts";

/** Conductor's `bNe` (`_An` in the name field): what typing into the name keeps. */
export function sanitizeName(raw: string): string {
  return raw
    .trimStart()
    .replace(/-/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, "")
    .replace(/ {2,}/g, " ");
}

/** Conductor's `pf` (`cJ`): the settings key of a run-script name, or undefined when blank. */
export function scriptId(name: string): string | undefined {
  const cleaned = sanitizeName(name).trim();
  return cleaned.length === 0 ? undefined : cleaned.replace(/ +/g, "-");
}

/** Conductor's `lo` (`Jw`): ids compare case-insensitively. */
export function scriptKey(name: string): string | undefined {
  return scriptId(name)?.toLowerCase();
}

/** Base name of a new run script (Conductor's `vDt`). */
export const NEW_SCRIPT_BASE = "run";

/** Conductor's `Vpa`: "run", then "run 2", "run 3", ... past every taken id. */
export function nextScriptName(taken: readonly string[], base = NEW_SCRIPT_BASE): string {
  const want = scriptKey(base);
  if (want === undefined) return base;
  const n = taken.reduce((max, id) => {
    const key = scriptKey(id);
    if (key === undefined) return max;
    if (key === want) return Math.max(max, 1);
    const prefix = `${want}-`;
    if (!key.startsWith(prefix)) return max;
    const rest = key.slice(prefix.length);
    return /^\d+$/.test(rest) ? Math.max(max, Number(rest)) : max;
  }, 0);
  return n === 0 ? base : `${base} ${n + 1}`;
}

/** Conductor's `FCe` sizing: (lines + 1) × 20 px + 8, so an empty editor is 48 px tall. */
export const EDITOR_LINE_PX = 20;
export function editorHeight(value: string, placeholder?: string, minLines = 0): number {
  const shown = value.length === 0 && placeholder !== undefined ? placeholder : value;
  const lines = (shown.length === 0 ? 1 : shown.split(/\r\n|\r|\n/).length) + 1;
  return Math.max(lines, minLines) * EDITOR_LINE_PX + 8;
}

/** Conductor's `jzi`: the command line shown for a run script (command, then quoted args). */
export function commandLine(s: Pick<RunScript, "command" | "args">): string {
  return [s.command, ...s.args.map(shellQuote)].join(" ");
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_\-./:=@%+]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface ScriptForm {
  name: string;
  icon: string;
  commandLine: string;
}

/** TOML table for `[scripts.run.<id>]`, as Conductor's `tma` builds it (local workspaces only). */
export function runEntry(form: ScriptForm, original?: RunScript): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  const line = form.commandLine.trim();
  if (original && line === commandLine(original).trim()) {
    entry.command = original.command;
    if (original.args.length) entry.args = original.args;
  } else {
    entry.command = line;
  }
  if (original?.cwd) entry.options = { cwd: original.cwd };
  if (original?.default) entry.default = true;
  if (original?.hide) entry.hide = true;
  if (form.icon.trim()) entry.icon = form.icon.trim();
  return entry;
}

/** The form can be saved: a name that is not taken, and something changed (Conductor's `E`). */
export function canSave(form: ScriptForm, initial: ScriptForm, isNew: boolean, taken: ReadonlySet<string>): boolean {
  const key = scriptKey(form.name);
  if (key === undefined || taken.has(key)) return false;
  return isNew || form.name !== initial.name || form.icon !== initial.icon || form.commandLine !== initial.commandLine;
}
