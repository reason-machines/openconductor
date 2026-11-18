import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Action } from "../state/store.ts";
import type { Workspace } from "../state/types.ts";
import * as model from "../state/workspaceRename.ts";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

type RecordRequest = {
  workspaceId: string;
  directoryName: string;
  workspaceName: string | null;
};
type BranchRequest = { workspaceId: string; branch: string };

function deferred<T = void>() {
  let finish: ((value: T) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { finish = resolve; fail = reject; });
  return {
    promise,
    resolve(value: T) {
      assert.ok(finish);
      finish(value);
    },
    reject(error: Error) {
      assert.ok(fail);
      fail(error);
    },
  };
}

type PreferenceFixture = {
  stored?: string | null;
  legacy?: string | null;
  read?: Promise<string | null>;
};

async function fixture(alsoRenameBranch: boolean, branch = "team/old-branch", preference: PreferenceFixture = {}) {
  const source = readFileSync(new URL("./RenameWorkspaceDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "RenameWorkspaceDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./RenameWorkspaceDialog"), "RenameWorkspaceDialog">> = {};
  const record = deferred();
  const branchRename = deferred();
  const records: RecordRequest[] = [];
  const branches: BranchRequest[] = [];
  const marked: string[] = [];
  const actions: Action[] = [];
  const errors: string[] = [];
  const stored = preference.stored === undefined ? String(alsoRenameBranch) : preference.stored;
  const preferences = new Map<string, string>(stored === null ? [] : [[model.ALSO_RENAME_BRANCH_KEY, stored]]);
  const writes: string[] = [];
  let reads = 0;
  let legacyReads = 0;
  let closed = 0;
  runInNewContext(javascript, {
    exports,
    Error,
    localStorage: {
      getItem(key: string) {
        assert.equal(key, model.ALSO_RENAME_BRANCH_KEY);
        legacyReads++;
        return preference.legacy ?? null;
      },
      setItem() { assert.fail("preference toggles must use the canonical adapter"); },
    },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../state/workspaceRename") return model;
      if (name === "../lib/local-storage") return {
        appBrowserStorage: () => ({
          async getItem(key: string) {
            assert.equal(key, model.ALSO_RENAME_BRANCH_KEY);
            reads++;
            return preference.read ?? preferences.get(key) ?? null;
          },
          async setItem(key: string, value: string) {
            assert.equal(key, model.ALSO_RENAME_BRANCH_KEY);
            writes.push(value);
            preferences.set(key, value);
          },
        }),
      };
      if (name === "./DialogFrame") return { DialogFrame: ({ children }: { children: ReactNode }) => children };
      if (name === "./Icons") return { FolderIcon: () => null };
      if (name === "../backend") return {
        renameWorkspaceRecord(workspaceId: string, directoryName: string, workspaceName: string | null) {
          records.push({ workspaceId, directoryName, workspaceName });
          return record.promise;
        },
        async markUserSetBranchName(workspaceId: string) { marked.push(workspaceId); },
      };
      if (name === "../workspace/api") return {
        renameWorkspaceBranch(workspaceId: string, renamed: string) {
          branches.push({ workspaceId, branch: renamed });
          return branchRename.promise;
        },
      };
      throw new Error(`Unexpected rename pending-branch dependency: ${name}`);
    },
  });
  assert.ok(exports.RenameWorkspaceDialog);
  const RenameWorkspaceDialog = exports.RenameWorkspaceDialog;
  const workspace: Workspace = {
    id: "synthetic-workspace",
    name: "old-workspace",
    directoryName: "old-workspace",
    branch,
    status: "idle",
    diff: { added: 0, removed: 0 },
    createdAt: 0,
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(RenameWorkspaceDialog, {
      repoId: "synthetic-repo",
      workspace,
      dispatch: (action: Action) => { actions.push(action); },
      onClose: () => { closed++; },
      onError: (message: string) => { errors.push(message); },
    }));
  });
  const checkbox = () => renderer.root.findByProps({ type: "checkbox" });
  const primary = () => renderer.root.findByProps({ "data-primary-action": true });
  const input = () => renderer.root.findByProps({ className: "rename-ws-input" });
  return {
    records, branches, marked, actions, errors, writes,
    reads: () => reads,
    legacyReads: () => legacyReads,
    preference: () => preferences.get(model.ALSO_RENAME_BRANCH_KEY),
    checkbox: () => checkbox().props,
    primaryDisabled: () => primary().props.disabled,
    closed: () => closed,
    async name(value: string) {
      await act(async () => input().props.onChange({ target: { value } }));
    },
    async toggle(checked: boolean) {
      const control = checkbox();
      assert.notEqual(control.props.disabled, true, "an eligible branch checkbox must remain editable while rename is pending");
      await act(async () => control.props.onChange({ target: { checked } }));
      assert.equal(checkbox().props.checked, checked);
    },
    async submit() {
      assert.notEqual(primary().props.disabled, true);
      await act(async () => primary().props.onClick());
    },
    async enter() {
      let prevented = false;
      await act(async () => input().props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } }));
      assert.equal(prevented, true);
    },
    async finishRecord() { await act(async () => record.resolve()); },
    async finishBranch() { await act(async () => branchRename.resolve()); },
    close() { act(() => renderer.unmount()); },
  };
}

