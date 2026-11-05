// Keyboard routing: given a key event and where focus is, pick the one binding
// that should handle it. The `when` flags mirror the ones recorded in
// evidence/search-palette/README.md; how they combine is our own rule set,
// documented on each check below.

import { chordId, matchesChord, type Chord, type KeyInput } from "./chord.ts";

export type Category = "General" | "View" | "Navigation" | "Workspace" | "Chat" | "Code review" | "Terminal";

export interface When {
  /** Fires app-wide, including over an open dialog. */
  isGlobal?: boolean;
  /** Fires only while one of these dialogs is open. */
  enableOnDialogIds?: readonly string[];
  /** Fires while a text input has focus, even without Cmd/Ctrl. */
  allowWhileTyping?: boolean;
  /** true: fires in text inputs. false: never fires in text inputs. */
  enableOnInputFocus?: boolean;
  /** false: never fires while the terminal has focus. */
  enableOnTerminalFocus?: boolean;
  /** Fires only while the terminal has focus, and wins over other bindings there. */
  requireTerminalFocus?: boolean;
}

export interface BindingDef {
  id: string;
  title: string;
  category: Category;
  keys: readonly Chord[];
  configurable: boolean;
  hidden?: boolean;
  when?: When;
}

export interface FocusContext {
  /** Id of the topmost open dialog, if any. */
  openDialogId: string | null;
  focus: "none" | "input" | "terminal";
}

function hasCommandModifier(c: Chord): boolean {
  return c.modifiers.includes("meta") || c.modifiers.includes("ctrl");
}

/** Whether `def` may fire for chord `c` in `ctx` (ignoring which key was pressed). */
export function isEnabled(def: BindingDef, c: Chord, ctx: FocusContext): boolean {
  const w = def.when ?? {};
  if (w.requireTerminalFocus && ctx.focus !== "terminal") return false;
  if (w.enableOnTerminalFocus === false && ctx.focus === "terminal") return false;
  if (w.enableOnDialogIds) {
    if (ctx.openDialogId === null || !w.enableOnDialogIds.includes(ctx.openDialogId)) return false;
  } else if (ctx.openDialogId !== null && !w.isGlobal) {
    // An open dialog owns the keyboard except for global bindings.
    return false;
  }
  if (ctx.focus === "input") {
    if (w.enableOnInputFocus === false) return false;
    // Plain keys ("[", "r") are text while typing; Cmd/Ctrl chords are not.
    if (!w.allowWhileTyping && w.enableOnInputFocus !== true && !hasCommandModifier(c)) return false;
  }
  return true;
}

function priority(def: BindingDef): number {
  const w = def.when ?? {};
  if (w.enableOnDialogIds) return 2;
  if (w.requireTerminalFocus) return 1;
  return 0;
}

/**
 * The binding that handles `e`, or null. Dialog-scoped bindings beat
 * terminal-only ones, which beat the rest; ties go to registry order.
 */
export function resolveBinding(defs: readonly BindingDef[], e: KeyInput, ctx: FocusContext): BindingDef | null {
  let best: BindingDef | null = null;
  for (const def of defs) {
    const hit = def.keys.find((c) => matchesChord(c, e) && isEnabled(def, c, ctx));
    if (hit && (best === null || priority(def) > priority(best))) best = def;
  }
  return best;
}

export type KeyOverrides = Readonly<Record<string, readonly Chord[]>>;

/** Apply user overrides; overrides for unknown or non-configurable ids are ignored. */
export function applyOverrides(defs: readonly BindingDef[], overrides: KeyOverrides): BindingDef[] {
  return defs.map((def) => {
    const keys = overrides[def.id];
    return keys !== undefined && def.configurable ? { ...def, keys } : def;
  });
}

export interface Conflict {
  chord: string;
  ids: string[];
}

/**
 * Chords bound to more than one binding with the same scope. Bindings that
 * differ in dialog or terminal scope legitimately share keys (Cmd+K opens the
 * palette but clears the terminal), so they are not conflicts.
 */
export function findConflicts(defs: readonly BindingDef[]): Conflict[] {
  const byScope = new Map<string, string[]>();
  for (const def of defs) {
    const w = def.when ?? {};
    const scope = [w.enableOnDialogIds?.join(",") ?? "", w.requireTerminalFocus ? "terminal" : ""].join("|");
    for (const c of def.keys) {
      const k = `${chordId(c)}@${scope}`;
      byScope.set(k, [...(byScope.get(k) ?? []), def.id]);
    }
  }
  return [...byScope]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => ({ chord: k.slice(0, k.indexOf("@")), ids }));
}
