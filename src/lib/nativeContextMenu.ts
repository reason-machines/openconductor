// Right-click outside text fields shows no menu, as in Conductor.
//
// Conductor's renderApp installs one document `contextmenu` listener at startup
// (`D$r`, decoded renderApp-D_fmY7hW.js @736,913) that cancels the webview's
// default menu unless the target is an <input>, a <textarea> or an editable
// [contenteditable]; images and CodeMirror editors (`.cm-editor`) never get it.
// Elements with their own menu (sidebar rows, tabs) open it from React's
// onContextMenu, which runs first and is unaffected.

/** The part of a DOM element the rule reads. */
export interface ContextMenuTarget {
  closest(selector: string): ContextMenuTarget | null;
  readonly isContentEditable?: boolean;
}

function asTarget(t: unknown): ContextMenuTarget | null {
  return typeof t === "object" && t !== null && typeof (t as ContextMenuTarget).closest === "function" ? (t as ContextMenuTarget) : null;
}

/** True when right-clicking `target` should keep the webview's own menu (cut, copy, paste, spelling). */
export function keepsNativeContextMenu(target: unknown): boolean {
  const el = asTarget(target);
  if (el === null || el.closest("img") !== null || el.closest(".cm-editor") !== null) return false;
  if (el.closest("input, textarea") !== null) return true;
  return el.closest("[contenteditable]")?.isContentEditable === true;
}

/** Installs the rule on `doc`; returns its remover. */
export function installContextMenuGuard(doc: Pick<Document, "addEventListener" | "removeEventListener"> = document): () => void {
  const onContextMenu = (e: Event) => {
    if (!keepsNativeContextMenu(e.target)) e.preventDefault();
  };
  doc.addEventListener("contextmenu", onContextMenu);
  return () => doc.removeEventListener("contextmenu", onContextMenu);
}
