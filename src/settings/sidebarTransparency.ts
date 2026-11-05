// Conductor's experimental "Sidebar transparency" (`experimental_sidebar_transparency`).
// Its theme provider (renderApp-D_fmY7hW.js) toggles `sidebar-transparency` on <html>
// and calls `update_window_vibrancy({ isDarkMode, enabled })` each time it applies the
// theme; styles.css then lets html, body, #root and the app shell show the window's
// native vibrancy through the sidebar's 60% fill. The window itself is created
// transparent only when the setting was on at launch (src-tauri/src/sidebar_transparency.rs),
// which is why the setting "Takes effect after you restart".
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useAppPrefs } from "./appPrefs.ts";

/** The class Conductor puts on the document root while the setting is on. */
export const SIDEBAR_TRANSPARENCY_CLASS = "sidebar-transparency";

/** Whether dark is in effect: an explicit `data-theme`, else the system setting. */
export function resolveDark(dataTheme: string | undefined, systemDark: boolean): boolean {
  if (dataTheme === "dark") return true;
  if (dataTheme === "light") return false;
  return systemDark;
}

/** The `update_window_vibrancy` arguments, as Conductor's theme provider sends them. */
export function vibrancyArgs(enabled: boolean, isDarkMode: boolean): { isDarkMode: boolean; enabled: boolean } {
  return { isDarkMode, enabled };
}

/** Class on the root, then the native window; the native call is best effort, as in Conductor. */
export function applySidebarTransparency(root: HTMLElement, enabled: boolean, isDarkMode: boolean): void {
  root.classList.toggle(SIDEBAR_TRANSPARENCY_CLASS, enabled);
  if (!isTauri()) return;
  invoke("update_window_vibrancy", vibrancyArgs(enabled, isDarkMode)).catch((err) =>
    console.debug("Failed to update window vibrancy:", err),
  );
}

/** Keeps the root class and window vibrancy in step with the setting and the light/dark mode. */
export function useSidebarTransparency(): void {
  const enabled = useAppPrefs().experimental_sidebar_transparency;
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let last: boolean | null = null;
    const apply = () => {
      const dark = resolveDark(root.dataset.theme, media.matches);
      if (dark === last) return;
      last = dark;
      applySidebarTransparency(root, enabled, dark);
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", apply);
    return () => {
      obs.disconnect();
      media.removeEventListener("change", apply);
    };
  }, [enabled]);
}
