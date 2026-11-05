import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APP_PREFS, applyUpdate } from "./appPrefs.ts";
import { SIDEBAR_TRANSPARENCY_CLASS, applySidebarTransparency, resolveDark, vibrancyArgs } from "./sidebarTransparency.ts";

test("Sidebar transparency is off by default and saves as its own key", () => {
  assert.equal(DEFAULT_APP_PREFS.experimental_sidebar_transparency, false);
  const on = applyUpdate(DEFAULT_APP_PREFS, { key: "experimental_sidebar_transparency", value: true });
  assert.equal(on.experimental_sidebar_transparency, true);
  assert.deepEqual({ ...on, experimental_sidebar_transparency: false }, DEFAULT_APP_PREFS);
});

test("dark is the explicit theme, else the system setting", () => {
  assert.equal(resolveDark("dark", false), true);
  assert.equal(resolveDark("light", true), false);
  assert.equal(resolveDark(undefined, true), true);
  assert.equal(resolveDark(undefined, false), false);
});

test("update_window_vibrancy gets Conductor's { isDarkMode, enabled }", () => {
  assert.deepEqual(vibrancyArgs(true, false), { isDarkMode: false, enabled: true });
});

test("the root carries Conductor's sidebar-transparency class only while on", () => {
  const classes = new Set<string>();
  const root = { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } } as unknown as HTMLElement;
  applySidebarTransparency(root, true, false);
  assert.equal(SIDEBAR_TRANSPARENCY_CLASS, "sidebar-transparency");
  assert.ok(classes.has("sidebar-transparency"));
  applySidebarTransparency(root, false, false);
  assert.ok(!classes.has("sidebar-transparency"));
});
