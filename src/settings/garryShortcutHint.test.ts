import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";

const dependencies = createRequire(resolve("package.json"));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.GARRY_HINT_SOURCE_ROOT ?? ".");
const label = "Don't collapse tool calls (Garry Mode)";
const custom: Overrides = { toggleGarryMode: [{ key: { kind: "logical", value: "k" }, modifiers: ["meta"] }] };

class ListenerTarget {
  addEventListener() {}
  removeEventListener() {}
}

function compile(path: string, require: (name: string) => unknown, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(resolve(sourceRoot, path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, { exports: {}, require, ...globals });
}

function expectedHint(overrides: Overrides = {}) {
  return `Show all tool calls expanded by default instead of collapsed. Toggle with ${effectiveShortcuts("toggleGarryMode", overrides).map(glyphs).join(" or ")}.`;
}

async function fixture(loadOverrides?: () => Promise<string | undefined>) {
  const writes: string[] = [];
  const providerPath = "src/keybindings/KeybindingsProvider.tsx";
  const provider: Pick<typeof import("../keybindings/KeybindingsProvider"), "KeybindingsProvider" | "useKeybindingOverrides"> = compile(
    providerPath, createRequire(resolve(sourceRoot, providerPath)),
    { window: new ListenerTarget(), document: new ListenerTarget() },
  );
  function Row({ children }: { children: ReactNode; help: string }) { return children; }
  const mocks: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": dependencies("react/jsx-runtime"),
    "@tauri-apps/api/core": { isTauri: () => false, invoke: () => { throw new Error("unexpected native call"); } },
    "../GeneralPage": { Row },
    "../appPrefs": { useAppPrefs: () => ({ garry_mode: false }), setAppPref: async (value: unknown) => { writes.push(JSON.stringify(value)); } },
    "../../keybindings/overrides": { effectiveShortcuts },
    "../../keybindings/shortcut": { glyphs },
    "../../home/useDashboardEnabled": {},
  };
  const rows: Pick<typeof import("./rows/AppPrefRows"), "GeneralAppPrefRows"> = compile(
    "src/settings/rows/AppPrefRows.tsx", (name) => {
      assert.ok(Object.prototype.hasOwnProperty.call(mocks, name), `unexpected row dependency ${name}`);
      return mocks[name];
    },
  );
  let update: ((overrides: Overrides) => void) | undefined;
  function GeneralRows() {
    const { overrides, setOverrides } = provider.useKeybindingOverrides();
    update = setOverrides;
    return React.createElement(rows.GeneralAppPrefRows, { overrides });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(provider.KeybindingsProvider, { loadOverrides }, React.createElement(GeneralRows)));
  });
  return {
    writes,
    hint: () => renderer.root.findByType(Row).props.help,
    async replace(overrides: Overrides) {
      assert.ok(update);
      await act(async () => update?.(overrides));
    },
    async toggle(value: boolean) {
      await act(async () => renderer.root.findByProps({ "aria-label": label }).props.onChange({ target: { checked: value } }));
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("Garry Mode help shows the default shortcut without an override", async () => {
  const view = await fixture();
  try { assert.equal(view.hint(), expectedHint()); }
  finally { view.close(); }
});

test("Garry Mode help follows a saved override loaded after mount", async () => {
  let finish: ((raw: string) => void) | undefined;
  const pending = new Promise<string>((resolve) => { finish = resolve; });
  const view = await fixture(() => pending);
  try {
    assert.equal(view.hint(), expectedHint());
    await act(async () => finish?.(JSON.stringify({ version: 1, overrides: custom })));
    assert.equal(view.hint(), expectedHint(custom));
  } finally { view.close(); }
});

test("Garry Mode help updates an already mounted row after a remap", async () => {
  const view = await fixture();
  try {
    await view.replace(custom);
    assert.equal(view.hint(), expectedHint(custom));
  } finally { view.close(); }
});

test("Garry Mode help lists each configured shortcut in order", async () => {
  const overrides: Overrides = { toggleGarryMode: [
    ...custom.toggleGarryMode,
    { key: { kind: "physical", code: "KeyG", display: "G" }, modifiers: ["ctrl", "shift"] },
  ] };
  const view = await fixture();
  try {
    await view.replace(overrides);
    assert.equal(view.hint(), expectedHint(overrides));
  } finally { view.close(); }
});

test("resetting Garry Mode shortcuts restores the default help", async () => {
  const view = await fixture();
  try {
    await view.replace(custom);
    await view.replace({});
    assert.equal(view.hint(), expectedHint());
  } finally { view.close(); }
});

test("Garry Mode switch still saves its preference without native work", async () => {
  const view = await fixture();
  try {
    await view.toggle(true);
    assert.deepEqual(view.writes, ['{"key":"garry_mode","value":true}']);
  } finally { view.close(); }
});
