import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import type { ComponentProps } from "react";
import ts from "typescript";
import * as bind from "../keybindings/bind.ts";
import * as dispatcher from "../keybindings/dispatcher.ts";
import * as listeners from "../keybindings/listeners.ts";
import * as overrides from "../keybindings/overrides.ts";
import * as selectAll from "../keybindings/selectAll.ts";
import * as shortcut from "../keybindings/shortcut.ts";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const commandId = "view.toggleLeftSidebar";
const defaultTitle = "Toggle left sidebar (⌘B or [)";

function compile(file: string): string {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function saved(primary: string, additional?: string): string {
  return JSON.stringify({ version: 1, overrides: { [commandId]: [
    { key: { kind: "logical", value: primary }, modifiers: ["meta", "shift"] },
    ...(additional === undefined ? [] : [{ key: { kind: "logical", value: additional }, modifiers: ["alt"] }]),
  ] } });
}

async function fixture(sidebarVisible = false) {
  const provider: Partial<typeof import("../keybindings/KeybindingsProvider")> = {};
  const globals = { window: new EventTarget(), document: new EventTarget() };
  const providerImports: Record<string, unknown> = {
    "./bind.ts": bind, "./dispatcher.ts": dispatcher, "./listeners.ts": listeners,
    "./overrides.ts": overrides, "./selectAll.ts": selectAll,
  };
  runInNewContext(compile("../keybindings/KeybindingsProvider.tsx"), {
    ...globals, exports: provider,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in providerImports, `Unexpected keybinding provider dependency: ${name}`);
      return providerImports[name];
    },
  });
  const { KeybindingsProvider, useKeybindingOverrides } = provider;
  assert.ok(KeybindingsProvider && useKeybindingOverrides);

  const component: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  const inert = () => null;
  const homeImports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => () => {} },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
    "../keybindings/overrides": overrides,
    "../keybindings/shortcut": shortcut,
    "../keybindings/KeybindingsProvider": provider,
  };
  runInNewContext(compile("./AllWorkspaces.tsx"), {
    exports: component,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in homeImports, `Unexpected Home dependency: ${name}`);
      return homeImports[name];
    },
  });
  const { AllWorkspaces } = component;
  assert.ok(AllWorkspaces);
  const useOverrides = useKeybindingOverrides;
  let current: ReturnType<typeof useOverrides> | undefined;
  function Controls() { current = useOverrides(); return null; }
  const actions: Parameters<ComponentProps<typeof AllWorkspaces>["dispatch"]>[0][] = [];
  const props: ComponentProps<typeof AllWorkspaces> = {
    repos: [{
      id: "project", name: "Project", path: "/fixture/project", defaultBranch: "main",
      workspaces: [{ id: "workspace", name: "Workspace", branch: "feature", status: "idle", diff: { added: 0, removed: 0 }, createdAt: Date.now() }],
    }],
    sidebarVisible, dispatch: (action) => { actions.push(action); }, onCreateWorkspace() {},
  };
  let hydrate: ((raw: string | undefined) => void) | undefined;
  const stored = new Promise<string | undefined>((resolve) => { hydrate = resolve; });
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(KeybindingsProvider, {
      loadOverrides: () => stored,
      children: React.createElement(React.Fragment, null, React.createElement(Controls), React.createElement(AllWorkspaces, props)),
    }));
  });
  return {
    actions,
    toggle: () => renderer.root.findByProps({ className: "home-sidebar-toggle" }),
    toggles: () => renderer.root.findAllByProps({ className: "home-sidebar-toggle" }),
    async hydrate(raw: string | undefined) {
      const resolveStored = hydrate;
      assert.ok(resolveStored);
      await act(async () => { resolveStored(raw); });
      assert.ok(current?.overridesLoaded, "the actual provider finished its persisted override read");
    },
    async update(raw: string | undefined) {
      const setOverrides = current?.setOverrides;
      assert.ok(setOverrides);
      await act(async () => { setOverrides(overrides.parseOverrides(raw)); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home workspace-list sidebar toggle retains its default hint and click action", async () => {
  const view = await fixture();
  try {
    assert.equal(view.toggle().props.title, defaultTitle);
    assert.equal(view.toggle().props["aria-label"], "Toggle left sidebar");
    await act(async () => { view.toggle().props.onClick(); });
    assert.equal(view.actions.length, 1);
    assert.equal(view.actions[0]?.type, "toggleSidebar");
    await view.hydrate(undefined);
    assert.equal(view.toggle().props.title, defaultTitle);
  } finally { await view.close(); }
});

test("mounted Home workspace-list sidebar hint follows persisted primary and additional shortcuts after hydration", async () => {
  const view = await fixture();
  try {
    assert.equal(view.toggle().props.title, defaultTitle);
    await view.hydrate(saved("y", "j"));
    assert.equal(view.toggle().props.title, "Toggle left sidebar (⌘⇧Y or ⌥J)");
  } finally { await view.close(); }
});

test("mounted Home workspace-list sidebar hint follows live provider changes and reset without parent rerender", async () => {
  const view = await fixture();
  try {
    await view.hydrate(undefined);
    await view.update(saved("y", "j"));
    assert.equal(view.toggle().props.title, "Toggle left sidebar (⌘⇧Y or ⌥J)");
    await view.update(saved("u", "l"));
    assert.equal(view.toggle().props.title, "Toggle left sidebar (⌘⇧U or ⌥L)");
    await view.update(undefined);
    assert.equal(view.toggle().props.title, defaultTitle);
  } finally { await view.close(); }
});

test("Home workspace-list sidebar hint replaces defaults with a single saved shortcut", async () => {
  const view = await fixture();
  try {
    await view.hydrate(saved("y"));
    assert.equal(view.toggle().props.title, "Toggle left sidebar (⌘⇧Y)");
  } finally { await view.close(); }
});

test("Home workspace-list sidebar hint keeps defaults when the persisted setting is malformed", async () => {
  const view = await fixture();
  try {
    await view.hydrate("not-json");
    assert.equal(view.toggle().props.title, defaultTitle);
  } finally { await view.close(); }
});

test("Home workspace list omits the toggle while the sidebar is visible, including after hydration", async () => {
  const view = await fixture(true);
  try {
    assert.equal(view.toggles().length, 0);
    await view.hydrate(saved("y", "j"));
    assert.equal(view.toggles().length, 0);
  } finally { await view.close(); }
});
