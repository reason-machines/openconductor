// Conflict check used by the shortcut recorder (evidence/keybindings/README.md, "Conflicts").
// Each scope is CONFLICT_BASE plus one CONFLICT_GROUPS entry; two commands
// conflict only when some scope holds both.
import { effectiveShortcuts, type Overrides } from "./overrides.ts";
import { CONFLICT_BASE, CONFLICT_GROUPS, COMMANDS } from "./registry.ts";
import { equivalent, matchesEvent, type KeyEventLike } from "./shortcut.ts";
import type { Command, Shortcut } from "./types.ts";

const SCOPES: readonly ReadonlySet<string>[] = CONFLICT_GROUPS.map((group) => new Set([...CONFLICT_BASE, ...group]));

export const shareScope = (commandId: string, otherCommandId: string): boolean =>
  SCOPES.some((scope) => scope.has(commandId) && scope.has(otherCommandId));

export interface ConflictQuery {
  commandId: string;
  /** What the recorder would save. */
  shortcut: Shortcut;
  /** The keydown that produced it; a key that fires on this event conflicts too. */
  event?: KeyEventLike;
  overrides?: Overrides;
  commands?: readonly Command[];
}

/** The first other command in a shared scope already bound to this shortcut. */
export function findConflict({ commandId, shortcut, event, overrides = {}, commands = COMMANDS }: ConflictQuery): Command | undefined {
  return commands.find(
    (other) =>
      other.id !== commandId &&
      shareScope(commandId, other.id) &&
      effectiveShortcuts(other.id, overrides).some((key) => (event !== undefined && matchesEvent(key, event)) || equivalent(key, shortcut)),
  );
}

export const conflictMessage = (other: Pick<Command, "title">): string => `Already used by ${other.title}. Type another shortcut.`;
