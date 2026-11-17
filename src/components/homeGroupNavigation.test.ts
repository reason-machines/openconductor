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
    { id: "one", name: "Project One", path: "/fixture/one", defaultBranch: "main", workspaces: [workspace("A2", 120_000), workspace("A1", 60_000), workspace("C1", 3 * DAY), workspace("C2", 3 * DAY + 60_000)] },
    { id: "two", name: "Project Two", path: "/fixture/two", defaultBranch: "main", workspaces: [workspace("B1", DAY), workspace("B2", DAY + 60_000)] },
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

for (const [startKeys, key, expected, repoId, workspaceId] of [
  [[], "ArrowDown", "Workspace B1", "two", "B1"],
  [["ArrowDown", "ArrowDown", "ArrowDown"], "ArrowUp", "Workspace A1", "one", "A1"],
  [["End"], "ArrowUp", "Workspace B1", "two", "B1"],
] as const) {
  test(`Home Alt+${key} selects the adjacent date group's first row from ${startKeys.join("/") || "initial selection"}`, async () => {
    const view = await fixture();
    try {
      assert.deepEqual(view.visible(), ["Workspace A1", "Workspace A2", "Workspace B1", "Workspace B2", "Workspace C1", "Workspace C2"]);
      for (const start of startKeys) await view.key(start);
      const event = await view.key(key, { altKey: true });
      assert.deepEqual(view.selected(), [expected]);
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(view.actions, []);
      await view.key("Enter");
      view.expectOpen(repoId, workspaceId);
    } finally { await view.close(); }
  });
}

test("Home Alt+Arrow uses only rendered date groups after filtering", async () => {
  const view = await fixture();
  try {
    await view.query("Project One");
    assert.deepEqual(view.visible(), ["Workspace A1", "Workspace A2", "Workspace C1", "Workspace C2"]);
    const event = await view.key("ArrowDown", { altKey: true });
    assert.deepEqual(view.selected(), ["Workspace C1"]);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home Alt+Arrow cancels both directions when no rows match", async () => {
  const view = await fixture();
  try {
    await view.query("no-such-workspace");
    for (const key of ["ArrowDown", "ArrowUp"]) {
      assert.equal((await view.key(key, { altKey: true })).defaultPrevented, true);
      assert.deepEqual(view.selected(), []);
      assert.deepEqual(view.actions, []);
    }
  } finally { await view.close(); }
});

test("Control: absent neighboring groups fall back to adjacent rows without wrapping", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Workspace A2"]);
    await view.key("ArrowUp", { altKey: true });
    assert.deepEqual(view.selected(), ["Workspace A1"]);
    await view.key("ArrowUp", { altKey: true });
    assert.deepEqual(view.selected(), ["Workspace A1"]);
    await view.key("End");
    await view.key("ArrowUp");
    assert.deepEqual(view.selected(), ["Workspace C1"]);
    await view.key("ArrowDown", { altKey: true });
    assert.deepEqual(view.selected(), ["Workspace C2"]);
    await view.key("ArrowDown", { altKey: true });
    assert.deepEqual(view.selected(), ["Workspace C2"]);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Control: plain arrows and Ctrl letters remain adjacent within a date group", async () => {
  const view = await fixture();
  try {
    for (const key of ["ArrowDown", "n", "j"]) {
      await view.key("Home");
      await view.key(key, { ctrlKey: key !== "ArrowDown" });
      assert.deepEqual(view.selected(), ["Workspace A2"]);
    }
    for (const key of ["ArrowUp", "p", "k"]) {
      await view.key("End");
      await view.key(key, { ctrlKey: key !== "ArrowUp" });
      assert.deepEqual(view.selected(), ["Workspace C1"]);
    }
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Control: Meta endpoints take precedence over Alt group navigation", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown", { metaKey: true, altKey: true });
    assert.deepEqual(view.selected(), ["Workspace C2"]);
    await view.key("ArrowUp", { metaKey: true, altKey: true });
    assert.deepEqual(view.selected(), ["Workspace A1"]);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Control: consumed and composing Alt+Arrow events do not navigate", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    for (const flags of [{ isComposing: true }, { keyCode: 229 }, { prevented: true }]) {
      for (const key of ["ArrowUp", "ArrowDown"]) {
        const event = await view.key(key, { ...flags, altKey: true });
        assert.equal(event.defaultPrevented, "prevented" in flags);
        assert.deepEqual(view.selected(), ["Workspace A2"]);
        assert.deepEqual(view.actions, []);
      }
    }
  } finally { await view.close(); }
});
