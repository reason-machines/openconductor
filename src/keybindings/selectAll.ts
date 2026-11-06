// native.preventSelectAll (⌘A). Conductor 0.87.6 mounts a root hook
// (renderApp-D_fmY7hW.js `X5a`/`J5a`, offset ~11,089,745, read on sven m5 max)
// that adds a capture-phase `keydown` listener on `document`. When the key is
// the command's shortcut and focus is not in an input, a textarea or a
// contenteditable="true" element, it calls preventDefault and stopPropagation,
// so ⌘A does not select every word of the window. Inside a text field ⌘A still
// selects that field's text. (Conductor also lets its tiptap composer through;
// OpenConductor's composer is a textarea, which the tag check covers.)
//
// Pure: the DOM listener is in KeybindingsProvider.tsx.
import { effectiveShortcuts, type Overrides } from "./overrides.ts";
import { matchesEvent, type KeyEventLike } from "./shortcut.ts";

/** The parts of the focused element the check reads. */
export interface SelectAllTarget {
  tagName?: string;
  getAttribute?(name: string): string | null;
}

/** Whether ⌘A keeps its native meaning here: a text field or an editable element. */
export function keepsSelectAll(el: SelectAllTarget | null | undefined): boolean {
  const tag = el?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el?.getAttribute?.("contenteditable") === "true";
}

/** Whether this key press is ⌘A outside a text field, which the app swallows. */
export function preventsSelectAll(e: KeyEventLike, focused: SelectAllTarget | null | undefined, overrides?: Overrides): boolean {
  return effectiveShortcuts("native.preventSelectAll", overrides).some((s) => matchesEvent(s, e)) && !keepsSelectAll(focused);
}
