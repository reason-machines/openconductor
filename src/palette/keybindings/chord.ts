// Key chords: parse, format (macOS glyphs) and match against keyboard events.
// Model per evidence/search-palette/keybindings.json: a chord is one key plus a
// set of modifiers, where "meta" is Cmd on macOS.

export type Modifier = "meta" | "ctrl" | "alt" | "shift";

export interface Chord {
  key: string;
  modifiers: readonly Modifier[];
}

/** The subset of KeyboardEvent the matcher reads, so tests need no DOM. */
export interface KeyInput {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_ORDER: readonly Modifier[] = ["ctrl", "alt", "shift", "meta"];
const GLYPH: Record<Modifier, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const KEY_GLYPH: Record<string, string> = {
  Enter: "↵",
  Escape: "Esc",
  Backspace: "⌫",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
const MODIFIER_ALIASES: Record<string, Modifier> = {
  mod: "meta",
  cmd: "meta",
  meta: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};
// Physical key codes for symbols whose event.key changes with Shift or layout.
const CODE_TO_KEY: Record<string, string> = {
  Slash: "/",
  Period: ".",
  Comma: ",",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Semicolon: ";",
  Quote: "'",
  Backslash: "\\",
};

export function chord(key: string, ...modifiers: Modifier[]): Chord {
  return { key, modifiers: sortModifiers(modifiers) };
}

function sortModifiers(mods: readonly Modifier[]): Modifier[] {
  return MODIFIER_ORDER.filter((m) => mods.includes(m));
}

/** Parse "mod+shift+k" / "Cmd+Shift+K" / "Tab". The last segment is the key. */
export function parseChord(text: string): Chord {
  const parts = text.split("+");
  // "mod++" means the "+" key.
  if (text.endsWith("++")) parts.splice(parts.length - 2, 2, "+");
  const key = parts.pop() ?? "";
  if (key === "") throw new Error(`Invalid chord: ${JSON.stringify(text)}`);
  const modifiers = parts.map((p) => {
    const m = MODIFIER_ALIASES[p.trim().toLowerCase()];
    if (!m) throw new Error(`Unknown modifier ${JSON.stringify(p)} in ${JSON.stringify(text)}`);
    return m;
  });
  return chord(key.length === 1 ? key.toLowerCase() : key, ...modifiers);
}

/** macOS menu-style label, modifiers in Apple's order: ⌃⌥⇧⌘K. */
export function formatChord(c: Chord): string {
  const key = KEY_GLYPH[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return sortModifiers(c.modifiers).map((m) => GLYPH[m]).join("") + key;
}

export function chordId(c: Chord): string {
  return [...sortModifiers(c.modifiers), c.key.length === 1 ? c.key.toLowerCase() : c.key].join("+");
}

function keyFromCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_TO_KEY[code];
}

export function matchesChord(c: Chord, e: KeyInput): boolean {
  const want = c.key.length === 1 ? c.key.toLowerCase() : c.key;
  const typed = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const byKey = typed === want;
  const byCode = !byKey && keyFromCode(e.code) === want;
  if (!byKey && !byCode) return false;
  const has = (m: Modifier) => c.modifiers.includes(m);
  // A symbol typed with Shift ("+" on US layouts) matches a chord without
  // Shift when event.key already is that symbol.
  const shiftImplied = byKey && want.length === 1 && !/[a-z0-9]/.test(want) && !has("shift");
  return (
    e.metaKey === has("meta") &&
    e.ctrlKey === has("ctrl") &&
    e.altKey === has("alt") &&
    (shiftImplied || e.shiftKey === has("shift"))
  );
}
