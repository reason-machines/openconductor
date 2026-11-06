// Where a right-click menu goes (pure, for tests). Conductor's menus open on the
// pointer: side "right", align "start" (Base UI Menu positioner), shifted inside
// the window and flipped to the pointer's left when there is no room on the right.

export interface Point { x: number; y: number }
export interface MenuPlacement { left: number; top: number; originX: number; originY: number }

/** `offset` is the gap Conductor leaves from the pointer (settings nav: x 2; link menu: x 0, y -5). */
export function placeMenu(at: Point, size: { width: number; height: number }, viewport: { width: number; height: number }, offset: Point = { x: 0, y: 0 }, pad = 5): MenuPlacement {
  let left = at.x + offset.x;
  if (left + size.width > viewport.width - pad && at.x - offset.x - size.width >= pad) left = at.x - offset.x - size.width;
  left = Math.max(pad, Math.min(left, viewport.width - pad - size.width));
  let top = at.y + offset.y;
  top = Math.max(pad, Math.min(top, viewport.height - pad - size.height));
  left = Math.round(left);
  top = Math.round(top);
  // Scale from the pointer, as Base UI's --transform-origin does.
  return { left, top, originX: Math.round(at.x - left), originY: Math.round(at.y - top) };
}
