import { useEffect, useRef } from "react";
import type { FocusContext } from "../keybindings/dispatcher.ts";
import type { Overrides } from "../keybindings/overrides.ts";
import { resolveCommand } from "../keybindings/resolve.ts";

export type BindingHandlers = Partial<Record<string, () => void>>;

/** Where keyboard focus is, read from the DOM at the moment of the key press. */
export function focusContextFromDom(doc: Document = document): FocusContext {
  const el = doc.activeElement as HTMLElement | null;
  const dialogs = doc.querySelectorAll<HTMLElement>("[data-dialog-id]");
  const top = dialogs.length > 0 ? dialogs[dialogs.length - 1].dataset.dialogId ?? null : null;
  const activeDialogId = top ?? (doc.querySelector('[role="dialog"][aria-modal="true"]') ? "dialog" : null);
  const inTerminal = el?.closest("[data-terminal]") != null;
  const typing = el !== null && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
  return { activeDialogId, typing: typing && !inTerminal, inTerminal };
}

/**
 * Route window keydowns through the registry (src/keybindings) and call the
 * handler for the command that wins. Keys with no handler fall through untouched.
 */
export function useKeybindings(handlers: BindingHandlers, overrides: Overrides = {}): void {
  const latest = useRef({ handlers, overrides });
  latest.current = { handlers, overrides };
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const { handlers: hs, overrides: ov } = latest.current;
      const ids = Object.keys(hs).filter((id) => hs[id] !== undefined);
      const id = resolveCommand(e, focusContextFromDom(), ids, { overrides: ov });
      const handler = id === undefined ? undefined : hs[id];
      if (!handler) return;
      e.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
