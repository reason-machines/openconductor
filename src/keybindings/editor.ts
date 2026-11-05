// Model for the key-bindings page (/settings/user/key-bindings): which commands
// it lists, its search and "Type shortcut" filter, and how a row's recorder
// reads key presses. Follows Conductor's page and recorder components
// (evidence/keybindings/README.md, "Key-bindings page").
import { findConflict } from "./conflicts.ts";
import { rankByFields } from "./fuzzy.ts";
import { effectiveShortcuts, SEND_KEY_COMMANDS, type Overrides } from "./overrides.ts";
import { COMMANDS } from "./registry.ts";
import { glyphs, heldModifiers, matchesEvent, MODIFIER_KEYS, partGlyph, recordFromEvent, searchTokens, spoken, type KeyEventLike } from "./shortcut.ts";
import type { Category, Command, Modifier, Shortcut } from "./types.ts";

export const EDITOR_TITLE = "Keyboard shortcuts";
export const EDITOR_SEARCH_PLACEHOLDER = "Search keyboard shortcuts...";
export const TYPE_SHORTCUT = "Type shortcut";
export const FIXED_SHORTCUT = "Fixed shortcut";
export const SAVE_FAILED = "Failed to save keyboard shortcut";

export interface EditorRow {
  id: string;
  title: string;
  category: Category;
  shortcuts: readonly Shortcut[];
  /** Shows a recorder; otherwise the row is a fixed shortcut with a lock. */
  recordable: boolean;
  /** Has an override, so the row offers Reset. */
  customized: boolean;
  /** Search text for the keys: "command cmd ⌘ k K" and so on. */
  keyText: string;
}

/**
 * Configurable or visible commands, in registry order. The opposite follow-up
 * submit is listed only when queued messages are on. The four send-key
 * commands are fixed here: the message-send setting controls them.
 */
export function editorRows(
  overrides: Overrides = {},
  { queuedMessagesEnabled = false } = {},
  commands: readonly Command[] = COMMANDS,
): EditorRow[] {
  return commands
    .filter((c) => (c.configurable || c.hidden !== true) && (queuedMessagesEnabled || c.id !== "chat.submitOppositeFollowUp"))
    .map((c) => {
      const shortcuts = effectiveShortcuts(c.id, overrides);
      return {
        id: c.id,
        title: c.title,
        category: c.category,
        shortcuts,
        recordable: c.configurable && !SEND_KEY_COMMANDS.includes(c.id),
        customized: overrides[c.id] !== undefined,
        keyText: shortcuts.flatMap(searchTokens).join(" "),
      };
    });
}

/**
 * Rows a filter keeps. A typed shortcut keeps rows with a key that fires on
 * that press; otherwise a blank query keeps everything and a query ranks rows
 * by title, category, command id and key text.
 */
export function filterRows(rows: readonly EditorRow[], query: string, typed?: KeyEventLike): EditorRow[] {
  if (typed !== undefined) return rows.filter((r) => r.shortcuts.some((s) => matchesEvent(s, typed)));
  if (!query.trim()) return [...rows];
  return rankByFields(rows, query, {
    title: (r) => r.title,
    category: (r) => r.category,
    commandId: (r) => r.id,
    keys: (r) => r.keyText,
  }).map((r) => r.item);
}

export interface RecorderEvent extends KeyEventLike {
  repeat?: boolean;
  isComposing?: boolean;
}

/** What one keydown means to a recorder (a row's, or the search box's "Type shortcut"). */
export type RecorderKey =
  | { kind: "ignore" }
  /** A modifier key went down: show the held modifiers and clear a shown conflict. */
  | { kind: "modifier"; held: Modifier[] }
  /** A key that cannot be recorded (a dead key): only the held modifiers update. */
  | { kind: "held"; held: Modifier[] }
  /** Bare Escape stops recording without saving. */
  | { kind: "cancel"; held: Modifier[] }
  | { kind: "shortcut"; held: Modifier[]; shortcut: Shortcut };

export function readRecorderKey(e: RecorderEvent): RecorderKey {
  if (e.repeat || e.isComposing) return { kind: "ignore" };
  const held = heldModifiers(e);
  if (MODIFIER_KEYS.has(e.key)) return { kind: "modifier", held };
  if (e.key === "Escape" && held.length === 0) return { kind: "cancel", held };
  const shortcut = recordFromEvent(e);
  return shortcut === undefined ? { kind: "held", held } : { kind: "shortcut", held, shortcut };
}

export type RecordOutcome =
  | Exclude<RecorderKey, { kind: "cancel" } | { kind: "shortcut" }>
  | { kind: "cancel" }
  /** Another command in a shared scope has it: show its title and keep recording. */
  | { kind: "conflict"; held: Modifier[]; title: string }
  | { kind: "save"; shortcut: Shortcut };

/** A row recorder's keydown, with Conductor's conflict check over every command. */
export function recordKey(commandId: string, e: RecorderEvent, overrides: Overrides = {}): RecordOutcome {
  const key = readRecorderKey(e);
  if (key.kind !== "shortcut") return key.kind === "cancel" ? { kind: "cancel" } : key;
  const conflict = findConflict({ commandId, shortcut: key.shortcut, event: e, overrides });
  return conflict === undefined ? { kind: "save", shortcut: key.shortcut } : { kind: "conflict", held: key.held, title: conflict.title };
}

/**
 * The search box enters "Type shortcut" mode when a modifier is pressed while
 * it is empty and no typed shortcut is showing.
 */
export const startsTypeMode = (query: string, typed: KeyEventLike | undefined, key: string): boolean =>
  query === "" && typed === undefined && MODIFIER_KEYS.has(key);

/** The search box text for a typed shortcut, "⌘K". */
export const typedQuery = (s: Shortcut): string => glyphs(s);

/** The search box text while modifiers are held in "Type shortcut" mode. */
export const heldGlyphs = (held: readonly Modifier[]): string => held.map(partGlyph).join("");

const spokenModifier: Record<Modifier, string> = { meta: "Command", ctrl: "Control", alt: "Option", shift: "Shift" };

/** The recorder button's accessible name; it is also announced while recording. */
export function recorderLabel(title: string, shortcuts: readonly Shortcut[], recording: boolean, held: readonly Modifier[]): string {
  if (!recording) return `Change shortcut for ${title}. Current shortcuts: ${spoken(shortcuts)}.`;
  if (held.length === 0) return `Recording shortcut for ${title}. Press modifiers and a key.`;
  return `Recording shortcut for ${title}. Held modifiers: ${held.map((m) => spokenModifier[m]).join("+")}. Press a key.`;
}
