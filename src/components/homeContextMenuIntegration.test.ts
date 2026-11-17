import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import type { HomeRow } from "../home/allWorkspaces";
import * as navigation from "../state/navigationSections.ts";
import * as status from "../state/workspaceStatus.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const workspace = (id: string): Workspace => ({ id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0 });

async function fixture() {
  const actions: Action[] = [], copied: Workspace[] = [], sectioned: Workspace[] = [];
  const repos: Repo[] = [{ id: "repo", name: "Project", path: "/fixture/project", defaultBranch: "main", workspaces: [workspace("Alpha"), workspace("Beta")] }];
  let homeProps: Record<string, any> = {};
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "./AllWorkspaces": { AllWorkspaces: (props: Record<string, any>) => { homeProps = props; return null; } },
    "./RenameWorkspaceDialog": { RenameWorkspaceDialog: (props: { workspace: Workspace }) => React.createElement("div", { role: "dialog", "data-workspace": props.workspace.id }) },
    "../state/navigationSections": navigation,
    "../state/workspaceStatus": status,
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../state/autoUnread": { selectedChatOf: (id: string) => `chat-${id}`, markManuallyUnread() {}, clearManuallyUnreadForWorkspace() {} },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "./menu/menuIcons": new Proxy({}, { get: () => inert }),
    // Only the portal/focus primitives are replaced. Production action composition,
    // menu rendering, dispatch and Home container callbacks are mounted unchanged.
    "./menu/ContextMenu": {
      ContextMenu: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => React.createElement("div", { role: "menu", onDismiss: onClose }, children),
      MenuItem: ({ children, onSelect, disabled, shortcut }: { children: React.ReactNode; onSelect: () => void; disabled?: boolean; shortcut?: string }) => React.createElement("button", { role: "menuitem", onClick: onSelect, disabled, "data-shortcut": shortcut }, children),
      MenuSeparator: inert,
      SubMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    },
  };
  const cache = new Map<string, Record<string, any>>();
  function load(name: string): Record<string, any> {
    const prior = cache.get(name);
    if (prior) return prior;
    assert.ok(["HomeWorkspaceScreen", "WorkspaceContextMenu", "WorkspaceActionsMenu"].includes(name), name);
    const result: Record<string, any> = {};
    cache.set(name, result);
    const javascript = ts.transpileModule(readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, { exports: result, require(id: string) {
      if (id === "react" || id === "react/jsx-runtime") return dependencies(id);
      if (id in imports) return imports[id];
      if (id.startsWith("./")) return load(id.slice(2));
      assert.fail(`Unexpected Home menu dependency ${id}`);
    } });
    return result;
  }
  const { HomeWorkspaceScreen } = load("HomeWorkspaceScreen");
  const base = {
    repos, sections: [{ id: "section", name: "Focus", workspaceIds: [] }], sidebarVisible: true,
    dispatch: (action: Action) => actions.push(action), onCreateWorkspace() {}, onError() {},
    onCopyLink: (ws: Workspace) => copied.push(ws), onNewSection: (ws: Workspace) => sectioned.push(ws),
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(HomeWorkspaceScreen, base)); });
  const menus = () => renderer.root.findAllByProps({ role: "menu" });
  const text = (node: any): string => typeof node === "string" ? node : node.children.map(text).join("");
  const item = (label: string) => {
    const found = renderer.root.findAllByProps({ role: "menuitem" }).find((node: any) => text(node) === label);
    assert.ok(found, label);
    return found;
  };
  return {
    actions, copied, sectioned, menus, item,
    async open(id = "Beta", override: Partial<Workspace> = {}) {
      const ws = { ...repos[0].workspaces.find((ws) => ws.id === id)!, ...override };
      const row = { repo: repos[0], workspace: ws, archived: ws.status === "archived", title: ws.name, lastActiveAt: 0 } as HomeRow;
      await act(async () => { homeProps.onWorkspaceContextMenu(row, { x: 21, y: 32 }); });
    },
    async select(label: string) { await act(async () => { item(label).props.onClick(); }); },
    async dismiss() { await act(async () => { menus()[0].props.onDismiss(); }); },
    async update(next: Repo[]) { await act(async () => { renderer.update(React.createElement(HomeWorkspaceScreen, { ...base, repos: next })); }); },
    dialogs: () => renderer.root.findAllByProps({ role: "dialog" }),
    async close() { await act(async () => { renderer.unmount(); }); },
    repos,
  };
}

test("Home menu uses the shared read/pin/status/archive dispatch for the requested workspace", async () => {
  const view = await fixture();
  try {
    await view.open();
    await view.select("Pin");
    await view.select("Mark as unread");
    await view.select("Done");
    await view.select("Archive");
    assert.deepEqual(view.actions.map((a) => a.type), ["setWorkspacePinned", "setChatUnread", "setWorkspaceStatus", "archiveWorkspace"]);
    for (const action of view.actions) {
      assert.ok("workspaceId" in action && "repoId" in action);
      assert.equal(action.workspaceId, "Beta");
      assert.equal(action.repoId, "repo");
    }
    assert.equal(view.item("Archive").props["data-shortcut"], undefined, "Home is not the current workspace route");
  } finally { await view.close(); }
});

test("Home menu shares section, copy-link and rename targets and keeps rename open after menu dismissal", async () => {
  const view = await fixture();
  try {
    await view.open();
    await view.select("Focus");
    assert.equal(view.actions[0].type, "assignSection");
    assert.equal("workspaceId" in view.actions[0] && view.actions[0].workspaceId, "Beta");
    await view.select("New section…");
    await view.select("Copy link");
    assert.equal(view.sectioned[0].id, "Beta");
    assert.equal(view.copied[0].id, "Beta");
    await view.select("Rename");
    await view.dismiss();
    assert.equal(view.menus().length, 0);
    assert.equal(view.dialogs()[0].props["data-workspace"], "Beta");
  } finally { await view.close(); }
});

test("Home menu retargets between rows and reads fresh workspace state", async () => {
  const view = await fixture();
  try {
    await view.open("Alpha");
    await view.open("Beta");
    const next = [{ ...view.repos[0], workspaces: view.repos[0].workspaces.map((ws) => ws.id === "Beta" ? { ...ws, pinnedAt: 1 } : ws) }];
    await view.update(next);
    await view.select("Unpin");
    const action = view.actions[0];
    assert.ok(action.type === "setWorkspacePinned");
    assert.equal(action.workspaceId, "Beta");
    assert.equal(action.pinned, false);
  } finally { await view.close(); }
});

test("Home menu dismisses removed or lifecycle-ineligible targets and does not reopen after restoration", async () => {
  for (const extra of [null, { status: "archived" as const }, { state: "unstarted" }]) {
    const view = await fixture();
    try {
      await view.open();
      const next = [{ ...view.repos[0], workspaces: view.repos[0].workspaces.flatMap((ws) => ws.id !== "Beta" ? [ws] : extra ? [{ ...ws, ...extra }] : []) }];
      await view.update(next);
      assert.equal(view.menus().length, 0);
      await view.update(view.repos);
      assert.equal(view.menus().length, 0);
      assert.deepEqual(view.actions, []);
    } finally { await view.close(); }
  }
});
