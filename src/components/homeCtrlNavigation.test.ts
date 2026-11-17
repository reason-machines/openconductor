import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import * as bind from "../keybindings/bind.ts";
import * as dispatcher from "../keybindings/dispatcher.ts";
import * as listeners from "../keybindings/listeners.ts";
import * as overrides from "../keybindings/overrides.ts";
import * as selectAll from "../keybindings/selectAll.ts";
import * as shortcut from "../keybindings/shortcut.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = new Date(2026, 10, 11, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

type KeyFlags = Partial<Pick<React.KeyboardEvent<HTMLInputElement>, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "keyCode">> & {
  isComposing?: boolean;
  prevented?: boolean;
};

function workspace(id: string, age: number): Workspace {
  return {
    id, name: `Workspace ${id}`, userSetWorkspaceName: true, branch: id,
    status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - age,
  };
}

function fixtures(): Repo[] {
  return [
    { id: "one", name: "Project One", path: "/fixture/one", defaultBranch: "main", workspaces: [workspace("C", 3 * DAY), workspace("A", 60_000)] },
    { id: "two", name: "Project Two", path: "/fixture/two", defaultBranch: "main", workspaces: [workspace("B", DAY)] },
  ];
}

function compile(file: string): string {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

async function fixture(repos = fixtures()) {
  const actions: Action[] = [];
  const globals = { window: new EventTarget(), document: new EventTarget() };
  const provider: Partial<typeof import("../keybindings/KeybindingsProvider")> = {};
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
  const { KeybindingsProvider } = provider;
  assert.ok(KeybindingsProvider);
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/overrides": overrides,
    "../keybindings/shortcut": shortcut,
    "../keybindings/KeybindingsProvider": provider,
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => () => {} },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
  };
  const exported: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  runInNewContext(compile("./AllWorkspaces.tsx"), {
    ...globals, exports: exported, Date: class extends Date { static now() { return NOW; } },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Home dependency: ${name}`);
      return imports[name];
    },
  });
  const { AllWorkspaces } = exported;
  assert.ok(AllWorkspaces);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(KeybindingsProvider, {
      children: React.createElement(AllWorkspaces, {
        repos, sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); }, onCreateWorkspace() {},
      }),
    }));
  });
  const rows = (): { props: { title: string; "aria-selected": boolean } }[] => renderer.root.findAllByProps({ role: "option" });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  return {
    actions,
    visible: () => rows().map((row) => row.props.title),
    selected: () => rows().filter((row) => row.props["aria-selected"]).map((row) => row.props.title),
    async key(key: string, flags: KeyFlags = {}) {
      const event = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), {
        key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, keyCode: 0, ...flags,
        nativeEvent: { isComposing: flags.isComposing ?? false },
      });
      if (flags.prevented) event.preventDefault();
      await act(async () => { input().props.onKeyDown(event); });
      return event;
    },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    expectOpen(repoId: string, workspaceId: string) {
      assert.equal(actions.length, 1);
      const action = actions[0];
      assert.ok(action?.type === "select");
      assert.deepEqual({ ...action.selection }, { kind: "workspace", repoId, workspaceId });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const [key, start, expected] of [
  ["n", "Home", "Workspace B"],
  ["j", "Home", "Workspace B"],
  ["p", "End", "Workspace B"],
  ["k", "End", "Workspace B"],
] as const) {
  test(`Home Ctrl+${key} moves to the adjacent selected row without activation`, async () => {
    const view = await fixture();
    try {
      await view.key(start);
      assert.deepEqual(view.selected(), [start === "Home" ? "Workspace A" : "Workspace C"]);
      const event = await view.key(key, { ctrlKey: true });
      assert.deepEqual(view.selected(), [expected]);
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(view.actions, []);
      await view.key("Enter");
      view.expectOpen("two", "B");
    } finally { await view.close(); }
  });
}

test("Home Ctrl navigation uses filtered rows", async () => {
  const view = await fixture();
  try {
    await view.query("Project One");
    assert.deepEqual(view.visible(), ["Workspace A", "Workspace C"]);
    await view.key("n", { ctrlKey: true });
    assert.deepEqual(view.selected(), ["Workspace C"]);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home Ctrl navigation cancels without activation when no rows match", async () => {
  const view = await fixture();
  try {
    await view.query("no-such-workspace");
    assert.deepEqual(view.visible(), []);
    for (const key of ["n", "j", "p", "k"]) {
      assert.equal((await view.key(key, { ctrlKey: true })).defaultPrevented, true);
      assert.deepEqual(view.selected(), []);
      assert.deepEqual(view.actions, []);
    }
  } finally { await view.close(); }
});

test("Control: plain and uppercase letters do not select or cancel", async () => {
  const view = await fixture();
  try {
    for (const key of ["n", "j", "p", "k", "N", "J", "P", "K"]) {
      assert.equal((await view.key(key, { ctrlKey: key === key.toUpperCase() })).defaultPrevented, false);
      assert.deepEqual(view.selected(), ["Workspace A"]);
      assert.deepEqual(view.actions, []);
    }
  } finally { await view.close(); }
});

test("Control: composition and consumed Ctrl-letter events remain untouched", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    for (const flags of [{ isComposing: true }, { keyCode: 229 }, { prevented: true }]) {
      for (const key of ["n", "j", "p", "k"]) {
        const event = await view.key(key, { ctrlKey: true, ...flags });
        assert.equal(event.defaultPrevented, "prevented" in flags);
        assert.deepEqual(view.selected(), ["Workspace B"]);
        assert.deepEqual(view.actions, []);
      }
    }
  } finally { await view.close(); }
});

test("Control: existing arrows and endpoint activation reach the production handler", async () => {
  const view = await fixture();
  try {
    assert.equal((await view.key("ArrowDown")).defaultPrevented, true);
    assert.deepEqual(view.selected(), ["Workspace B"]);
    await view.key("End");
    assert.deepEqual(view.selected(), ["Workspace C"]);
    assert.deepEqual(view.actions, []);
    await view.key("Enter");
    view.expectOpen("one", "C");
  } finally { await view.close(); }
});
