import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Workspace } from "../state/types";
import type { BranchPrefixInfo } from "../workspace/naming";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const root = new URL("../../", import.meta.url);
const settingsChanged = "fixture-settings-changed";

function custom(prefix: string): BranchPrefixInfo {
  return { branchPrefixType: "custom", branchPrefix: prefix, githubUsername: null };
}

async function fixture(branch: string, status: Workspace["status"], initial: BranchPrefixInfo) {
  let info = initial;
  let settingsReads = 0;
  const copied: string[] = [];
  const renames: string[][] = [];
  const actions: unknown[] = [];
  const errors: string[] = [];
  const window = new EventTarget();
  const modules = new Map<string, Record<string, unknown>>();
  const actual = new Set([
    "src/components/WorkspaceBranchHeader.tsx", "src/components/useBranchPrefix.ts",
    "src/components/branchHeaderController.ts", "src/state/workspaceRename.ts", "src/workspace/naming.ts",
  ]);
  const mocks: Record<string, Record<string, unknown>> = {
    "../backend": { markUserSetBranchName: async () => {} },
    "../workspace/api": {
      loadBranchPrefix: async () => { settingsReads++; return info; },
      renameWorkspaceBranch: async (...args: string[]) => { renames.push(args); },
    },
    "../settings/appearance": { SETTINGS_CHANGED: settingsChanged },
    "../features/openIn/apps": { copyText: async (value: string) => { copied.push(value); } },
    "./Icons": { BranchIcon: () => null },
    "./menu/menuIcons": { CopyIcon: () => null, PencilIcon: () => null },
    "./menu/ContextMenu": {
      ContextMenu: ({ children }: { children: React.ReactNode }) => children,
      MenuItem: ({ children, onSelect }: { children: string; onSelect(): void }) => React.createElement("button", { "data-action": children, onClick: onSelect }, children),
    },
  };

  function relative(from: string, specifier: string) {
    if (!specifier.startsWith(".")) return;
    const path = new URL(specifier, new URL(from, root)).pathname.slice(root.pathname.length);
    return [path, path + ".ts", path + ".tsx"].find((value) => actual.has(value));
  }

  function evaluate(path: string, exports: Record<string, unknown> = {}): Record<string, unknown> {
    const cached = modules.get(path);
    if (cached) return cached;
    modules.set(path, exports);
    const source = readFileSync(new URL(path, root), "utf8");
    const javascript = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    runInNewContext(javascript, {
      exports, window, queueMicrotask,
      require(specifier: string) {
        if (specifier === "react" || specifier === "react/jsx-runtime") return dependencies(specifier);
        if (specifier.endsWith(".css")) return {};
        const target = relative(path, specifier);
        if (target) return evaluate(target);
        const mock = mocks[specifier];
        assert.ok(mock, `Unexpected header dependency ${path}: ${specifier}`);
        return mock;
      },
    });
    return exports;
  }

  const exported: Partial<Pick<typeof import("./WorkspaceBranchHeader"), "WorkspaceBranchHeader">> = {};
  evaluate("src/components/WorkspaceBranchHeader.tsx", exported);
  const Header = exported.WorkspaceBranchHeader;
  assert.ok(Header);
  const workspace: Workspace = { id: "workspace", name: "Workspace", branch, status, diff: { added: 0, removed: 0 }, createdAt: 0 };
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Header, {
      repoId: "repo", workspace,
      dispatch: (action) => { actions.push(action); },
      onError: (message) => { errors.push(message); },
    }));
  });
  return {
    copied, renames, actions, errors, workspace,
    reads: () => settingsReads,
    button: () => renderer.root.findByProps({ "aria-label": "Rename branch" }),
    input: () => renderer.root.findByType("input"),
    label: () => renderer.root.findAllByProps({ className: "chip" })[0].children.filter((item: unknown) => typeof item === "string").join("").trim(),
    async copy() {
      await act(async () => { this.button().props.onContextMenu({ preventDefault() {}, clientX: 1, clientY: 1 }); });
      await act(async () => { await renderer.root.findByProps({ "data-action": "Copy" }).props.onClick(); });
    },
    async edit() { await act(async () => { this.button().props.onClick(); }); },
    async update(next: BranchPrefixInfo) {
      info = next;
      await act(async () => { window.dispatchEvent(new Event(settingsChanged)); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const status of ["idle", "archived"] as const) {
  test(`loaded matching prefix is removed only from the ${status} header label`, async () => {
    const view = await fixture("team/fix-nav", status, custom("team/"));
    try {
      assert.equal(view.label(), "fix-nav");
      assert.equal(view.workspace.branch, "team/fix-nav");
      assert.deepEqual(view.actions, []);
      assert.deepEqual(view.renames, []);
    } finally { await view.close(); }
  });

  for (const settings of [custom("other/"), { branchPrefixType: "none", branchPrefix: null, githubUsername: null }]) {
    test(`${status} header preserves the full label with ${settings.branchPrefixType === "none" ? "no" : "unmatched"} prefix`, async () => {
      const view = await fixture("team/fix-nav", status, settings);
      try {
        assert.equal(view.label(), "team/fix-nav");
        assert.equal(view.workspace.branch, "team/fix-nav");
      } finally { await view.close(); }
    });
  }
}

test("prefix display does not alter Copy or initial rename input", async () => {
  const view = await fixture("team/fix-nav", "idle", custom("team/"));
  try {
    assert.equal(view.label(), "fix-nav");
    await view.copy();
    assert.deepEqual(view.copied, ["team/fix-nav"]);
    await view.edit();
    assert.equal(view.input().props.value, "team/fix-nav");
    assert.deepEqual(view.renames, []);
    assert.deepEqual(view.actions, []);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

for (const status of ["idle", "archived"] as const) {
  test(`settings notification updates the ${status} label without changing the branch`, async () => {
    const view = await fixture("team/fix-nav", status, custom("other/"));
    try {
      assert.equal(view.label(), "team/fix-nav");
      await view.update(custom("team/"));
      assert.equal(view.label(), "fix-nav");
      await view.update({ branchPrefixType: "none", branchPrefix: null, githubUsername: null });
      assert.equal(view.label(), "team/fix-nav");
      assert.equal(view.workspace.branch, "team/fix-nav");
      assert.equal(view.reads(), 3);
      assert.deepEqual(view.renames, []);
      assert.deepEqual(view.actions, []);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  });
}
