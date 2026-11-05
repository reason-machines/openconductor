// Left sidebar visibility and width, the right panel and zen mode, persisted in
// conductor.db's settings table (left_panel_visible, left_panel_width,
// right_panel_visible) as Conductor does. The store keeps its own copy of the
// sidebar flag for rendering; this hook loads it from the database and writes it back.
import { useEffect, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { inTauri } from "../backend";
import type { Action } from "../state/store";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth, getAppPrefs, loadAppPrefs, setAppPref, useAppPrefs } from "../settings/appPrefs";

function warn(err: unknown) {
  console.warn("could not save panel layout", err);
}

/** Keeps the store's sidebar flag and `left_panel_visible` in step. */
export function useSidebarVisiblePref(visible: boolean, dispatch: Dispatch<Action>): void {
  const synced = useRef(!inTauri());
  useEffect(() => {
    if (!inTauri()) return;
    loadAppPrefs()
      .then((p) => dispatch({ type: "setSidebarVisible", visible: p.left_panel_visible }))
      .catch(warn)
      .finally(() => {
        synced.current = true;
      });
  }, [dispatch]);
  useEffect(() => {
    if (synced.current && visible !== getAppPrefs().left_panel_visible) setAppPref({ key: "left_panel_visible", value: visible }).catch(warn);
  }, [visible]);
}

/** ⌥⌘B: show or hide the right panel. */
export function toggleRightPanel(): void {
  setAppPref({ key: "right_panel_visible", value: !getAppPrefs().right_panel_visible }).catch(warn);
}

/** ⌘.: hide both side panels, or show both when both are hidden (Conductor's zen mode). */
export function toggleZenMode(sidebarVisible: boolean, dispatch: Dispatch<Action>): void {
  const show = !sidebarVisible && !getAppPrefs().right_panel_visible;
  dispatch({ type: "setSidebarVisible", visible: show });
  setAppPref({ key: "right_panel_visible", value: show }).catch(warn);
}

/** ⌃O: Garry Mode on or off. */
export function toggleGarryMode(): void {
  setAppPref({ key: "garry_mode", value: !getAppPrefs().garry_mode }).catch(warn);
}

/**
 * The sidebar width as a CSS variable for `.app`, and Conductor's rail (`Nta`,
 * decoded renderApp-D_fmY7hW.js @ byte 9,970,616; provider `Eta` @ 9,965,090):
 * a primary-button drag previews the clamped width without saving it, release
 * saves it to `left_panel_width`, a cancelled pointer goes back to the width the
 * drag started at, and a double-click resets to 256 and saves that. There is no
 * snap or collapse: the width only clamps to 192–480 (`Zsa` / `eoa`).
 */
export function useSidebarWidth(): { style: CSSProperties; resizer: JSX.Element } {
  const saved = useAppPrefs().left_panel_width;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? clampSidebarWidth(saved);
  const start = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const commit = (next: number) => {
    setDragWidth(next);
    setAppPref({ key: "left_panel_width", value: next })
      .catch(warn)
      .finally(() => setDragWidth(null));
  };
  const resizer = (
    <button
      type="button"
      className="sidebar-resizer"
      data-dragging={dragWidth !== null && start.current !== null ? "" : undefined}
      tabIndex={-1}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={Math.round(width)}
      onDoubleClick={() => commit(SIDEBAR_DEFAULT_WIDTH)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pointerId: e.pointerId, x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        e.preventDefault();
        setDragWidth(clampSidebarWidth(s.width + e.clientX - s.x));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        if (!s) return;
        if (e.currentTarget.hasPointerCapture(s.pointerId)) e.currentTarget.releasePointerCapture(s.pointerId);
        start.current = null;
        commit(clampSidebarWidth(s.width + e.clientX - s.x));
      }}
      onPointerCancel={() => {
        const s = start.current;
        if (!s) return;
        start.current = null;
        setDragWidth(null);
      }}
    />
  );
  return { style: { "--sidebar-width": `${width}px` } as CSSProperties, resizer };
}
