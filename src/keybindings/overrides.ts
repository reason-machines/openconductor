// User overrides, stored as JSON in the `settings` table under STORAGE_KEY.
// Format and migrations follow evidence/keybindings/README.md ("Overrides").
import { COMMANDS, LEGACY_ALIASES, SEND_KEY_PRESETS, type SendKeyMode } from "./registry.ts";
import { sameShortcuts } from "./shortcut.ts";
import { MODIFIERS, type Command, type Modifier, type Shortcut } from "./types.ts";

/** Command id to the shortcuts that replace its defaults (never empty). */
export type Overrides = Record<string, readonly Shortcut[]>;

export interface OverrideUpdate {
  commandId: string;
  /** undefined resets the command to its defaults. */
  shortcuts: readonly Shortcut[] | undefined;
}

const BY_ID = new Map<string, Command>(COMMANDS.map((c) => [c.id, c]));

/** The four chat commands whose defaults come from the message-send mode. */
export const SEND_KEY_COMMANDS = ["chat.newLine", "chat.submitMessage", "chat.submitOppositeFollowUp", "chat.question.submit"];

// Legacy per-mode question-submit ids, most specific first (from the bundle).
const LEGACY_SEND_KEY_IDS: Record<SendKeyMode, readonly string[]> = {
  enter: ["chat.question.submitWithEnter", "chat.question.submitWithCommandEnter"],
  "cmd-enter": ["chat.question.submitWithCommandEnter", "chat.question.submitWithEnter"],
};

const UNRECORDABLE_KEYS = new Set(["Alt", "Control", "Dead", "Meta", "Process", "Shift", "Unidentified"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonEmpty = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Parse one stored shortcut; anything malformed gives undefined. */
export function parseShortcut(v: unknown): Shortcut | undefined {
  if (!isObject(v) || !isObject(v.key)) return undefined;
  let modifiers: Modifier[] = [];
  if (v.modifiers !== undefined) {
    if (!Array.isArray(v.modifiers) || !v.modifiers.every((m) => MODIFIERS.includes(m))) return undefined;
    modifiers = MODIFIERS.filter((m) => (v.modifiers as unknown[]).includes(m));
  }
  const mods = modifiers.length === 0 ? {} : { modifiers };
  if (v.key.kind === "logical") {
    const value = nonEmpty(v.key.value);
    return value === undefined || UNRECORDABLE_KEYS.has(value) ? undefined : { key: { kind: "logical", value }, ...mods };
  }
  if (v.key.kind === "physical") {
    const code = nonEmpty(v.key.code);
    const display = nonEmpty(v.key.display);
    return code === undefined || display === undefined ? undefined : { key: { kind: "physical", code, display }, ...mods };
  }
  return undefined;
}

/** A shortcut or a non-empty list of them; one bad entry invalidates the list. */
function parseList(v: unknown): Shortcut[] | undefined {
  const items = Array.isArray(v) ? v : [v];
  const out = items.map(parseShortcut);
  return out.length > 0 && out.every((s) => s !== undefined) ? (out as Shortcut[]) : undefined;
}

export function parseOverrides(raw: string | undefined, opts: { legacyMessageSendKey?: SendKeyMode } = {}): Overrides {
  if (raw === undefined) return {};
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isObject(doc) || doc.version !== 1 || !isObject(doc.overrides)) return {};
  const stored = new Map(Object.entries(doc.overrides));
  const out: Record<string, Shortcut[]> = {};
  for (const [id, value] of stored) {
    if (id in LEGACY_ALIASES || !BY_ID.get(id)?.configurable || out[id] !== undefined) continue;
    const list = parseList(value);
    if (list !== undefined) out[id] = list;
  }
  const pin = parseList(stored.get("workspace.contextMenu.togglePinOrImportance"));
  if (out["workspace.contextMenu.togglePin"] === undefined && pin !== undefined) out["workspace.contextMenu.togglePin"] = pin;
  const mode = opts.legacyMessageSendKey ?? "enter";
  for (const legacy of ["chat.composer.submitWithCommandEnter", ...LEGACY_SEND_KEY_IDS[mode]]) {
    const target = LEGACY_ALIASES[legacy];
    if (target === undefined || out[target] !== undefined) continue;
    const single = parseShortcut(stored.get(legacy));
    if (single !== undefined) out[target] = [single];
  }
  promoteCmdEnterNewLine(out);
  return out;
}

// A cmd-enter setup saved before newLine accepted two keys keeps only plain
// Enter for newLine; restore the preset's pair when everything else matches it.
function promoteCmdEnterNewLine(out: Record<string, Shortcut[]>): void {
  const newLine = out["chat.newLine"];
  const preset = SEND_KEY_PRESETS["cmd-enter"];
  if (newLine === undefined || !sameShortcuts(newLine, [{ key: { kind: "logical", value: "Enter" } }])) return;
  const rest = SEND_KEY_COMMANDS.filter((id) => id !== "chat.newLine");
  if (rest.every((id) => out[id] !== undefined && sameShortcuts(out[id], preset[id]))) {
    out["chat.newLine"] = [...preset["chat.newLine"]];
  }
}

/** Apply updates and encode; single shortcuts are stored bare, lists as arrays. */
export function serializeOverrides(overrides: Overrides, updates: readonly OverrideUpdate[]): string {
  const next: Record<string, readonly Shortcut[]> = { ...overrides };
  for (const { commandId, shortcuts } of updates) {
    if (shortcuts === undefined) delete next[commandId];
    else next[commandId] = shortcuts;
  }
  const encoded = Object.fromEntries(Object.entries(next).map(([id, list]) => [id, list.length === 1 ? list[0] : list]));
  return JSON.stringify({ version: 1, overrides: encoded });
}

/** The override if there is one, else the primary key plus additional keys. */
export function effectiveShortcuts(commandId: string, overrides: Overrides = {}): readonly Shortcut[] {
  const override = overrides[commandId];
  if (override !== undefined) return override;
  const command = BY_ID.get(commandId);
  if (command === undefined) throw new Error(`Unknown keybinding: ${commandId}`);
  return [command.key, ...(command.additionalKeys ?? [])];
}

/** Which message-send preset the four send commands currently follow, if any. */
export function currentSendKeyMode(overrides: Overrides = {}): SendKeyMode | undefined {
  return (["enter", "cmd-enter"] as const).find((mode) =>
    SEND_KEY_COMMANDS.every((id) => sameShortcuts(effectiveShortcuts(id, overrides), SEND_KEY_PRESETS[mode][id])),
  );
}

export interface OverrideStorage {
  read(): Promise<string | undefined>;
  /** Resolves false when the write was rejected. */
  write(raw: string): Promise<boolean>;
}

/**
 * Serialized read-modify-write: each update re-reads storage, so concurrent
 * edits from two rows never drop one another.
 */
export function createOverrideStore(storage: OverrideStorage) {
  let tail: Promise<unknown> = Promise.resolve();
  const updateMany = (updates: readonly OverrideUpdate[]): Promise<boolean> => {
    const run = tail
      .catch(() => undefined)
      .then(async () => {
        if (updates.length === 0) return true;
        const current = parseOverrides(await storage.read());
        return storage.write(serializeOverrides(current, updates));
      });
    tail = run;
    return run;
  };
  return { update: (u: OverrideUpdate) => updateMany([u]), updateMany };
}