test("canonical preference must settle before Enter can close or rename", async () => {
  const read = deferred<string | null>();
  const view = await fixture(true, "team/old-branch", { read: read.promise });
  try {
    assert.equal(view.reads(), 1);
    assert.equal(view.checkbox().checked, false);
    assert.equal(view.checkbox().disabled, true);
    assert.equal(view.primaryDisabled(), true);
    await view.enter();
    assert.equal(view.closed(), 0, "unchanged input cannot close before hydration");
    await view.name("New Workspace");
    await view.enter();
    assert.deepEqual(view.records, []);
    assert.deepEqual(view.branches, []);
    await act(async () => read.resolve("true"));
    assert.equal(view.checkbox().checked, true);
    assert.equal(view.checkbox().disabled, false);
    assert.equal(view.primaryDisabled(), false);
    assert.deepEqual(view.writes, [], "hydration must not write or migrate preferences");
    await view.submit();
    await view.finishRecord();
    assert.deepEqual(view.branches, [expectedBranch]);
    await view.finishBranch();
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

test("canonical values take precedence and legacy is read only for canonical absence", async () => {
  for (const { stored, legacy, expected, legacyReads } of [
    { stored: "true", legacy: null, expected: true, legacyReads: 0 },
    { stored: "false", legacy: "true", expected: false, legacyReads: 0 },
    { stored: "TRUE", legacy: "true", expected: false, legacyReads: 0 },
    { stored: null, legacy: "true", expected: true, legacyReads: 1 },
    { stored: null, legacy: "false", expected: false, legacyReads: 1 },
    { stored: null, legacy: "invalid", expected: false, legacyReads: 1 },
    { stored: null, legacy: null, expected: false, legacyReads: 1 },
  ]) {
    const view = await fixture(false, "team/old-branch", { stored, legacy });
    try {
      assert.equal(view.reads(), 1);
      assert.equal(view.legacyReads(), legacyReads);
      assert.equal(view.checkbox().checked, expected);
      assert.equal(view.checkbox().disabled, false);
      assert.equal(view.primaryDisabled(), false);
      assert.deepEqual(view.writes, []);
    } finally { view.close(); }
  }
});

test("canonical read rejection settles false without consulting legacy true", async () => {
  const read = deferred<string | null>();
  const view = await fixture(false, "team/old-branch", { read: read.promise, legacy: "true" });
  try {
    await act(async () => read.reject(new Error("synthetic preference rejection")));
    assert.equal(view.checkbox().checked, false);
    assert.equal(view.checkbox().disabled, false);
    assert.equal(view.primaryDisabled(), false);
    assert.equal(view.legacyReads(), 0);
    assert.deepEqual(view.writes, []);
    assert.deepEqual(view.errors, []);
  } finally { view.close(); }
});

test("a dismissed preference read cannot consult legacy or persist after unmount", async () => {
  const read = deferred<string | null>();
  const view = await fixture(false, "team/old-branch", { read: read.promise, legacy: "true" });
  view.close();
  await act(async () => read.resolve(null));
  assert.equal(view.legacyReads(), 0);
  assert.deepEqual(view.writes, []);
  assert.deepEqual(view.records, []);
  assert.deepEqual(view.branches, []);
});

const expectedRecord = {
  workspaceId: "synthetic-workspace",
  directoryName: "new-workspace",
  workspaceName: "New Workspace",
};
const expectedBranch = { workspaceId: "synthetic-workspace", branch: "team/new-workspace" };
const expectedRecordAction = {
  type: "renameWorkspace",
  repoId: "synthetic-repo",
  workspaceId: "synthetic-workspace",
  name: "New Workspace",
  directoryName: "new-workspace",
  userSet: true,
  keepPlaceholder: true,
};
const expectedBranchAction = {
  type: "renameWorkspace",
  repoId: "synthetic-repo",
  workspaceId: "synthetic-workspace",
  branch: "team/new-workspace",
  userSet: true,
};

test("pending record rename accepts a later checked preference without adding a captured branch request", async () => {
  const view = await fixture(false);
  try {
    assert.equal(view.checkbox().disabled, false);
    await view.name("  New Workspace  ");
    await view.submit();
    assert.deepEqual(view.records, [expectedRecord]);
    assert.equal(view.primaryDisabled(), true);
    await view.toggle(true);
    assert.equal(view.preference(), "true");
    await view.enter();
    assert.deepEqual(view.records, [expectedRecord]);
    assert.deepEqual(view.branches, []);
    await view.finishRecord();
    assert.deepEqual(view.branches, []);
    assert.deepEqual(view.marked, []);
    assert.deepEqual(view.actions.map((action) => ({ ...action })), [expectedRecordAction]);
    assert.equal(view.closed(), 1);
    assert.deepEqual(view.errors, []);
  } finally { view.close(); }
});

test("pending record rename accepts a later unchecked preference without cancelling the captured branch request", async () => {
  const view = await fixture(true);
  try {
    await view.name("New Workspace");
    await view.submit();
    assert.deepEqual(view.records, [expectedRecord]);
    await view.toggle(false);
    assert.equal(view.preference(), "false");
    assert.equal(view.primaryDisabled(), true);
    await view.enter();
    assert.equal(view.records.length, 1);
    await view.finishRecord();
    assert.deepEqual(view.branches, [expectedBranch]);
    assert.equal(view.primaryDisabled(), true);
    assert.equal(view.closed(), 0);
    await view.finishBranch();
    assert.deepEqual(view.marked, ["synthetic-workspace"]);
    assert.deepEqual(view.actions.map((action) => ({ ...action })), [expectedRecordAction, expectedBranchAction]);
    assert.equal(view.preference(), "false");
    assert.equal(view.closed(), 1);
    assert.deepEqual(view.errors, []);
  } finally { view.close(); }
});

test("pending branch rename keeps its checkbox editable and the primary action locked", async () => {
  const view = await fixture(true);
  try {
    await view.name("New Workspace");
    await view.submit();
    await view.finishRecord();
    assert.deepEqual(view.records, [expectedRecord]);
    assert.deepEqual(view.branches, [expectedBranch]);
    await view.toggle(false);
    assert.equal(view.preference(), "false");
    assert.equal(view.primaryDisabled(), true);
    await view.enter();
    assert.deepEqual(view.records, [expectedRecord]);
    assert.deepEqual(view.branches, [expectedBranch]);
    assert.equal(view.closed(), 0);
    await view.finishBranch();
    assert.deepEqual(view.marked, ["synthetic-workspace"]);
    assert.deepEqual(view.actions.map((action) => ({ ...action })), [expectedRecordAction, expectedBranchAction]);
    assert.equal(view.closed(), 1);
    assert.deepEqual(view.errors, []);
  } finally { view.close(); }
});

test("empty and detached branches stay ineligible before and during record rename", async () => {
  for (const branch of ["", "(detached HEAD)"]) {
    const view = await fixture(true, branch);
    try {
      assert.equal(view.checkbox().disabled, true);
      await view.name("New Workspace");
      await view.submit();
      assert.deepEqual(view.records, [expectedRecord]);
      assert.equal(view.checkbox().disabled, true);
      assert.equal(view.primaryDisabled(), true);
      await view.enter();
      assert.deepEqual(view.records, [expectedRecord]);
      assert.deepEqual(view.branches, []);
      await view.finishRecord();
      assert.deepEqual(view.branches, []);
      assert.deepEqual(view.marked, []);
      assert.equal(view.preference(), "true");
      assert.equal(view.closed(), 1);
      assert.deepEqual(view.errors, []);
    } finally { view.close(); }
  }
});
