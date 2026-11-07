import { test } from "node:test";
import assert from "node:assert/strict";
import { applyUpdate, clampSidebarWidth, DEFAULT_APP_PREFS, getAppPrefs, setAppPref } from "./appPrefs.ts";
import { canOpenTerminal, emptyTabs, MAX_TABS, tabLimit, type TabsState } from "../features/terminal/tabs.ts";

test("defaults are Conductor's hook defaults", () => {
  assert.equal(DEFAULT_APP_PREFS.left_panel_visible, true);
  assert.equal(DEFAULT_APP_PREFS.right_panel_visible, true);
  assert.equal(DEFAULT_APP_PREFS.left_panel_width, 256);
  assert.equal(DEFAULT_APP_PREFS.onboarding_step, 0);
  assert.equal(DEFAULT_APP_PREFS.first_time_onboarding_step, 1);
  assert.equal(DEFAULT_APP_PREFS.garry_mode, false);
  assert.equal(DEFAULT_APP_PREFS.graphite_disabled, false);
});

test("an update changes only its key; widths are whole pixels", () => {
  const next = applyUpdate(DEFAULT_APP_PREFS, { key: "garry_mode", value: true });
  assert.equal(next.garry_mode, true);
  assert.deepEqual({ ...next, garry_mode: false }, DEFAULT_APP_PREFS);
  assert.equal(applyUpdate(DEFAULT_APP_PREFS, { key: "left_panel_width", value: 300.6 }).left_panel_width, 301);
});

test("browser project filtering publishes and persists the same shared preference", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    await setAppPref({ key: "sidebar_repo_filter", value: "repo-tide-web" });
    assert.equal(getAppPrefs().sidebar_repo_filter, "repo-tide-web");
    assert.equal(storage.getItem("openconductor.sidebar_repo_filter"), "repo-tide-web");
    await setAppPref({ key: "sidebar_repo_filter", value: null });
    assert.equal(getAppPrefs().sidebar_repo_filter, null);
    assert.equal(storage.getItem("openconductor.sidebar_repo_filter"), null);
  } finally {
    await setAppPref({ key: "sidebar_repo_filter", value: null });
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("the sidebar drags between 192 and 480 pixels", () => {
  assert.equal(clampSidebarWidth(100), 192);
  assert.equal(clampSidebarWidth(1000), 480);
  assert.equal(clampSidebarWidth(300.4), 300);
  assert.equal(clampSidebarWidth(Number.NaN), 256);
});

test("Tab Freak Mode raises the per-workspace tab limit from 5 to 10, counting the chat tab", () => {
  const withTerminals = (n: number): TabsState => ({ ...emptyTabs(), tabs: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `T${i}`, status: "running" as const })) });
  assert.equal(tabLimit(false), 5);
  assert.equal(tabLimit(true), MAX_TABS);
  assert.equal(canOpenTerminal(withTerminals(3), false), true);
  assert.equal(canOpenTerminal(withTerminals(4), false), false, "chat + 4 terminals is 5");
  assert.equal(canOpenTerminal(withTerminals(4), true), true);
  assert.equal(canOpenTerminal(withTerminals(9), true), false);
});
