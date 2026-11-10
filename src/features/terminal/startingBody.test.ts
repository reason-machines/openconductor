import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps } from "react";
import type { PanelStrip } from "../../components/PanelStrip";
import type { TerminalHost } from "./TerminalPanel";
import { canOpenTerminal, emptyTabs, terminalTabs, tabsReducer, type TabsAction } from "./tabs.ts";

const deps = createRequire(resolve(process.env.TERMINAL_SSR_DEPS ?? ".", "package.json"));
const React: typeof import("react") = deps("react");
const { renderToStaticMarkup }: typeof import("react-dom/server") = deps("react-dom/server");
const ts: typeof import("typescript") = deps("typescript");
const workspace: ComponentProps<typeof PanelStrip>["workspace"] = {
  id: "startup-body-workspace", name: "Startup body", branch: "main", status: "idle",
  diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/local-workspace",
};
const repo: ComponentProps<typeof PanelStrip>["repo"] = {
  id: "startup-body-repo", name: "Startup body", path: "/fixture/local-repo", defaultBranch: "main", workspaces: [workspace],
};
type SourceExports = Record<string, unknown> & {
  PanelStrip?: typeof PanelStrip;
  TerminalHost?: typeof TerminalHost;
};

function fixture() {
  let state = emptyTabs();
  const modules = new Map<string, { exports: SourceExports }>();
  const unexpected = () => { throw new Error("SSR must not run terminal effects or dispatch IPC"); };
  const session = {
    getTabs(id: string) { assert.equal(id, workspace.id); return state; },
    subscribeTabs: unexpected,
    getFindRequests: () => 0,
    terminalOf: () => undefined,
    attachTab: unexpected,
    clearTab: unexpected,
    closeTab: unexpected,
    openTab: unexpected,
    restoreWorkspaceTabs: unexpected,
    selectTab: unexpected,
  };
  const boundaries: Record<string, unknown> = {
    "src/features/terminal/session": session,
    "src/features/terminal/tabs": { canOpenTerminal, emptyTabs, terminalTabs, tabsReducer },
    "src/components/ScriptsPanel": { ScriptsPanel: () => null },
    "src/settings/appPrefs": { useAppPrefs: () => ({ experimental_tab_freak_mode: false }) },
    "src/features/chat/ChatModelPicker": { openRepoSettingsPage: unexpected },
  };
  const ssrReact = {
    ...React,
    // These client-only hooks omit a server snapshot. Supply the same snapshot only in this SSR fixture.
    useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, snapshot: () => T, serverSnapshot = snapshot): T {
      return React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
    },
  };
  function load(file: string): SourceExports {
    file = file.replace(/\\/g, "/").replace(/\.tsx?$/, "");
    const existing = modules.get(file);
    if (existing) return existing.exports;
    const path = [file + ".tsx", file + ".ts"].find((candidate) => {
      try { readFileSync(candidate); return true; } catch { return false; }
    });
    assert.ok(path, `Source module exists: ${file}`);
    const module: { exports: SourceExports } = { exports: {} };
    modules.set(file, module);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (name: string): unknown => {
      if (name === "react") return ssrReact;
      if (name === "react/jsx-runtime") return deps(name);
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected dependency: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${outputText}\n})`, { console }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { PanelStrip: Strip } = load("src/components/PanelStrip");
  const { TerminalHost: Host } = load("src/features/terminal/TerminalPanel");
  assert.ok(Strip);
  assert.ok(Host);
  return {
    dispatch(action: TabsAction) { state = tabsReducer(state, action); },
    strip({ open = true, view = "terminal" }: { open?: boolean; view?: ComponentProps<typeof PanelStrip>["view"] } = {}) {
      return renderToStaticMarkup(React.createElement(Strip, { repo, workspace, open, setOpen: unexpected, view, setView: unexpected, cwd: workspace.path ?? repo.path }));
    },
    host(id: string) {
      const tab = state.tabs.find((candidate) => candidate.id === id);
      assert.ok(tab, `Terminal exists: ${id}`);
      return renderToStaticMarkup(React.createElement(Host, { id: tab.id, status: tab.status }));
    },
  };
}

function startup(markup: string, visible: boolean) {
  assert.equal(markup.includes("Starting terminal…"), visible, visible ? "selected starting terminal exposes its startup body" : "startup body is absent");
  if (visible) {
    assert.match(markup, /role="status"/);
    assert.match(markup, /<svg[^>]*width="48"[^>]*height="48"/);
  }
}

for (const status of ["starting", "running", "exited"] as const) {
  test(`actual PanelStrip → TerminalHost renders selected ${status} lifecycle`, () => {
    const f = fixture();
    f.dispatch({ type: "open", id: "selected" });
    if (status === "running") f.dispatch({ type: "ready", id: "selected" });
    if (status === "exited") f.dispatch({ type: "exit", id: "selected", exitCode: 7, signal: null });
    const markup = f.strip();
    startup(markup, status === "starting");
    assert.match(markup, /class="term-mount" data-terminal="true"/);
  });
}

test("actual PanelStrip hides startup body when closed or on Setup and Run", () => {
  const f = fixture();
  f.dispatch({ type: "open", id: "selected" });
  startup(f.strip({ open: false }), false);
  startup(f.strip({ view: "setup" }), false);
  startup(f.strip({ view: "run" }), false);
});

test("actual PanelStrip uses selected lifecycle, not a starting sibling", () => {
  const f = fixture();
  f.dispatch({ type: "open", id: "running" });
  f.dispatch({ type: "ready", id: "running" });
  f.dispatch({ type: "open", id: "starting-sibling" });
  f.dispatch({ type: "select", id: "running" });
  startup(f.strip(), false);
  f.dispatch({ type: "select", id: "starting-sibling" });
  startup(f.strip(), true);
});

test("actual PanelStrip omits startup body after closing its last terminal", () => {
  const f = fixture();
  f.dispatch({ type: "open", id: "selected" });
  f.dispatch({ type: "close", id: "selected" });
  const markup = f.strip();
  startup(markup, false);
  assert.doesNotMatch(markup, /class="term-mount"/);
});

for (const status of ["starting", "running", "exited"] as const) {
  test(`actual center TerminalHost renders ${status} lifecycle without replacing its mount`, () => {
    const f = fixture();
    f.dispatch({ type: "open", id: "center", placement: "center" });
    if (status === "running") f.dispatch({ type: "ready", id: "center" });
    if (status === "exited") f.dispatch({ type: "exit", id: "center", exitCode: 0, signal: null });
    const markup = f.host("center");
    startup(markup, status === "starting");
    assert.match(markup, /class="term-mount" data-terminal="true"/);
    startup(f.strip(), false);
  });
}
