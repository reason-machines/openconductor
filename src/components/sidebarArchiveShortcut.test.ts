import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import { effectiveShortcuts, type Overrides } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import * as labels from "./sidebarLabel.ts";
import * as statuses from "../state/rowStatus.ts";
import * as placement from "./tooltipPlacement.ts";
import type { Workspace } from "../state/types";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const custom: Overrides = { "workspace.archive": [{ key: { kind: "logical", value: "k" }, modifiers: ["meta", "alt"] }] };
const additional: Overrides = { "workspace.archive": [
  ...custom["workspace.archive"],
  { key: { kind: "physical", code: "KeyA", display: "A" }, modifiers: ["ctrl", "shift"] },
] };
const workspace: Workspace = {
  id: "cairo", name: "cairo", workspaceName: "Cairo", userSetWorkspaceName: true,
  branch: "topic/cairo", status: "idle", state: "ready", createdAt: 1,
  path: "/fixture/cairo", diff: { added: 0, removed: 0 },
};
type TextTree = string | { children: readonly TextTree[] };
const visibleText = (node: TextTree): string => typeof node === "string" ? node : node.children.map(visibleText).join("");
class ListenerTarget {
  addEventListener() {}
  removeEventListener() {}
  setTimeout = setTimeout;
  clearTimeout = clearTimeout;
}

function compile(path: string, require: (name: string) => unknown, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${javascript}\nexports;`, { exports: {}, require, ...globals });
}

async function fixture({ active = true, loadOverrides }: { active?: boolean; loadOverrides?: () => Promise<string | undefined> } = {}) {
  const window = new ListenerTarget();
  const providerPath = "../keybindings/KeybindingsProvider.tsx";
  const provider: Pick<typeof import("../keybindings/KeybindingsProvider"), "KeybindingsProvider" | "useKeybindingOverrides"> = compile(
    providerPath, createRequire(new URL(providerPath, import.meta.url)), { window, document: new ListenerTarget() },
  );
  const common: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": dependencies("react/jsx-runtime"),
  };
  function resolve(imports: Record<string, unknown>, name: string): unknown {
    assert.ok(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  }
  const tooltip: Pick<typeof import("./Tooltip"), "Tooltip"> = compile("./Tooltip.tsx", (name) => resolve({
    ...common,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "./tooltip.css": {},
    "./tooltipPlacement": placement,
  }, name), { window, document: { body: {} }, performance });
  const inert = () => null;
  const rowImports: Record<string, unknown> = {
    ...common,
    "./RepoIcon": { RepoIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
    "./Icons": { ArchiveIcon: inert },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "./sidebarLabel": labels,
    "./WorkspaceContextMenu": { WorkspaceContextMenu: inert },
    "../keybindings/registry": { COMMANDS },
    "../keybindings/overrides": { effectiveShortcuts },
    "../keybindings/shortcut": { glyphs },
    "../keybindings/KeybindingsProvider": provider,
    "../state/rowStatus": statuses,
    "../state/shortcutHint": {},
    "../state/sidebarOrder": {},
    "../state/sidebarDiffStat": {},
    "./useRowDiffStat": { useRowDiffStat: () => ({ ref: () => {}, stat: workspace.diff, onScreen: false }) },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../features/pr/sidebarPrPoller": { useRowPrPoll() {} },
    "../features/pr/usePullRequest": {},
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../state/openChat": {},
    "../features/chat/chatRuntime": {},
    "./useBranchPrefix": {},
    "./Tooltip": tooltip,
  };
  const row: Pick<typeof import("./SidebarWorkspaceRow"), "SidebarWorkspaceRow"> = compile("./SidebarWorkspaceRow.tsx", (name) => resolve(rowImports, name));
  let update: ((value: Overrides) => void) | undefined;
  let archives = 0;
  function Rows() {
    const context = provider.useKeybindingOverrides();
    update = context.setOverrides;
    return React.createElement(row.SidebarWorkspaceRow, {
      workspace, targetBranch: "main", active, onSelect() {}, onArchive() { archives += 1; },
    });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(provider.KeybindingsProvider, { loadOverrides }, React.createElement(Rows))); });
  return {
    async openTooltip() {
      await act(async () => {
        renderer.root.findByProps({ "aria-label": "Archive workspace" }).props.onFocus({ target: { matches: () => true } });
      });
    },
    text() { return visibleText(renderer.root.findByProps({ role: "tooltip" })); },
    async replace(overrides: Overrides) {
      assert.ok(update);
      await act(async () => update?.(overrides));
    },
    async archive() {
      let stopped = false;
      await act(async () => {
        renderer.root.findByProps({ "aria-label": "Archive workspace" }).props.onClick({ stopPropagation() { stopped = true; } });
      });
      assert.equal(stopped, true);
      assert.equal(archives, 1);
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("Sidebar Archive tooltip: selected row shows the default shortcut", async () => {
  const view = await fixture();
  try { await view.openTooltip(); assert.equal(view.text(), "Archive workspace ⌘⇧A"); }
  finally { view.close(); }
});

test("Sidebar Archive tooltip: saved remap arriving after mount replaces the default", async () => {
  let finish: ((raw: string) => void) | undefined;
  const pending = new Promise<string>((resolve) => { finish = resolve; });
  const view = await fixture({ loadOverrides: () => pending });
  try {
    await view.openTooltip();
    assert.equal(view.text(), "Archive workspace ⌘⇧A");
    await act(async () => finish?.(JSON.stringify({ version: 1, overrides: custom })));
    assert.equal(view.text(), "Archive workspace ⌘⌥K");
  } finally { view.close(); }
});

test("Sidebar Archive tooltip: open selected tooltip updates on a live remap", async () => {
  const view = await fixture();
  try {
    await view.openTooltip();
    assert.equal(view.text(), "Archive workspace ⌘⇧A");
    await view.replace(custom);
    assert.equal(view.text(), "Archive workspace ⌘⌥K");
  } finally { view.close(); }
});

test("Sidebar Archive tooltip: only the primary saved shortcut is shown", async () => {
  const view = await fixture();
  try {
    await view.replace(additional);
    await view.openTooltip();
    assert.equal(view.text(), "Archive workspace ⌘⌥K");
  } finally { view.close(); }
});

test("Sidebar Archive tooltip: reset restores the default on the same row", async () => {
  const view = await fixture();
  try {
    await view.replace(custom);
    await view.openTooltip();
    assert.equal(view.text(), "Archive workspace ⌘⌥K");
    await view.replace({});
    assert.equal(view.text(), "Archive workspace ⌘⇧A");
  } finally { view.close(); }
});

test("Sidebar Archive tooltip: unselected row omits shortcuts before and after remap", async () => {
  const view = await fixture({ active: false });
  try {
    await view.openTooltip();
    assert.equal(view.text(), "Archive workspace");
    await view.replace(custom);
    assert.equal(view.text(), "Archive workspace");
  } finally { view.close(); }
});

test("Sidebar Archive tooltip: archive click keeps its callback and stops propagation", async () => {
  const view = await fixture();
  try { await view.replace(custom); await view.archive(); }
  finally { view.close(); }
});
