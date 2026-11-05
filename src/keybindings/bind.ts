// Registry commands bound to callbacks in one shared dispatcher: what Conductor's
// registration hook does for each call site (evidence/keybindings/README.md
// "Registration"). Pure, so node --test covers it; the React glue is in
// KeybindingsProvider.tsx.
import type { Dispatcher } from "./dispatcher.ts";
import { bindingsFor, type BindContext, type BindOptions } from "./resolve.ts";

/** Callbacks by command id. Returning false passes the key to the next handler. */
export type CommandHandlers = Partial<Record<string, () => boolean | void>>;

/**
 * Register one dispatcher handler per effective shortcut of each command that
 * has a callback. Returns a function that removes exactly those handlers.
 */
export function bindCommands(dispatcher: Dispatcher, handlers: CommandHandlers, ctx: BindContext = {}, options: BindOptions = {}): () => void {
  const ids: string[] = [];
  for (const [commandId, callback] of Object.entries(handlers)) {
    if (callback === undefined) continue;
    for (const binding of bindingsFor(commandId, options, ctx)) ids.push(dispatcher.register({ ...binding, callback }));
  }
  return () => {
    for (const id of ids) dispatcher.unregister(id);
  };
}

/** The parts of `document` the dialog probe reads. */
export interface DialogQueryable {
  querySelectorAll(selector: string): ArrayLike<{ dataset?: Record<string, string | undefined> }>;
  querySelector(selector: string): unknown;
}

/**
 * The open dialog's id: the last `[data-dialog-id]` in document order (the one
 * opened on top), else "dialog" for any other modal, else null.
 */
export function activeDialogIdFromDom(doc: DialogQueryable): string | null {
  const tagged = doc.querySelectorAll("[data-dialog-id]");
  const top = tagged.length > 0 ? tagged[tagged.length - 1].dataset?.dialogId : undefined;
  if (top) return top;
  return doc.querySelector('[role="dialog"][aria-modal="true"]') ? "dialog" : null;
}
