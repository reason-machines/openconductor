import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import { effectiveShortcuts } from "../keybindings/overrides.ts";
import { glyphs } from "../keybindings/shortcut.ts";
import { COMMANDS } from "../keybindings/registry.ts";
import * as labels from "./sidebarLabel.ts";
import * as statuses from "../state/rowStatus.ts";
import * as placement from "./tooltipPlacement.ts";
import * as scriptModel from "../scripts/model.ts";
import type { RunState, RunStatus, ScriptEvent } from "../scripts/model.ts";
import type { Workspace } from "../state/types";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const workspace: Workspace = {
  id: "cairo", name: "cairo", workspaceName: "Cairo", userSetWorkspaceName: true,
  branch: "topic/cairo", status: "idle", state: "ready", createdAt: 1,
  path: "/fixture/cairo", diff: { added: 0, removed: 0 },
};

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

function run(state: RunState, scriptId = "dev", workspaceId = workspace.id): RunStatus {
  return { workspaceId, scriptId, state, exit: state === "stopped" ? [0, null] : null };
}

async function fixture(initial: RunStatus[], active: boolean) {
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
  let snapshot = initial;
  const listeners = new Set<(event: ScriptEvent) => void>();
  const scripts: Pick<typeof import("../scripts/api"), "runStatus" | "onScriptEvent"> = {
    async runStatus(workspaceId) {
      return { runs: snapshot.filter((status) => status.workspaceId === workspaceId), history: [] };
    },
    async onScriptEvent(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
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
    "../scripts/api": scripts,
    "../scripts/api.ts": scripts,
    "../scripts/model": scriptModel,
    "../scripts/model.ts": scriptModel,
  };
  const row: Pick<typeof import("./SidebarWorkspaceRow"), "SidebarWorkspaceRow"> = compile("./SidebarWorkspaceRow.tsx", (name) => resolve(rowImports, name));
  let archives = 0;
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(provider.KeybindingsProvider, {
      children: React.createElement(row.SidebarWorkspaceRow, {
        workspace, targetBranch: "main", active, onSelect() {}, onArchive() { archives += 1; },
      }),
    }));
  });
  return {
    count() { return renderer.root.findAllByProps({ "data-testid": "workspace-archive-button" }).length; },
    async emit(event: ScriptEvent, statuses: RunStatus[]) {
      await act(async () => {
        snapshot = statuses;
        for (const listener of listeners) listener(event);
      });
    },
    async archive() {
      let stopped = false;
      await act(async () => {
        renderer.root.findByProps({ "data-testid": "workspace-archive-button" }).props.onClick({ stopPropagation() { stopped = true; } });
      });
      assert.equal(stopped, true);
      assert.equal(archives, 1);
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("Sidebar Archive busy visibility: idle selected and unselected rows retain the archive action", async () => {
  for (const active of [true, false]) {
    const view = await fixture([run("stopped", "older")], active);
    try {
      assert.equal(view.count(), 1);
      await view.archive();
    } finally { view.close(); }
  }
});

for (const state of ["starting", "waiting_for_setup", "running", "stopping"] satisfies RunState[]) {
  test(`Sidebar Archive busy visibility: ${state} hides Archive after an older stopped script`, async () => {
    for (const active of [true, false]) {
      const view = await fixture([run("stopped", "older"), run(state, "second")], active);
      try { assert.equal(view.count(), 0, `${state} hides Archive on ${active ? "selected" : "unselected"} row`); }
      finally { view.close(); }
    }
  });
}

test("Sidebar Archive busy visibility: another workspace's busy snapshot and events leave Archive available", async () => {
  for (const active of [true, false]) {
    const other = run("running", "dev", "other-workspace");
    const view = await fixture([run("stopped"), other], active);
    try {
      assert.equal(view.count(), 1);
      await view.emit({ type: "runStarted", ...other }, [run("stopped"), other]);
      assert.equal(view.count(), 1);
      const stopped = run("stopped", "dev", "other-workspace");
      await view.emit({ type: "runFinished", ...stopped }, [run("stopped"), stopped]);
      assert.equal(view.count(), 1);
    } finally { view.close(); }
  }
});

test("Sidebar Archive busy visibility: run start and finish hide then restore Archive on the same row", async () => {
  for (const active of [true, false]) {
    const view = await fixture([], active);
    try {
      assert.equal(view.count(), 1);
      const running = run("running");
      await view.emit({ type: "runStarted", ...running }, [running]);
      assert.equal(view.count(), 0, `runStarted hides Archive on ${active ? "selected" : "unselected"} row`);
      const stopped = run("stopped");
      await view.emit({ type: "runFinished", ...stopped }, [stopped]);
      assert.equal(view.count(), 1);
    } finally { view.close(); }
  }
});
