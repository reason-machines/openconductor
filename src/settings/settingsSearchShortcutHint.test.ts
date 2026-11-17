import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { Overrides } from "../keybindings/overrides.ts";
import type { SearchItem } from "./searchIndex.ts";

const dependencies = createRequire(resolve("package.json"));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const custom: Overrides = {
  "settings.search": [{ key: { kind: "logical", value: "k" }, modifiers: ["meta", "shift"] }],
};

class ListenerTarget {
  addEventListener() {}
  removeEventListener() {}
}

function compile(path: string, require: (name: string) => unknown, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, { exports: {}, require, ...globals });
}

async function fixture(loadOverrides?: () => Promise<string | undefined>) {
  const document = new ListenerTarget();
  const providerPath = "src/keybindings/KeybindingsProvider.tsx";
  const provider: Pick<typeof import("../keybindings/KeybindingsProvider"), "KeybindingsProvider" | "useKeybindingOverrides" | "useKeybindings"> = compile(
    providerPath, createRequire(resolve(providerPath)), { window: new ListenerTarget(), document },
  );
  const sourcePath = "src/settings/SettingsSearch.tsx";
  const realRequire = createRequire(resolve(sourcePath));
  const search: Pick<typeof import("./SettingsSearch"), "SettingsSearch"> = compile(sourcePath, (name) => {
    if (name === "../keybindings/KeybindingsProvider") return provider;
    if (name === "../components/Icons") return { CloseIcon: () => null, SearchIcon: () => null };
    if (name === "../keybindings/registry") return realRequire("../keybindings/registry.ts");
    if (name === "../keybindings/overrides") return realRequire("../keybindings/overrides.ts");
    if (name === "../keybindings/shortcut") return realRequire("../keybindings/shortcut.ts");
    if (name === "./searchIndex") return realRequire("./searchIndex.ts");
    return realRequire(name);
  }, { document });
  const items: SearchItem[] = [{
    id: "appearance", label: "Appearance", keywords: ["theme"], icon: "appearance", target: { scope: "user", page: "appearance" },
  }];
  const picks: SearchItem[] = [];
  let replace: ((overrides: Overrides) => void) | undefined;
  function View() {
    replace = provider.useKeybindingOverrides().setOverrides;
    return React.createElement(search.SettingsSearch, { items, iconFor: () => null, onPick: (item: SearchItem) => picks.push(item) });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(provider.KeybindingsProvider, { loadOverrides }, React.createElement(View))); });
  return {
    picks,
    hint() {
      const hints = renderer.root.findAllByProps({ "aria-label": "Search settings shortcut" });
      return hints.length === 0 ? undefined : hints[0].findAllByType("span").map((part: { children: string[] }) => part.children.join("")).join("");
    },
    async replace(overrides: Overrides) {
      assert.ok(replace);
      await act(async () => replace?.(overrides));
    },
    async query(value: string) {
      await act(async () => renderer.root.findByType("input").props.onChange({ target: { value } }));
    },
    async clear() {
      await act(async () => renderer.root.findByProps({ "aria-label": "Clear settings search" }).props.onClick());
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("Settings search hint shows the default primary binding", async () => {
  const view = await fixture();
  try { assert.equal(view.hint(), "⌘F"); }
  finally { view.close(); }
});

test("Settings search hint follows a saved binding hydrated after mount", async () => {
  let finish: ((raw: string) => void) | undefined;
  const pending = new Promise<string>((resolve) => { finish = resolve; });
  const view = await fixture(() => pending);
  try {
    assert.equal(view.hint(), "⌘F");
    await act(async () => finish?.(JSON.stringify({ version: 1, overrides: custom })));
    assert.equal(view.hint(), "⌘⇧K");
  } finally { view.close(); }
});

test("Settings search hint follows live remapping and reset on the same mount", async () => {
  const view = await fixture();
  try {
    await view.replace(custom);
    assert.equal(view.hint(), "⌘⇧K");
    await view.replace({});
    assert.equal(view.hint(), "⌘F");
  } finally { view.close(); }
});

test("Settings search hint uses the primary physical binding, not additional alternatives", async () => {
  const view = await fixture();
  try {
    await view.replace({ "settings.search": [
      { key: { kind: "physical", code: "KeyP", display: "P" }, modifiers: ["ctrl", "alt"] },
      ...custom["settings.search"],
    ] });
    assert.equal(view.hint(), "⌃⌥P");
  } finally { view.close(); }
});

test("Settings search query hides the hint and clearing restores it", async () => {
  const view = await fixture();
  try {
    await view.query("theme");
    assert.equal(view.hint(), undefined);
    await view.clear();
    assert.equal(view.hint(), "⌘F");
    assert.deepEqual(view.picks, []);
  } finally { view.close(); }
});

test("Settings search hint is unaffected by another command override", async () => {
  const view = await fixture();
  try {
    await view.replace({ openKeyboardShortcuts: custom["settings.search"] });
    assert.equal(view.hint(), "⌘F");
  } finally { view.close(); }
});
