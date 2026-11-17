import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Action } from "../state/store";
import type { Repo, Workspace } from "../state/types";
import { reposFromDb, type DbRepoRow, type DbWorkspaceRow } from "../state/persisted.ts";
import * as home from "../home/allWorkspaces.ts";
import * as rowStatus from "../state/rowStatus.ts";
import * as status from "../state/workspaceStatus.ts";
import * as navigation from "../state/navigationSections.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { archivedFromRows } from "../workspace/archivedList.ts";
import { onArchiveEvent, emitArchiveEvent } from "../workspace/archiveModel.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const CREATED = "2026-11-17T12:00:00Z";
const repository = (id: string): DbRepoRow => ({ id, name: `Project ${id}`, rootPath: `/fixture/${id}`, remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: CREATED });
const stored = (id: string, repositoryId = "a", state = "archived"): DbWorkspaceRow => ({
  id, repositoryId, state, directoryName: id, workspaceName: `Saved ${id}`, userSetWorkspaceName: true,
  branch: `topic/${id}`, intendedTargetBranch: "main", placeholderBranchName: null,
  derivedStatus: null, manualStatus: null, workspacePath: `/fixture/${repositoryId}/${id}`,
  pinnedAt: null, unread: false, prTitle: null, prDescription: null, number: null, createdAt: CREATED,
});

