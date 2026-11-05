// Conductor's experimental "Sidebar transparency" (`experimental_sidebar_transparency`).
// Its theme provider (renderApp-D_fmY7hW.js) toggles `sidebar-transparency` on <html>
// and calls `update_window_vibrancy({ isDarkMode, enabled })` each time it applies the
// theme; styles.css then lets html, body, #root and the app shell show the window's
// native vibrancy through the sidebar's 60% fill. Here applyAppearance (appearance.ts),
// our theme step, passes the stored setting to setSidebarTransparency at startup and on
// every settings save. The window itself is created transparent only when the setting
// was on at launch (src-tauri/src/sidebar_transparency.rs), which is why the setting
// "Takes effect after you restart".
import { invoke, isTauri } from "@tauri-apps/api/core";

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

let enabled = false;
let applied: string | null = null;
let listening = false;

function sync(): void {
  const root = document.documentElement;
  const dark = resolveDark(root.dataset.theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const key = `${enabled}:${dark}`;
  if (key === applied) return;
  applied = key;
  applySidebarTransparency(root, enabled, dark);
}

/**
 * Keeps the root class and window vibrancy in step with the stored setting and the
 * light/dark mode; call after `data-theme` is set. Re-applies when the system
 * appearance changes, which matters while the theme follows the system.
 */
export function setSidebarTransparency(on: boolean): void {
  enabled = on;
  if (!listening) {
    listening = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
  }
  sync();
}
