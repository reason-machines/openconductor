import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Repo } from "../../state/types";
import type { EffectiveSettings, Layer } from "../repoSettings.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

function settings(value: boolean, layer: Layer): EffectiveSettings {
  return {
    prompts: { code_review: null, create_pr: null, fix_errors: null, resolve_merge_conflicts: null, rename_branch: null, general: null },
    git: {
      branch_prefix: null,
      branch_prefix_type: null,
      delete_branch_on_archive: { value, layer },
      archive_on_merge: { value: true, layer: "repo_local" },
      worktree_push_auto_setup_remote: { value: true, layer: "defaults" },
    },
    previewUrls: null,
    environmentVariableFiles: null,
    fileIncludeGlobs: null,
    env: { local: {}, cloud: {}, files: [] },
    warnings: [],
  };
}

function fixture({ value = true, layer = "repo_local", inherited = false, path = "/synthetic/not-a-real-repository", loading = false }: { value?: boolean; layer?: Layer; inherited?: boolean; path?: string; loading?: boolean } = {}) {
  const events = new EventTarget();
  const writes: { path: string; key: string; value: unknown }[] = [];
  let current = settings(value, layer);
  let failing = false;
  let reloads = 0;
  const api = {
    repoSettingsEffective: async () => {
      reloads++;
      if (loading) return new Promise<EffectiveSettings>(() => {});
      return current;
    },
    repoSettingsSetLocal: async (repoPath: string, key: string, next: unknown) => {
      writes.push({ path: repoPath, key, value: next });
      if (failing) throw new Error("Synthetic refused write");
      current = { ...current, git: { ...current.git, delete_branch_on_archive: next === null ? { value: inherited, layer: "repo_shared" } : { value: next === true, layer: "repo_local" } } };
      return current;
    },
  };
  function load(relative: string, imports: Record<string, unknown>) {
    const exports: Record<string, unknown> = {};
    const javascript = ts.transpileModule(readFileSync(resolve(root, relative), "utf8"), {
      fileName: relative,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, {
      exports, console, window: events, Event,
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
        throw new Error(`Unexpected Git Reset regression dependency: ${name}`);
      },
    });
    return exports;
  }
  const hooks = load("src/settings/useRepoSettings.ts", {
    "@tauri-apps/api/core": { isTauri: () => true },
    "./repoSettings.ts": api,
  });
  const Context = React.createContext(null);
  function Root({ children }: { children: ReactNode }) {
    const [open, setOpen] = React.useState(false);
    return React.createElement(Context.Provider, { value: { open, setOpen } }, children);
  }
  function Trigger({ children, ...props }: { children: ReactNode }) {
    const menu = React.useContext(Context);
    return React.createElement("button", { ...props, onClick: () => menu.setOpen(!menu.open), "aria-expanded": menu.open }, children);
  }
  function Portal({ children }: { children: ReactNode }) {
    return React.useContext(Context).open ? children : null;
  }
  function Positioner({ children }: { children: ReactNode }) { return children; }
  function Popup({ children, ...props }: { children: ReactNode }) { return React.createElement("div", { role: "menu", ...props }, children); }
  function Item({ children, onClick }: { children: ReactNode; onClick: () => void }) {
    const menu = React.useContext(Context);
    return React.createElement("button", { role: "menuitem", onClick: () => { onClick(); menu.setOpen(false); } }, children);
  }
  const component = load("src/settings/rows/RepoGitRows.tsx", {
    "@base-ui/react/menu": { Menu: { Root, Trigger, Portal, Positioner, Popup, Item } },
    "../../components/menu/menuIcons": { EllipsisIcon: () => null },
    "../../components/sidebarActionsMenu.css": {},
    "../controls": { Toggle: ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) => React.createElement("input", { type: "checkbox", role: "switch", "aria-label": label, checked, disabled, onChange }) },
    "../GeneralPage": { Row: ({ label, help, control, children }: { label: ReactNode; help?: ReactNode; control?: ReactNode; children?: ReactNode }) => React.createElement("section", null, React.createElement("header", null, label), help, control, children) },
    "../repoSettings.ts": api,
    "../useRepoSettings.ts": hooks,
  });
  const repo: Repo = { id: "synthetic-reset-repo", name: "Reset regression", path, remote: "origin", defaultBranch: "main", workspaces: [] };
  let renderer: ReturnType<typeof create>;
  return {
    writes,
    reloads: () => reloads,
    fail: (next: boolean) => { failing = next; },
    async mount() { await act(async () => { renderer = create(React.createElement(component.RepoGitRows, { repo })); }); },
    actions: () => renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["aria-label"] === "Setting actions"),
    toggle: (label = "Delete branch on archive") => renderer.root.findByProps({ "aria-label": label, role: "switch" }),
    warnings: () => renderer.root.findAllByProps({ className: "settings-row-danger" }).length,
    alerts: () => renderer.root.findAllByProps({ role: "alert" }),
    async reset() {
      const actions = renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === "button" && node.props["aria-label"] === "Setting actions");
      assert.equal(actions.length, 1, "Reset requires one Setting actions button");
      act(() => actions[0].props.onClick());
      await act(async () => { renderer.root.findByProps({ role: "menuitem" }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("repository Delete branch Reset removes the local override and reveals inherited off", async () => {
  const view = fixture();
  await view.mount();
  try {
    assert.equal(view.toggle().props.checked, true);
    assert.equal(view.warnings(), 1);
    assert.equal(view.actions().length, 1);
    await view.reset();
    assert.deepEqual(view.writes, [{ path: "/synthetic/not-a-real-repository", key: "git.delete_branch_on_archive", value: null }]);
    assert.equal(view.toggle().props.checked, false);
    assert.equal(view.warnings(), 0);
    assert.equal(view.actions().length, 0);
    assert.equal(view.reloads(), 2, "success refreshes effective repository settings");
    assert.equal(view.toggle("Archive on merge").props.checked, true);
    assert.equal(view.toggle("Set upstream on plain git push").props.checked, true);
  } finally { await view.close(); }
});

test("Reset means inherit, not save false, when inherited deletion is on", async () => {
  const view = fixture({ value: false, inherited: true });
  await view.mount();
  try {
    assert.equal(view.warnings(), 0);
    await view.reset();
    assert.equal(view.writes[0].value, null);
    assert.equal(view.toggle().props.checked, true);
    assert.equal(view.warnings(), 1);
    assert.equal(view.actions().length, 0);
  } finally { await view.close(); }
});

for (const layer of ["defaults", "user", "repo_shared", "managed"] satisfies Layer[]) {
  test(`inherited or locked ${layer} setting offers no repository-local Reset`, async () => {
    const view = fixture({ layer });
    await view.mount();
    try {
      assert.equal(view.actions().length, 0);
      assert.deepEqual(view.writes, []);
    } finally { await view.close(); }
  });
}

test("a loading repository or missing local checkout offers no Reset", async () => {
  for (const options of [{ loading: true }, { path: "" }]) {
    const view = fixture(options);
    await view.mount();
    try {
      assert.equal(view.actions().length, 0);
      assert.deepEqual(view.writes, []);
    } finally { await view.close(); }
  }
});

test("a refused Reset retains the override, reports the failure, and can retry", async () => {
  const view = fixture();
  await view.mount();
  try {
    view.fail(true);
    await view.reset();
    assert.equal(view.toggle().props.checked, true);
    assert.equal(view.warnings(), 1);
    assert.equal(view.actions().length, 1);
    assert.equal(view.alerts().length, 1);
    assert.match(view.alerts()[0].children.join(""), /reset/i);
    assert.equal(view.reloads(), 1, "failure must not report a successful change");
    view.fail(false);
    await view.reset();
    assert.equal(view.toggle().props.checked, false);
    assert.equal(view.alerts().length, 0);
    assert.deepEqual(view.writes.map((write) => write.value), [null, null]);
  } finally { await view.close(); }
});

test("ordinary toggles still write booleans rather than remove the override", async () => {
  const view = fixture();
  await view.mount();
  try {
    await act(async () => { view.toggle().props.onChange(false); });
    assert.deepEqual(view.writes.map((write) => write.value), [false]);
    assert.equal(view.actions().length, 1);
    view.fail(true);
    await act(async () => { view.toggle().props.onChange(true); });
    assert.equal(view.toggle().props.checked, false);
    assert.match(view.alerts()[0].children.join(""), /save/i);
  } finally { await view.close(); }
});
