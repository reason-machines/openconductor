import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { AppPrefs, AppPrefUpdate } from "./appPrefs.ts";

const dependencies = createRequire(process.env.APP_PREF_WRITES_DEPS
  ? resolve(process.env.APP_PREF_WRITES_DEPS, "package.json") : import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.APP_PREF_WRITES_SOURCE_ROOT ?? ".");

type Request = { command: string; finish: () => void };

async function fixture({ startup = false, native = true } = {}) {
  const requests: Request[] = [];
  const calls: string[] = [];
  const warnings: unknown[][] = [];
  let failWrite = false;
  let failRead = false;
  let persisted: AppPrefs;
  function load<T>(path: string, mocks: Record<string, unknown>): T {
    const source = readFileSync(resolve(sourceRoot, path), "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    return runInNewContext(`${javascript}\nexports;`, {
      exports,
      console: { warn: (...args: unknown[]) => warnings.push(args) },
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        assert.ok(Object.prototype.hasOwnProperty.call(mocks, name), `unexpected preference dependency ${name}`);
        return mocks[name];
      },
    });
  }
  const ipc = {
    isTauri: () => native,
    invoke(command: string, args?: { update?: AppPrefUpdate; appId?: string; isRemote?: boolean | null }) {
      calls.push(command);
      let failed = false;
      if (command === "set_app_pref") {
        assert.ok(args?.update);
        failed = failWrite;
        failWrite = false;
        if (!failed) persisted = store.applyUpdate(persisted, args.update);
      } else if (command === "record_open_in") {
        assert.ok(args?.appId);
        const entry = `${args.appId}|${args.isRemote ? "remote" : "local"}`;
        persisted = { ...persisted, default_open_in: args.appId,
          open_in_mru_order: [entry, ...persisted.open_in_mru_order.filter((value) => value !== entry)] };
      } else {
        assert.equal(command, "get_app_prefs");
        failed = failRead;
        failRead = false;
      }
      const snapshot = { ...persisted };
      return new Promise<AppPrefs>((accept, reject) => requests.push({ command, finish() {
        if (failed) reject(new Error(`${command} fixture failure`));
        else accept(snapshot);
      } }));
    },
  };
  const store = load<typeof import("./appPrefs.ts")>("src/settings/appPrefs.ts", {
    "@tauri-apps/api/core": ipc,
    "../home/sidebarSort.ts": { parseSidebarSort: () => "updated" },
    "../home/sidebarGroupBy.ts": { parseSidebarGroupBy: () => "repo" },
  });
  persisted = { ...store.DEFAULT_APP_PREFS };
  const rows = load<Pick<typeof import("./rows/AppPrefRows"), "TabFreakModeRow" | "NewWorkspacePageRow">>("src/settings/rows/AppPrefRows.tsx", {
    "@tauri-apps/api/core": ipc,
    "../appPrefs": store,
    "../GeneralPage": { Row: ({ children }: { children: ReactNode }) => children },
    "../../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../../keybindings/shortcut": { glyphs: () => "" },
    "../../home/useDashboardEnabled": {},
  });
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(React.Fragment, null,
      React.createElement(rows.NewWorkspacePageRow), React.createElement(rows.TabFreakModeRow)));
  });
  const checked = (label: string) => renderer.root.findByProps({ "aria-label": label }).props.checked;
  const view = {
    store, calls, warnings,
    persisted: () => persisted,
    tabFreak: () => checked("Tab Freak Mode"),
    newWorkspace: () => checked("New workspace page"),
    async change(label: string, value: boolean) {
      await act(async () => renderer.root.findByProps({ "aria-label": label }).props.onChange({ target: { checked: value } }));
    },
    async respond(latest = false) {
      const request = latest ? requests.pop() : requests.shift();
      assert.ok(request, "an external preference reply is pending");
      await act(async () => request.finish());
    },
    async drain(latest = false) {
      for (let step = 0; requests.length && step < 20; step++) await view.respond(latest);
      assert.equal(requests.length, 0, "all fixture replies settled");
    },
    failNextWrite() { failWrite = true; },
    failNextRead() { failRead = true; },
    close() { act(() => renderer.unmount()); },
  };
  if (!startup && native) await view.drain();
  return view;
}

