import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { DEFAULT_SETTINGS } from "./types.ts";

const dependencies = createRequire(import.meta.url);
const ts = dependencies("typescript");
const tauriMocks = dependencies("@tauri-apps/api/mocks");
const sourceRoot = resolve(process.env.NATIVE_ZOOM_SOURCE_ROOT ?? ".");
const settle = () => new Promise<void>((accept) => setImmediate(accept));

function fixture(native: boolean) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  const calls: { command: string; args: unknown }[] = [];
  const errors: unknown[][] = [];
  let fail = false;
  let held: (() => void) | undefined;
  let holdNext = false;
  tauriMocks.mockWindows("zoom-fixture");
  tauriMocks.mockIPC((command: string, args: unknown) => {
    calls.push({ command, args });
    if (fail) {
      fail = false;
      return Promise.reject(new Error("zoom permission denied"));
    }
    if (holdNext) {
      holdNext = false;
      return new Promise<void>((accept) => { held = accept; });
    }
  });
  const properties = new Map<string, string>();
  const style = {
    zoom: "2",
    setProperty: (name: string, value: string) => properties.set(name, value),
    removeProperty: (name: string) => properties.delete(name),
  };
  const root = { style, dataset: {} };
  let nativeZoom: typeof import("./nativeZoom.ts") | undefined;
  const imports: Record<string, unknown> = {
    "@tauri-apps/api/core": { isTauri: () => native },
    "@tauri-apps/api/webview": dependencies("@tauri-apps/api/webview"),
    "../features/terminal/font.ts": { terminalFontFrom: () => ({}), setTerminalFont() {} },
    "../features/terminal/scrollback.ts": { scrollbackRows: () => 100, setScrollbackRows() {} },
    "../features/terminal/bigTerminal.ts": { customCommandsFrom: () => ({}), presetFrom: () => "default", setBigTerminal() {} },
    "../features/diff/appearance.ts": { applyDiffAppearance() {} },
    "../theme/palettes.ts": { applyPalette() {}, paletteFrom: () => "default" },
    "./agentSettings.ts": { executablePaths: () => ({}) },
    "./prefs.ts": { boolPref: () => false },
    "./sidebarTransparency.ts": { setSidebarTransparency() {} },
  };
  function load<T>(path: string): T {
    const javascript = ts.transpileModule(readFileSync(resolve(sourceRoot, path), "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const module = runInNewContext(`${javascript}\nexports;`, {
      exports,
      document: { documentElement: root },
      console: { error: (...args: unknown[]) => errors.push(args) },
      require(name: string) {
        if (name === "./nativeZoom.ts") {
          nativeZoom ??= load("src/settings/nativeZoom.ts");
          return nativeZoom;
        }
        assert.ok(Object.hasOwn(imports, name), `unexpected zoom dependency ${name}`);
        return imports[name];
      },
    });
    return module;
  }
  const appearance = load<typeof import("./appearance.ts")>("src/settings/appearance.ts");
  return {
    calls, errors, style, properties,
    apply(zoom: number) {
      appearance.applyAppearance({ ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, zoom_level_v2: zoom } });
    },
    failNext() { fail = true; },
    holdNext() { holdNext = true; },
    release() { assert.ok(held, "a native request is held"); held(); },
    close() {
      tauriMocks.clearMocks();
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

for (const zoom of [0.5, 1, 1.5, 3]) {
  test(`appearance applies ${zoom} through the real current-Webview SDK without CSS multiplication`, async () => {
    const view = fixture(true);
    try {
      view.apply(zoom);
      await settle();
      assert.equal(view.style.zoom, "", "native mode clears stale CSS zoom");
      assert.deepEqual(view.calls, [{ command: "plugin:webview|set_webview_zoom", args: { label: "zoom-fixture", value: zoom } }]);
      assert.equal(view.properties.get("--webview-zoom"), String(zoom));
      assert.equal(view.errors.length, 0);
    } finally { view.close(); }
  });
}

test("browser appearance retains CSS-only zoom including reset and sends no native IPC", async () => {
  const view = fixture(false);
  try {
    for (const zoom of [0.5, 1.5, 3, 1]) {
      view.apply(zoom);
      await settle();
      assert.equal(view.style.zoom, zoom === 1 ? "" : String(zoom));
    }
    assert.deepEqual(view.calls, []);
    assert.equal(view.errors.length, 0);
  } finally { view.close(); }
});

test("native zoom requests stay ordered across a delayed reply and preserve reset", async () => {
  const view = fixture(true);
  try {
    view.holdNext();
    view.apply(1.5);
    view.apply(3);
    view.apply(1);
    await settle();
    assert.equal(view.calls.length, 1);
    view.release();
    await settle();
    assert.deepEqual(view.calls.map((call) => call.args), [
      { label: "zoom-fixture", value: 1.5 }, { label: "zoom-fixture", value: 3 }, { label: "zoom-fixture", value: 1 },
    ]);
    assert.equal(view.properties.get("--webview-zoom"), "1");
    assert.equal(view.style.zoom, "");
  } finally { view.close(); }
});

test("permission rejection is reported without CSS fallback and does not poison later requests", async () => {
  const view = fixture(true);
  try {
    view.failNext();
    view.apply(1.5);
    await settle();
    assert.equal(view.errors.length, 1);
    assert.match(view.errors[0].map(String).join(" "), /zoom permission denied/);
    assert.equal(view.style.zoom, "");
    assert.equal(view.properties.has("--webview-zoom"), false, "a denied native call is not marked applied");
    view.apply(1.5);
    await settle();
    assert.equal(view.calls.length, 2);
    assert.equal(view.properties.get("--webview-zoom"), "1.5");
  } finally { view.close(); }
});

test("unrelated appearance saves do not repeat a successful native zoom", async () => {
  const view = fixture(true);
  try {
    view.apply(1.5);
    await settle();
    view.apply(1.5);
    await settle();
    assert.equal(view.calls.length, 1);
  } finally { view.close(); }
});

test("the main capability grants only the required additional webview setter", () => {
  const capability = JSON.parse(readFileSync(resolve(sourceRoot, "src-tauri/capabilities/default.json"), "utf8"));
  assert.deepEqual(capability.windows, ["main"]);
  assert.ok(capability.permissions.includes("core:webview:allow-set-webview-zoom"));
});
