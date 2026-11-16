// Shortcut dispatcher, matching Conductor's keydown handling (renderApp chunk,
// evidence/keybindings/README.md "Dispatcher"). Pure: the window listeners and
// DOM focus probing live in the adapter, so node --test covers every rule here.
import { matchesEvent, type KeyEventLike } from "./shortcut.ts";
import type { Shortcut, When } from "./types.ts";

/** Higher runs first; within a priority, the shortcut with more modifiers wins. */
export const PRIORITY = { LOW: 10, NORMAL: 50, HIGH: 100, TERMINAL: 150, DIALOG: 200 } as const;

export interface HandlerSpec extends When {
  commandId: string;
  shortcut: Shortcut;
  priority: number;
  /** Return false to pass the key on to the next matching handler. */
  callback: () => boolean | void;
  /** False while the owning view is not the focused scope. */
  isFocusedScope?: boolean;
  allowRepeat?: boolean;
  telemetryContext?: string;
}

export interface Handler extends HandlerSpec {
  id: string;
}

/** Where focus is when the key goes down. */
export interface FocusContext {
  /** The open dialog's id, or null when none is open. */
  activeDialogId: string | null;
  /** Focus is in an input, textarea or contenteditable. */
  typing: boolean;
  /** Focus is inside a terminal. */
  inTerminal: boolean;
  /** A shortcut recorder is capturing keys. */
  recording?: boolean;
}

export interface DispatchEvent extends KeyEventLike {
  repeat: boolean;
}

export interface Telemetry {
  event: "keyboard_shortcut_used";
  keybinding_id: string;
  active_dialog_id?: string;
  telemetry_context?: string;
}

/**
 * What the adapter does with the event. `pass`: nothing. `blur`: blur the
 * focused input. `swallow`: a held-key repeat with no repeatable handler.
 * `ran`: a handler took it. `preventDefault` also means stopImmediatePropagation
 * for `swallow` and `ran`.
 */
export type Outcome =
  | { kind: "pass"; preventDefault: boolean }
  | { kind: "blur"; preventDefault: true }
  | { kind: "swallow"; preventDefault: true }
  | { kind: "ran"; preventDefault: true; commandId: string; telemetry: Telemetry };

const hasModifiers = (s: Shortcut): boolean => (s.modifiers?.length ?? 0) > 0;
const MODIFIER_KEY_NAMES = new Set(["Meta", "Control", "Alt", "Shift"]);

/** May this handler fire in this focus context? */
export function isEnabled(h: When & { shortcut: Shortcut }, ctx: FocusContext): boolean {
  const { activeDialogId, typing, inTerminal } = ctx;
  if (inTerminal && !h.enableOnTerminalFocus) return false;
  if (!inTerminal && h.requireTerminalFocus === true) return false;
  // A bare key would type text, so it needs an explicit opt-in while typing.
  if ((typing || inTerminal) && !hasModifiers(h.shortcut) && !h.allowWhileTyping && !h.requireTerminalFocus) return false;
  if (h.isGlobal) return true;
  if (typing && !h.enableOnInputFocus) return false;
  if (h.enableOnDialogIds && h.enableOnDialogIds.length > 0)
    return activeDialogId !== null && h.enableOnDialogIds.includes(activeDialogId);
  return !activeDialogId;
}

const noModifiersHeld = (e: KeyEventLike): boolean => !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;

export function createDispatcher() {
  const handlers = new Map<string, Handler>();
  let next = 0;

  return {
    register(spec: HandlerSpec): string {
      const id = `handler-${++next}`;
      handlers.set(id, { ...spec, id });
      return id;
    },
    unregister(id: string): void {
      handlers.delete(id);
    },
    handlers: (): Handler[] => [...handlers.values()],

    dispatch(e: DispatchEvent, ctx: FocusContext): Outcome {
      if (ctx.recording || MODIFIER_KEY_NAMES.has(e.key)) return { kind: "pass", preventDefault: false };
      // Backspace outside a text field would navigate back in a webview.
      const preventBackspace = e.key === "Backspace" && !ctx.typing;
      if (e.key === "Escape" && ctx.typing && !ctx.inTerminal && noModifiersHeld(e)) return { kind: "blur", preventDefault: true };

      let matching = [...handlers.values()].filter(
        (h) => h.isFocusedScope !== false && matchesEvent(h.shortcut, e) && isEnabled(h, ctx),
      );
      if (matching.length === 0) return { kind: "pass", preventDefault: preventBackspace };
      if (e.repeat) {
        const repeatable = matching.filter((h) => h.allowRepeat === true);
        if (repeatable.length === 0) return { kind: "swallow", preventDefault: true };
        matching = repeatable;
      }
      matching.sort(
        (a, b) => b.priority - a.priority || (b.shortcut.modifiers?.length ?? 0) - (a.shortcut.modifiers?.length ?? 0),
      );
      for (const h of matching) {
        if (h.callback() === false) continue;
        const telemetry: Telemetry = { event: "keyboard_shortcut_used", keybinding_id: h.commandId };
        if (ctx.activeDialogId !== null) telemetry.active_dialog_id = ctx.activeDialogId;
        if (h.telemetryContext !== undefined) telemetry.telemetry_context = h.telemetryContext;
        return { kind: "ran", preventDefault: true, commandId: h.commandId, telemetry };
      }
      return { kind: "pass", preventDefault: preventBackspace };
    },
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
