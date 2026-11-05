import { useEffect, useRef } from "react";
import { resolveBinding, type BindingDef, type FocusContext } from "./keybindings/routing.ts";

export type BindingHandlers = Partial<Record<string, () => void>>;

/** Where keyboard focus is, read from the DOM at the moment of the key press. */
export function focusContextFromDom(doc: Document = document): FocusContext {
  const el = doc.activeElement as HTMLElement | null;
  const dialogs = doc.querySelectorAll<HTMLElement>("[data-dialog-id]");
  const top = dialogs.length > 0 ? dialogs[dialogs.length - 1].dataset.dialogId ?? null : null;
  const openDialogId = top ?? (doc.querySelector('[role="dialog"][aria-modal="true"]') ? "dialog" : null);
  if (el?.closest("[data-terminal]")) return { openDialogId, focus: "terminal" };
  const typing = el !== null && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
  return { openDialogId, focus: typing ? "input" : "none" };
}

/**
 * Route window keydowns through the bindings and call the handler for the
 * winning binding. Keys with no handler fall through untouched.
 */
export function useKeybindings(bindings: readonly BindingDef[], handlers: BindingHandlers): void {
  const latest = useRef({ bindings, handlers });
  latest.current = { bindings, handlers };
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const { bindings: defs, handlers: hs } = latest.current;
      const def = resolveBinding(defs, e, focusContextFromDom());
      const handler = def ? hs[def.id] : undefined;
      if (!handler) return;
      e.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
