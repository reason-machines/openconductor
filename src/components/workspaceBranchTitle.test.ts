import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import ts from "typescript";
import type { Workspace } from "../state/types";
import { createBranchHeaderController } from "./branchHeaderController.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");

function header(branch: string, status: Workspace["status"]) {
  const exports: Partial<Pick<typeof import("./WorkspaceBranchHeader"), "WorkspaceBranchHeader">> = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL("./WorkspaceBranchHeader.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
  });
  const mocks: Record<string, unknown> = {
    "./branchHeaderController": { createBranchHeaderController },
    "./useBranchPrefix": { useBranchPrefix: () => undefined },
    "../backend": { markUserSetBranchName: async () => {} },
    "../workspace/api": { renameWorkspaceBranch: async () => {} },
    "../features/openIn/apps": { copyText: async () => {} },
    "./Icons": { BranchIcon: () => null },
    "./menu/menuIcons": { CopyIcon: () => null, PencilIcon: () => null },
    "./menu/ContextMenu": { ContextMenu: () => null, MenuItem: () => null },
  };
  runInNewContext(outputText, {
    exports, queueMicrotask,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      assert.ok(name in mocks, `Unexpected branch title dependency: ${name}`);
      return mocks[name];
    },
  });
  const Header = exports.WorkspaceBranchHeader;
  assert.ok(Header);
  const workspace: Workspace = { id: "workspace", name: "Workspace", branch, status, diff: { added: 0, removed: 0 }, createdAt: 0 };
  const calls: unknown[] = [];
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(Header, {
      repoId: "repo", workspace,
      dispatch: (action) => { calls.push(action); },
      onError: (message: string) => { calls.push(message); },
    }));
  });
  return {
    workspace, calls,
    label: () => renderer.root.findByProps({ className: "chip" }),
    close: () => act(() => { renderer.unmount(); }),
  };
}

for (const status of ["idle", "archived"] as const) {
  for (const [kind, branch] of [
    ["ordinary", "feature/Fix-_Mixed"],
    ["long", "feature/" + "long-branch-name-".repeat(12)],
  ]) {
    test(`${status} ${kind} branch label exposes its displayed text as native title`, () => {
      const view = header(branch, status);
      try {
        const label = view.label();
        const text = label.children.filter((child: unknown) => typeof child === "string").join("").trim();
        assert.equal(text, branch);
        assert.equal(label.props.title, text);
        assert.equal(view.workspace.branch, branch);
        assert.deepEqual(view.calls, []);
      } finally { view.close(); }
    });
  }
}
