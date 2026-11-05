// Display, comparison and event matching for shortcuts.
import { MODIFIERS, type Modifier, type Shortcut } from "./types.ts";

/** The subset of KeyboardEvent this module reads. */
export interface KeyEventLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const GLYPHS: Record<string, string> = {
  meta: "⌘",
  shift: "⇧",
  ctrl: "⌃",
  alt: "⌥",
  enter: "↵",
  escape: "Esc",
  tab: "Tab",
  backspace: "⌫",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  " ": "Space",
};

const SPOKEN: Record<string, string> = { meta: "Command", ctrl: "Control", alt: "Option", shift: "Shift", " ": "Space" };

const SEARCH_ALIASES: Record<Modifier, readonly string[]> = {
  meta: ["command", "cmd"],
  ctrl: ["control", "ctrl"],
  alt: ["option", "alt"],
  shift: ["shift"],
};

const isLetter = (s: string): boolean => /^\p{L}$/u.test(s);

/** Key text equality: letters ignore case, and "+" also accepts "=". */
function keyEquals(expected: string, actual: string): boolean {
  if (isLetter(expected) && isLetter(actual)) return expected.toLowerCase() === actual.toLowerCase();
  return expected === actual || (expected === "+" && actual === "=");
}

const has = (s: Shortcut, m: Modifier): boolean => s.modifiers?.includes(m) ?? false;

const eventHas = (e: KeyEventLike, m: Modifier): boolean =>
  m === "meta" ? e.metaKey : m === "ctrl" ? e.ctrlKey : m === "alt" ? e.altKey : e.shiftKey;

/** A single non-letter character such as "?" or "+" may need Shift or Option to type. */
const isSymbolKey = (s: Shortcut): boolean =>
  s.key.kind === "logical" && [...s.key.value].length === 1 && !isLetter(s.key.value);

/** Display parts in canonical order: modifiers, then the key. */
export function shortcutParts(s: Shortcut): string[] {
  return [...MODIFIERS.filter((m) => has(s, m)), s.key.kind === "logical" ? s.key.value : s.key.display];
}

/** The glyph for one part: ⌘ ⇧ ⌃ ⌥ ↵ and so on, else the key upper-cased. */
export const partGlyph = (part: string): string => GLYPHS[part.toLowerCase()] ?? part.toUpperCase();

export const glyphs = (s: Shortcut): string => shortcutParts(s).map(partGlyph).join("");

const spokenPart = (part: string): string =>
  SPOKEN[part.toLowerCase()] ?? (part.length === 1 ? part.toUpperCase() : part);

/** "Command+Shift+K"; several shortcuts are joined with " or ". */
export const spoken = (shortcuts: readonly Shortcut[]): string =>
  shortcuts.map((s) => shortcutParts(s).map(spokenPart).join("+")).join(" or ");

/** Words a search box should match for a shortcut ("cmd", "command", "⌘", "k", "K"). */
export function searchTokens(s: Shortcut): string[] {
  return shortcutParts(s).flatMap((p) =>
    p in SEARCH_ALIASES ? [...SEARCH_ALIASES[p as Modifier], partGlyph(p)] : [p, partGlyph(p)],
  );
}

/** Does the event press this shortcut (key and exact modifiers)? */
export function matchesEvent(s: Shortcut, e: KeyEventLike): boolean {
  const keyOk = s.key.kind === "physical" ? e.code === s.key.code : keyEquals(s.key.value, e.key);
  if (!keyOk) return false;
  return MODIFIERS.every((m) => {
    if (has(s, m)) return eventHas(e, m);
    if (!eventHas(e, m)) return true;
    // Extra Shift/Option is allowed when it is what produced the symbol.
    return (m === "shift" || m === "alt") && s.key.kind === "logical" && isSymbolKey(s) && keyEquals(s.key.value, e.key);
  });
}

/** Exact structural equality. */
export function sameShortcut(a: Shortcut, b: Shortcut): boolean {
  if (a.key.kind !== b.key.kind) return false;
  if (a.key.kind === "logical" && b.key.kind === "logical" && a.key.value !== b.key.value) return false;
  if (a.key.kind === "physical" && b.key.kind === "physical" && (a.key.code !== b.key.code || a.key.display !== b.key.display))
    return false;
  return MODIFIERS.every((m) => has(a, m) === has(b, m));
}

export const sameShortcuts = (a: readonly Shortcut[], b: readonly Shortcut[]): boolean =>
  a.length === b.length && a.every((s, i) => sameShortcut(s, b[i]));

/** Would both shortcuts fire on the same keystroke? Used for conflict checks. */
export function equivalent(a: Shortcut, b: Shortcut): boolean {
  const ka = a.key;
  const kb = b.key;
  const keysOk =
    ka.kind === "physical"
      ? kb.kind === "physical"
        ? ka.code === kb.code
        : keyEquals(kb.value, ka.display)
      : kb.kind === "physical"
        ? keyEquals(ka.value, kb.display)
        : keyEquals(ka.value, kb.value) || keyEquals(kb.value, ka.value);
  if (!keysOk) return false;
  return MODIFIERS.every((m) => {
    const ia = has(a, m);
    if (ia === has(b, m)) return true;
    return (m === "shift" || m === "alt") && isSymbolKey(ia ? b : a);
  });
}

const IGNORED_KEYS = new Set(["Dead", "Process", "Unidentified"]);
export const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export const heldModifiers = (e: KeyEventLike): Modifier[] => MODIFIERS.filter((m) => eventHas(e, m));

/**
 * The shortcut a recorder should save for this keydown, or undefined when the
 * key cannot be recorded. An Option chord that changes the letter (⌥T types †)
 * is stored by physical code so it matches regardless of layout output.
 */
export function recordFromEvent(e: KeyEventLike): Shortcut | undefined {
  const modifiers = heldModifiers(e);
  const mods = modifiers.length === 0 ? {} : { modifiers };
  const letter = e.code.match(/^Key([A-Z])$/)?.[1];
  if (e.altKey && letter !== undefined && e.key.toLowerCase() !== letter.toLowerCase()) {
    return { key: { kind: "physical", code: e.code, display: letter }, ...mods };
  }
  if (IGNORED_KEYS.has(e.key) || MODIFIER_KEYS.has(e.key)) return undefined;
  return { key: { kind: "logical", value: e.key }, ...mods };
}
