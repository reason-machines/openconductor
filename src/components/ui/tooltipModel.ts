// Pure parts of Conductor's tooltip (renderApp-D_fmY7hW.js; see parity/side-by-side/chat-diff-pr/tooltips/README.md).
import { effectiveShortcuts, type Overrides } from "../../keybindings/overrides.ts";
import { partGlyph, shortcutParts } from "../../keybindings/shortcut.ts";
import type { Shortcut } from "../../keybindings/types.ts";

/**
 * Base UI's trigger delay when neither the call site nor a provider sets one
 * (`sRn=600` in the bundle). Conductor's root TooltipProvider (`nci` in `jTa`)
 * sets no delay, so the first tooltip waits this long and neighbours opened
 * within `PROVIDER_TIMEOUT_MS` of a close open at once.
 */
export const DEFAULT_DELAY_MS = 600;
export const PROVIDER_TIMEOUT_MS = 400;

/** `ni` (TooltipContent) defaults: side top, sideOffset 4, collisionPadding 8. */
export const CONTENT_DEFAULTS = { side: "top", sideOffset: 4, collisionPadding: 8 } as const;

/**
 * The shortcuts `Ss` shows for a command: the user's override when set
 * (an empty override means unbound, so nothing is shown), else the key and
 * its additional keys.
 */
export function hintShortcuts(commandId: string, overrides: Overrides = {}): readonly Shortcut[] {
  return effectiveShortcuts(commandId, overrides);
}

/** One display token per part, as Conductor's `bbi`; "enter" is drawn as an icon by the component. */
export const hintParts = (s: Shortcut): string[] => shortcutParts(s).map((p) => (p.toLowerCase() === "enter" ? "enter" : partGlyph(p)));

/** Plain text for a tooltip whose label ends with a shortcut, like Conductor's `HH` ("New chat ⌘T"). */
export function labelWithShortcut(label: string, commandId: string, overrides: Overrides = {}): string {
  const first = hintShortcuts(commandId, overrides)[0];
  return first ? `${label} ${shortcutParts(first).map(partGlyph).join("")}` : label;
}
