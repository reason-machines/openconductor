// parity:diff.appearance:ui
// Pierre's `theme` option from the Code theme setting. Registers the code
// themes with Pierre's highlighter on first use (they load lazily when picked).
import "./appearance.css";
import { useSyncExternalStore } from "react";
import { registerCustomTheme } from "@pierre/diffs";
import { currentCodeTheme, subscribeCodeTheme } from "./appearance.ts";
import { CONDUCTOR_DARK, CONDUCTOR_DARK_THEME, CONDUCTOR_LIGHT, CONDUCTOR_LIGHT_THEME, conductorShikiTheme } from "./conductorCodeTheme.ts";
import { CODE_THEME_IDS, CODE_THEMES, diffThemeFor, shikiNameOf, shikiTheme } from "./codeThemes.ts";

let registered = false;
export function registerCodeThemes(): void {
  if (registered) return;
  registered = true;
  // Conductor Dark and Light, the Default setting's themes (conductorCodeTheme.ts).
  for (const [name, label, type, palette] of [
    [CONDUCTOR_DARK_THEME, "Conductor Dark", "dark", CONDUCTOR_DARK],
    [CONDUCTOR_LIGHT_THEME, "Conductor Light", "light", CONDUCTOR_LIGHT],
  ] as const) {
    registerCustomTheme(name, (() => Promise.resolve(conductorShikiTheme(name, label, type, palette))) as unknown as Parameters<typeof registerCustomTheme>[1]);
  }
  for (const id of CODE_THEME_IDS) {
    const name = shikiNameOf(id);
    // Pierre's loader returns Shiki's ThemeRegistration; ours is a structurally valid subset.
    registerCustomTheme(name, (() => Promise.resolve(shikiTheme(name, CODE_THEMES[id]))) as unknown as Parameters<typeof registerCustomTheme>[1]);
  }
}

const cache = new Map<string, { dark: string; light: string }>();
function snapshot() {
  const t = currentCodeTheme();
  let v = cache.get(t);
  if (!v) cache.set(t, (v = diffThemeFor(t)));
  return v;
}

/** `{dark, light}` Shiki theme names for Pierre, following the Code theme setting. */
export function useDiffTheme(): { dark: string; light: string } {
  registerCodeThemes();
  return useSyncExternalStore(subscribeCodeTheme, snapshot, snapshot);
}
