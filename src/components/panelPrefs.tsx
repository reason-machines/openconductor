// Left sidebar visibility and width, the right panel and zen mode, persisted in
// conductor.db's settings table (left_panel_visible, left_panel_width,
// right_panel_visible) as Conductor does. The store keeps its own copy of the
// sidebar flag for rendering; this hook loads it from the database and writes it back.
import { useEffect, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { inTauri } from "../backend";
import type { Action } from "../state/store";
import { clampSidebarWidth, getAppPrefs, loadAppPrefs, setAppPref, useAppPrefs } from "../settings/appPrefs";

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

/** The sidebar width as a CSS variable for `.app`, and a drag handle that saves it on release. */
export function useSidebarWidth(): { style: CSSProperties; resizer: JSX.Element } {
  const saved = useAppPrefs().left_panel_width;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? clampSidebarWidth(saved);
  const start = useRef<{ x: number; width: number } | null>(null);
  const resizer = (
    <div
      className={`sidebar-resizer${dragWidth !== null ? " dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        setDragWidth(width);
      }}
      onPointerMove={(e) => {
        if (start.current) setDragWidth(clampSidebarWidth(start.current.width + e.clientX - start.current.x));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const next = clampSidebarWidth(start.current.width + e.clientX - start.current.x);
        start.current = null;
        setAppPref({ key: "left_panel_width", value: next })
          .catch(warn)
          .finally(() => setDragWidth(null));
      }}
    />
  );
  return { style: { "--sidebar-width": `${width}px` } as CSSProperties, resizer };
}