for (const latest of [false, true]) {
  test(`mounted preference switches preserve newer choices with ${latest ? "newest" : "oldest"} available reply first`, async () => {
    const view = await fixture();
    try {
      await view.change("New workspace page", true);
      await view.change("Tab Freak Mode", true);
      assert.equal(view.tabFreak(), true);
      await view.respond(latest);
      assert.equal(view.tabFreak(), true, "another key's confirmation must not revert the pending switch");
      await view.drain(latest);
      assert.equal(view.tabFreak(), true);
      assert.equal(view.newWorkspace(), true);
      assert.equal(view.store.getAppPrefs().experimental_tab_freak_mode, true);
      assert.equal(view.persisted().experimental_tab_freak_mode, true);
    } finally { view.close(); }
  });
}

test("mounted repeated toggles keep the latest false choice while earlier true is confirmed", async () => {
  const view = await fixture();
  try {
    await view.change("Tab Freak Mode", true);
    await view.change("Tab Freak Mode", false);
    await view.respond();
    assert.equal(view.tabFreak(), false);
    await view.drain();
    assert.equal(view.tabFreak(), false);
    assert.equal(view.persisted().experimental_tab_freak_mode, false);
  } finally { view.close(); }
});

test("startup read preserves a mounted switch edited before its reply", async () => {
  const view = await fixture({ startup: true });
  try {
    assert.equal(view.store.appPrefsReady(), false);
    await view.change("Tab Freak Mode", true);
    await view.respond();
    assert.equal(view.store.appPrefsReady(), true);
    assert.equal(view.tabFreak(), true);
    await view.drain();
    assert.equal(view.tabFreak(), true);
  } finally { view.close(); }
});

test("an explicit refresh cannot replace a newer optimistic switch", async () => {
  const view = await fixture();
  try {
    let refresh = Promise.resolve(view.store.getAppPrefs());
    await act(async () => { refresh = view.store.loadAppPrefs(); });
    await view.change("Tab Freak Mode", true);
    await view.respond();
    assert.equal(view.tabFreak(), true);
    await view.drain();
    await refresh;
    assert.equal(view.persisted().experimental_tab_freak_mode, true);
  } finally { view.close(); }
});

test("failed earlier preference save rolls back only its own optimistic choice", async () => {
  const view = await fixture();
  try {
    view.failNextWrite();
    await view.change("New workspace page", true);
    await view.change("Tab Freak Mode", true);
    await view.respond();
    await view.respond(true);
    assert.equal(view.tabFreak(), true);
    await view.drain();
    assert.equal(view.newWorkspace(), false);
    assert.equal(view.tabFreak(), true);
    assert.equal(view.persisted().experimental_tab_freak_mode, true);
    assert.equal(view.warnings.length, 1);
  } finally { view.close(); }
});

test("failed refresh after a rejected save does not strand later writes", async () => {
  const view = await fixture();
  try {
    view.failNextWrite();
    view.failNextRead();
    await view.change("New workspace page", true);
    await view.change("Tab Freak Mode", true);
    await view.drain();
    assert.equal(view.newWorkspace(), false);
    assert.equal(view.tabFreak(), true);
    assert.equal(view.persisted().experimental_tab_freak_mode, true);
    assert.equal(view.warnings.length, 1);
  } finally { view.close(); }
});

test("Open in MRU confirmation preserves a later mounted switch", async () => {
  const view = await fixture();
  try {
    let recorded = Promise.resolve(view.store.getAppPrefs());
    await act(async () => { recorded = view.store.recordOpenIn("editor", false); });
    await view.change("Tab Freak Mode", true);
    await view.respond();
    assert.equal(view.tabFreak(), true);
    await view.drain();
    await recorded;
    assert.equal(view.store.getAppPrefs().default_open_in, "editor");
    assert.deepEqual([...view.store.getAppPrefs().open_in_mru_order], ["editor|local"]);
    assert.equal(view.tabFreak(), true);
  } finally { view.close(); }
});

test("successful width writes retain authoritative whole-pixel normalization", async () => {
  const view = await fixture();
  try {
    let saved = Promise.resolve(view.store.getAppPrefs());
    await act(async () => { saved = view.store.setAppPref({ key: "left_panel_width", value: 300.6 }); });
    assert.equal(view.store.getAppPrefs().left_panel_width, 301);
    await view.drain();
    assert.equal((await saved).left_panel_width, 301);
    assert.equal(view.persisted().left_panel_width, 301);
  } finally { view.close(); }
});

test("browser fallback remains immediate and never invokes a native command", async () => {
  const view = await fixture({ native: false });
  try {
    await view.change("New workspace page", true);
    await view.change("Tab Freak Mode", true);
    await view.change("Tab Freak Mode", false);
    assert.equal(view.newWorkspace(), true);
    assert.equal(view.tabFreak(), false);
    assert.deepEqual(view.calls, []);
  } finally { view.close(); }
});
