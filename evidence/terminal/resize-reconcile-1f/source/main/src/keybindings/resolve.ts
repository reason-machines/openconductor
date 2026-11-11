// Registry commands as dispatcher handlers, the way Conductor's registration
// hook (`oi` in renderApp-D_fmY7hW.js, evidence/keybindings/README.md) builds them:
// defaults, then the enclosing dialog, then the command's `when`, then the
// call site's options; one handler per effective shortcut.
import { isEnabled, PRIORITY, type FocusContext } from "./dispatcher.ts";
import { effectiveShortcuts, type Overrides } from "./overrides.ts";
import { COMMANDS } from "./registry.ts";
import { matchesEvent, type KeyEventLike } from "./shortcut.ts";
import type { Shortcut, When } from "./types.ts";

/** Options a call site passes when it binds a command. */
export interface BindOptions extends When {
  priority?: number;
  telemetryContext?: string;
  enabled?: boolean;
}

export interface Binding extends When {
  commandId: string;
  shortcut: Shortcut;
  priority: number;
  telemetryContext?: string;
  isFocusedScope?: boolean;
}

export interface BindContext {
  overrides?: Overrides;
  isFocusedScope?: boolean;
  /** The dialog the binding component renders inside, if any. */
  dialogId?: string;
}

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/** Handlers for one command, or none when the call site disables it. */
export function bindingsFor(commandId: string, options: BindOptions = {}, ctx: BindContext = {}): Binding[] {
  if (options.enabled === false) return [];
  const command = BY_ID.get(commandId);
  if (command === undefined) throw new Error(`Unknown keybinding: ${commandId}`);
  const w: BindOptions = { ...(ctx.dialogId ? { enableOnDialogIds: [ctx.dialogId] } : {}), ...command.when, ...options };
  return effectiveShortcuts(commandId, ctx.overrides).map((shortcut) => ({
    commandId,
    shortcut,
    isFocusedScope: ctx.isFocusedScope,
    priority: w.priority ?? PRIORITY.NORMAL,
    enableOnInputFocus: w.enableOnInputFocus ?? true,
    enableOnDialogIds: w.enableOnDialogIds,
    isGlobal: w.isGlobal ?? false,
    enableOnTerminalFocus: w.enableOnTerminalFocus ?? true,
    requireTerminalFocus: w.requireTerminalFocus ?? false,
    allowWhileTyping: w.allowWhileTyping ?? false,
    telemetryContext: w.telemetryContext,
  }));
}

/**
 * Which of `commandIds` this key press runs, using the dispatcher's rules:
 * enabled in `focus`, then higher priority, then more modifiers, then list order.
 */
export function resolveCommand(
  e: KeyEventLike,
  focus: FocusContext,
  commandIds: readonly string[],
  ctx: BindContext = {},
): string | undefined {
  const hits = commandIds
    .flatMap((id) => bindingsFor(id, {}, ctx))
    .filter((b) => matchesEvent(b.shortcut, e) && isEnabled(b, focus));
  hits.sort((a, b) => b.priority - a.priority || (b.shortcut.modifiers?.length ?? 0) - (a.shortcut.modifiers?.length ?? 0));
  return hits[0]?.commandId;
}
