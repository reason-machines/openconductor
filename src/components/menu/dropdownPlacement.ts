// Placement of a dropdown menu under its trigger, as Conductor's DropdownMenuContent
// (`Tm`, renderApp-D_fmY7hW.js @2,227,269, read as data) configures Base UI's
// positioner: side "bottom", sideOffset 4, collisionPadding 0, collision
// avoidance { side: "flip", align: "shift" }; the turn menu passes align "start".

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropdownPlacement {
  left: number;
  top: number;
  side: "bottom" | "top";
  /** `--transform-origin`, relative to the popup: the anchor's centre on the edge it opens from. */
  originX: number;
  originY: number;
}

/**
 * Align start under `anchor`; flips to the top when the bottom does not fit and
 * the top does, and shifts along the edge to stay in the viewport.
 */
export function placeDropdown(anchor: Rect, size: { width: number; height: number }, viewport: { width: number; height: number }, sideOffset = 4): DropdownPlacement {
  let side: "bottom" | "top" = "bottom";
  let top = anchor.bottom + sideOffset;
  if (top + size.height > viewport.height) {
    const above = anchor.top - sideOffset - size.height;
    if (above >= 0) {
      side = "top";
      top = above;
    }
  }
  if (side === "bottom") top = Math.max(0, Math.min(top, viewport.height - size.height));
  const left = Math.max(0, Math.min(anchor.left, viewport.width - size.width));
  const originX = (anchor.left + anchor.right) / 2 - left;
  const originY = side === "bottom" ? -sideOffset : size.height + sideOffset;
  return { left, top, side, originX, originY };
}
