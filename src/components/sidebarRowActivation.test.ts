import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import * as unread from "../state/chatUnread.ts";
import * as openChat from "../state/openChat.ts";
import * as hints from "../state/shortcutHint.ts";
import * as order from "../state/sidebarOrder.ts";
import * as labels from "./sidebarLabel.ts";
import * as statuses from "../state/rowStatus.ts";
import { effectiveShortcuts } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const workspace: Workspace = {
  id: "fixture/cairo", name: "cairo", branch: "topic/cairo", status: "idle",
  state: "ready", createdAt: 1, diff: { added: 0, removed: 0 },
};
const attentionId = `${workspace.id}:review:1`;
type Mode = "different-workspace" | "current-unread-chat" | "current-waiting-chat";
type ClickFlags = Pick<React.MouseEvent, "button" | "defaultPrevented" | "metaKey" | "altKey" | "ctrlKey" | "shiftKey">;

class Click extends Event {
  button = 0;
  metaKey = false;
  altKey = false;
  ctrlKey = false;
  shiftKey = false;
  preventions = 0;
  stops = 0;
  constructor({ defaultPrevented = false, ...flags }: Partial<ClickFlags> = {}) {
    super("click", { cancelable: true, bubbles: true });
    Object.assign(this, flags);
    if (defaultPrevented) super.preventDefault();
  }
  override preventDefault() { this.preventions += 1; super.preventDefault(); }
  override stopPropagation() { this.stops += 1; super.stopPropagation(); }
}

class ListenerTarget {
  addEventListener() {}
  removeEventListener() {}
}

function compile(path: string, require: (name: string) => unknown) {
  const javascript = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, {
    exports: {}, require, window: new ListenerTarget(), setTimeout, clearTimeout,
  });
}

async function fixture(mode: Mode) {
  const ws: Workspace = {
    ...workspace,
    unreadChats: mode === "current-unread-chat" ? [{ id: attentionId, at: 1 }] : undefined,
  };
  const state: AppState = {
    repos: [{ id: "repo", name: "fixture", path: "/fixture", defaultBranch: "main", collapsed: false, workspaces: [ws] }],
    selection: mode === "different-workspace" ? { kind: "home" } : { kind: "workspace", repoId: "repo", workspaceId: ws.id },
  };
  const actions: Action[] = [];
  const chatRequests: string[] = [];
  const chatStatuses = new Map(mode === "current-waiting-chat" ? [[attentionId, "needs_user_input"]] : []);
  openChat.setOpenReviewChats(ws.id, [attentionId]);
  openChat.takeChatRequest(ws.id);
  const off = openChat.onChatRequest((workspaceId) => {
    const id = openChat.takeChatRequest(workspaceId);
    if (id !== undefined) chatRequests.push(id);
  });
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": dependencies("react/jsx-runtime"),
    "./RepoIcon": { RepoIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
    "./Icons": { ArchiveIcon: inert },
    "./Tooltip": { Tooltip: inert },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "./sidebarLabel": labels,
    "./WorkspaceContextMenu": { WorkspaceContextMenu: inert },
    "../keybindings/overrides": { effectiveShortcuts },
    "../keybindings/shortcut": { glyphs },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../state/rowStatus": statuses,
    "../state/shortcutHint": hints,
    "../state/sidebarOrder": order,
    "../state/sidebarDiffStat": {},
    "./useRowDiffStat": { useRowDiffStat: () => ({ ref: () => {}, stat: ws.diff, onScreen: false }) },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../features/pr/sidebarPrPoller": { useRowPrPoll() {} },
    "../features/pr/usePullRequest": { usePrSettings: () => ({ optionalChecksBlock: false }) },
    "../state/chatUnread": unread,
    "../state/openChat": openChat,
    "../features/chat/chatRuntime": { chatStatuses: () => chatStatuses },
    "./useBranchPrefix": { useBranchPrefix: () => "" },
    "../scripts/api": { async runStatus() { return { runs: [], history: [] }; }, async onScriptEvent() { return () => {}; } },
    "../scripts/model": { activeRun: () => null },
  };
  const row: Pick<typeof import("./SidebarWorkspaceRow"), "SidebarWorkspaceRow" | "useWorkspaceRows"> = compile("./SidebarWorkspaceRow.tsx", (name) => {
    assert.ok(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  });
  function Rows() {
    const { rowProps } = row.useWorkspaceRows(state, (action) => actions.push(structuredClone(action)));
    return React.createElement(row.SidebarWorkspaceRow, { workspace: ws, targetBranch: "main", ...rowProps("repo", ws) });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Rows)); });
  return {
    actions, chatRequests,
    async click(event: Click) {
      await act(async () => {
        renderer.root.findByProps({ "data-testid": "left-sidebar-workspace-item" }).props.onClick(event);
      });
    },
    close() {
      act(() => renderer.unmount());
      off();
      openChat.setOpenReviewChats(ws.id, []);
      openChat.takeChatRequest(ws.id);
    },
  };
}

const blocked: readonly { id: string; flags: Partial<ClickFlags> }[] = [
  { id: "already-prevented", flags: { defaultPrevented: true } },
  { id: "middle-button", flags: { button: 1 } },
  { id: "secondary-button", flags: { button: 2 } },
  { id: "meta-primary", flags: { metaKey: true } },
  { id: "alt-primary", flags: { altKey: true } },
  { id: "ctrl-primary", flags: { ctrlKey: true } },
  { id: "shift-primary", flags: { shiftKey: true } },
];
const modes: readonly Mode[] = ["different-workspace", "current-unread-chat", "current-waiting-chat"];

for (const { id, flags } of blocked) {
  test(`Sidebar row activation: ${id} leaves selection and attention chats alone`, async () => {
    for (const mode of modes) {
      const view = await fixture(mode);
      const event = new Click(flags);
      try {
        await view.click(event);
        assert.deepEqual(view.actions, [], `${mode}: no selection or unread writes`);
        assert.deepEqual(view.chatRequests, [], `${mode}: no attention chat navigation`);
        assert.equal(event.preventions, 0);
        assert.equal(event.stops, 0);
        assert.equal(event.defaultPrevented, flags.defaultPrevented ?? false);
      } finally { view.close(); }
    }
  });
}

for (const mode of modes) {
  test(`Sidebar row activation: ordinary-primary-${mode}`, async () => {
    const view = await fixture(mode);
    try {
      await view.click(new Click());
      if (mode === "different-workspace") {
        assert.deepEqual(view.actions, [{ type: "select", selection: { kind: "workspace", repoId: "repo", workspaceId: workspace.id } }]);
        assert.deepEqual(view.chatRequests, []);
      } else {
        assert.deepEqual(view.chatRequests, [attentionId]);
        assert.equal(view.actions.length, mode === "current-unread-chat" ? 1 : 0);
        if (mode === "current-unread-chat") {
          const action = view.actions[0];
          assert.equal(action.type, "setChatUnread");
          if (action.type !== "setChatUnread") assert.fail("expected the existing attention chat to be marked read");
          assert.equal(action.repoId, "repo");
          assert.equal(action.workspaceId, workspace.id);
          assert.equal(action.chatId, attentionId);
          assert.equal(action.unread, false);
          assert.ok(Number.isFinite(action.at));
        }
      }
    } finally { view.close(); }
  });
}
