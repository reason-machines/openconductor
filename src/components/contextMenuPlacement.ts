// Where a right-click menu goes: Conductor's Base UI context menu positioner
// (`gy`: side "right", sideOffset 2, align "start", collisionPadding 0), so the
// popup's top-left sits just right of the pointer, flips to the pointer's left
// when it would leave the window, and shifts up to stay inside it.

export interface Point {
  x: number;
  y: number;
}

/** Where a popup of size `w`×`h` goes when opened from `at`, kept inside the window. */
export function placeMenu(at: Point, w: number, h: number, view: { width: number; height: number }, sideOffset = 2): { left: number; top: number; originX: "left" | "right"; originY: "top" | "bottom" } {
  let left = at.x + sideOffset;
  let originX: "left" | "right" = "left";
  if (left + w > view.width && at.x - sideOffset - w >= 0) {
    left = at.x - sideOffset - w;
    originX = "right";
  }
  left = Math.max(0, Math.min(left, view.width - w));
  let top = at.y;
  let originY: "top" | "bottom" = "top";
  if (top + h > view.height) {
    top = Math.max(0, view.height - h);
    originY = "bottom";
  }
  return { left, top, originX, originY };
}

