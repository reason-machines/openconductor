// Pure parts of the Conductor tooltip (see Tooltip.tsx): placement and the native-title form.
export const SIDE_OFFSET = 4;
export const COLLISION_PADDING = 8;

export type Side = "top" | "bottom" | "left" | "right";

export interface Placement { left: number; top: number; side: Side }

/** Where the tooltip goes: on `side` of the trigger, flipped when it would leave the window, then clamped. Pure for tests. */
export function placeTooltip(trigger: DOMRect | { left: number; top: number; right: number; bottom: number; width: number; height: number }, size: { width: number; height: number }, viewport: { width: number; height: number }, side: Side = "top", sideOffset = SIDE_OFFSET, pad = COLLISION_PADDING): Placement {
  const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const fits = (s: Side) =>
    s === "top" ? trigger.top - sideOffset - size.height >= pad
    : s === "bottom" ? trigger.bottom + sideOffset + size.height <= viewport.height - pad
    : s === "left" ? trigger.left - sideOffset - size.width >= pad
    : trigger.right + sideOffset + size.width <= viewport.width - pad;
  const chosen = fits(side) || !fits(opposite[side]) ? side : opposite[side];
  let left: number;
  let top: number;
  if (chosen === "top" || chosen === "bottom") {
    left = trigger.left + trigger.width / 2 - size.width / 2;
    top = chosen === "top" ? trigger.top - sideOffset - size.height : trigger.bottom + sideOffset;
  } else {
    top = trigger.top + trigger.height / 2 - size.height / 2;
    left = chosen === "left" ? trigger.left - sideOffset - size.width : trigger.right + sideOffset;
  }
  left = Math.max(pad, Math.min(left, viewport.width - pad - size.width));
  top = Math.max(pad, Math.min(top, viewport.height - pad - size.height));
  return { left: Math.round(left), top: Math.round(top), side: chosen };
}

/** Conductor's `HH(label, commandId)`: a native title of the label and shortcut separated by a space, e.g. "Go back ⌘[". */
export function titleWithShortcut(label: string, shortcut: string | undefined): string {
  return shortcut ? `${label} ${shortcut}` : label;
}
