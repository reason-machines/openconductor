// view.toggleLeftSidebar per evidence/keybindings/keybindings.json: Cmd+B, plus a bare "["
// that only applies when the user is not typing. Pure so node --test can cover it.

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export const TOGGLE_LEFT_SIDEBAR_HINT = "⌘B or [";

export function isToggleLeftSidebar(e: KeyLike, typing: boolean): boolean {
  if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") return true;
  return !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "[";
}

/** True when keystrokes go into a text control rather than to app shortcuts. */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  return el.isContentEditable === true || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