async function fixture() {
  const dbRows = [stored("Old"), stored("Other", "b"), stored("Live", "a", "ready"), stored("Backlog", "a", "unstarted")];
  const repos = reposFromDb([repository("a"), repository("b")], dbRows, []);
  const archived = archivedFromRows(dbRows);
  assert.equal(repos.some((r) => r.workspaces.some((w) => w.id === "Old")), false, "persisted archive must not be injected into sidebar rows");
  const actions: Action[] = [], copied: Workspace[] = [], sectioned: Workspace[] = [];
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "all" }), saveFilters() {} },
    "../state/rowStatus": rowStatus,
    "../state/workspaceStatus": status,
    "../state/navigationSections": navigation,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../state/autoUnread": { selectedChatOf: (id: string) => `chat-${id}`, markManuallyUnread() {}, clearManuallyUnreadForWorkspace() {} },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "../workspace/archive": { listArchivedWorkspaces: async () => archived, onArchiveEvent },
    "./RenameWorkspaceDialog": { RenameWorkspaceDialog: ({ workspace }: { workspace: Workspace }) => React.createElement("div", { role: "dialog", "data-workspace": workspace.id }) },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
    "./menu/menuIcons": new Proxy({}, { get: () => inert }),
    "./menu/ContextMenu": {
      ContextMenu: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => React.createElement("div", { role: "menu", onDismiss: onClose }, children),
      MenuItem: ({ children, onSelect, disabled, shortcut }: { children: React.ReactNode; onSelect: () => void; disabled?: boolean; shortcut?: string }) => React.createElement("button", { role: "menuitem", onClick: onSelect, disabled, "data-shortcut": shortcut }, children),
      MenuSeparator: inert,
      SubMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    },
  };
  const cache = new Map<string, Record<string, any>>();
  function load(name: string): Record<string, any> {
    const prior = cache.get(name); if (prior) return prior;
    assert.ok(["HomeWorkspaceScreen", "AllWorkspaces", "WorkspaceContextMenu", "WorkspaceActionsMenu"].includes(name), name);
    const result: Record<string, any> = {}; cache.set(name, result);
    const javascript = ts.transpileModule(readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(javascript, { exports: result, window: new EventTarget(), require(id: string) {
      if (id === "react" || id === "react/jsx-runtime") return dependencies(id);
      if (id in imports) return imports[id];
      if (id.startsWith("./")) return load(id.slice(2));
      assert.fail(`Unexpected archived Home menu dependency ${id}`);
    } });
    return result;
  }
  const { HomeWorkspaceScreen } = load("HomeWorkspaceScreen");
  const base = { repos, sections: [{ id: "section", name: "Focus", workspaceIds: [] }], sidebarVisible: true,
    dispatch: (action: Action) => actions.push(structuredClone(action)), onCreateWorkspace() {}, onError() {},
    onCopyLink: (ws: Workspace) => copied.push(ws), onNewSection: (ws: Workspace) => sectioned.push(ws) };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(HomeWorkspaceScreen, base)); });
  const row = (id: string) => { const node = renderer.root.findAllByProps({ role: "option" }).find((n: any) => n.props.title === `Saved ${id}`); assert.ok(node, `settled row ${id}`); return node; };
  const text = (node: any): string => typeof node === "string" ? node : node.children.map(text).join("");
  const menus = () => renderer.root.findAllByProps({ role: "menu" });
  const labels = () => renderer.root.findAllByProps({ role: "menuitem" }).map(text);
  const item = (label: string) => { const node = renderer.root.findAllByProps({ role: "menuitem" }).find((n: any) => text(n) === label); assert.ok(node, label); return node; };
  return {
    repos, actions, copied, sectioned, row, menus, labels, item,
    async context(id: string) { const node = row(id); assert.equal(typeof node.props.onContextMenu, "function", `archived Home row ${id} must request its lifecycle-aware menu`); let prevented = false; await act(async () => { node.props.onContextMenu({ clientX: 42, clientY: 73, preventDefault() { prevented = true; } }); }); assert.equal(prevented, true); },
    async select(label: string) { await act(async () => { item(label).props.onClick(); }); },
    async dismiss() { await act(async () => { menus()[0].props.onDismiss(); }); },
    async query(value: string) { await act(async () => { renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onChange({ target: { value } }); }); },
    async click(id: string) { await act(async () => { row(id).props.onClick(); }); },
    async clickRestore(id: string) { await act(async () => { row(id).findByProps({ "aria-label": "Unarchive workspace" }).props.onClick({ preventDefault() {}, stopPropagation() {} }); }); },
    async emitFailed(id: string) { await act(async () => { emitArchiveEvent<Action>({ type: "unarchive-failed", action: { type: "unarchiveWorkspace", repoId: id === "Other" ? "b" : "a", workspaceId: id }, error: new Error("fixture failure") }); }); },
    async update(next: Repo[]) { await act(async () => { renderer.update(React.createElement(HomeWorkspaceScreen, { ...base, repos: next })); }); },
    dialogs: () => renderer.root.findAllByProps({ role: "dialog" }),
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("archived Home menu control: active row keeps its Archive target", async () => {
  const v = await fixture(); try { await v.context("Live"); assert.ok(v.labels().includes("Archive")); assert.ok(!v.labels().includes("Unarchive")); await v.select("Archive"); assert.deepEqual(v.actions, [{ type: "archiveWorkspace", repoId: "a", workspaceId: "Live" }]); } finally { await v.close(); }
});
test("archived Home menu control: primary click opens the existing archived view", async () => {
  const v = await fixture(); try { await v.click("Old"); const a = v.actions[0]; assert.ok(a.type === "openArchivedWorkspace"); assert.equal(a.repoId, "a"); assert.equal(a.workspace.id, "Old"); assert.equal(v.menus().length, 0); } finally { await v.close(); }
});
test("archived Home menu control: unstarted rows gain neither local menu nor Start", async () => {
  const v = await fixture(); try { assert.equal(v.row("Backlog").props.onContextMenu, undefined); assert.ok(!v.labels().includes("Start")); assert.deepEqual(v.actions, []); } finally { await v.close(); }
});
test("archived Home menu control: existing row restore still dispatches only once", async () => {
  const v = await fixture(); try { await v.clickRestore("Old"); await v.clickRestore("Old"); assert.deepEqual(v.actions, [{ type: "unarchiveWorkspace", repoId: "a", workspaceId: "Old" }]); } finally { await v.close(); }
});
test("archived Home row mounts lifecycle menu from persisted archived split without navigation", async () => {
  const v = await fixture(); try { await v.context("Old"); assert.equal(v.menus().length, 1); assert.ok(v.labels().includes("Unarchive")); assert.ok(!v.labels().includes("Archive")); assert.ok(!v.labels().includes("Start")); assert.deepEqual(v.actions, []); } finally { await v.close(); }
});
test("archived Home menu restores exact requested row after filtering", async () => {
  const v = await fixture(); try { await v.query("Saved Other"); await v.context("Other"); await v.select("Unarchive"); assert.deepEqual(v.actions, [{ type: "unarchiveWorkspace", repoId: "b", workspaceId: "Other" }]); } finally { await v.close(); }
});
test("archived Home menu shares pin status read section copy and rename target", async () => {
  const v = await fixture(); try { await v.context("Old"); for (const label of ["Pin", "Done", "Mark as unread", "Focus", "Copy link", "Rename"]) await v.select(label); assert.deepEqual(v.actions.map((a) => a.type), ["setWorkspacePinned", "setWorkspaceStatus", "setChatUnread", "assignSection"]); for (const a of v.actions) assert.ok("workspaceId" in a && a.workspaceId === "Old"); assert.equal(v.copied[0].id, "Old"); assert.equal(v.dialogs()[0].props["data-workspace"], "Old"); assert.equal(v.item("Unarchive").props["data-shortcut"], undefined); } finally { await v.close(); }
});
test("archived Home menu respects the existing row restore pending state and failure reset", async () => {
  const v = await fixture(); try { await v.clickRestore("Old"); await v.context("Old"); assert.equal(v.item("Unarchive").props.disabled, true); await v.select("Unarchive"); assert.equal(v.actions.length, 1); await v.dismiss(); await v.emitFailed("Old"); await v.context("Old"); assert.ok(!v.item("Unarchive").props.disabled); await v.select("Unarchive"); assert.equal(v.actions.length, 2); } finally { await v.close(); }
});
test("archived Home menu restore shares pending state with the existing row button", async () => {
  const v = await fixture(); try { await v.context("Old"); await v.select("Unarchive"); assert.equal(v.row("Old").findByProps({ "aria-label": "Unarchive workspace" }).props.disabled, true); await v.clickRestore("Old"); assert.equal(v.actions.length, 1); } finally { await v.close(); }
});
test("archived Home menu closes when its repository is unlinked", async () => {
  const v = await fixture(); try { await v.context("Old"); await v.update(v.repos.filter((r) => r.id !== "a")); assert.equal(v.menus().length, 0); assert.deepEqual(v.actions, []); } finally { await v.close(); }
});
