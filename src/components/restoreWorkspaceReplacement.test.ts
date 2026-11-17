import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Action } from "../state/store.ts";
import type { RestoreRequest } from "./RestoreWorkspaceDialog.tsx";
import type { UnarchiveResult } from "../workspace/archiveModel.ts";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = process.env.DIALOG_SOURCE_ROOT ?? fileURLToPath(new URL("../../", import.meta.url));
const model: typeof import("../workspace/archiveModel.ts") = await import(pathToFileURL(resolve(root, "src/workspace/archiveModel.ts")).href);

type UnarchiveAction = Extract<Action, { type: "unarchiveWorkspace" }>;

function deferred() {
  let finish: (result: UnarchiveResult) => void = () => { throw new Error("deferred not initialized"); };
  const promise = new Promise<UnarchiveResult>((resolve) => { finish = resolve; });
  return { promise, resolve: (result: UnarchiveResult) => finish(result) };
}

function loadSource(relative: string, replacements: Record<string, unknown>) {
  const source = readFileSync(resolve(root, relative), "utf8");
  return evaluate(source, relative, replacements);
}

function evaluate(source: string, fileName: string, replacements: Record<string, unknown>) {
  const javascript = ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (Object.prototype.hasOwnProperty.call(replacements, name)) return replacements[name];
      throw new Error(`Unexpected restore replacement dependency: ${name}`);
    },
  });
  return exports;
}

async function fixture() {
  // Mount real confirmation and restore components. Only the DOM/focus frame is
  // a test host; no Tauri, provider, file operation, or native app is started.
  const confirmation = loadSource("src/components/ConfirmationDialog.tsx", {
    "./DialogFrame": { DialogFrame: ({ children, ...props }: { children: ReactNode }) => React.createElement("dialog-frame", props, children) },
    "./menu/menuIcons": { CornerDownLeftIcon: () => null },
  });
  const restore = loadSource("src/components/RestoreWorkspaceDialog.tsx", {
    "./ConfirmationDialog": confirmation,
    "../workspace/archive": model,
  });
  const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
  const mounts = [...app.matchAll(/\{(restoreRequest && <RestoreWorkspaceDialog\b[^\n]*?\/>\s*)\}/g)];
  assert.equal(mounts.length, 1, "exercise the one production App restore mount expression");
  const routes = [...app.matchAll(/const restore = restoreRequestFor\(e\);\s*if \(restore\) setRestoreRequest\(restore\);/g)];
  assert.equal(routes.length, 1, "exercise the production event-to-restore-request branch");
  const projection = evaluate(`
    import { RestoreWorkspaceDialog } from "./RestoreWorkspaceDialog";
    import { restoreRequestFor } from "../workspace/archive";
    export function RestoreMount({ restoreRequest, dispatch, closeRestore }) { return (${mounts[0][1]}); }
    export function route(e, setRestoreRequest) { ${routes[0][0]} }
  `, "RestoreMount.tsx", {
    "./RestoreWorkspaceDialog": restore,
    "../workspace/archive": model,
  });
  const RestoreMount = projection.RestoreMount as React.ComponentType<{ restoreRequest: RestoreRequest | null; dispatch: (action: Action) => void; closeRestore: () => void }>;
  const route = projection.route as (event: Parameters<typeof model.restoreRequestFor<UnarchiveAction>>[0], setter: (request: RestoreRequest) => void) => void;
  const dispatched: UnarchiveAction[] = [];
  const pending: Array<{ action: UnarchiveAction; result: ReturnType<typeof deferred>; task: Promise<void> }> = [];
  let closed = 0;

  function begin(workspaceId: string, useNewBranch = false) {
    const action: UnarchiveAction = { type: "unarchiveWorkspace", repoId: "synthetic-repo", workspaceId, ...(useNewBranch ? { useNewBranch: true } : {}) };
    const result = deferred();
    const task = model.startUnarchive(action, {
      show() {},
      run: () => result.promise,
      setup() {},
      reload() {},
      emit: model.emitArchiveEvent,
    });
    const request = { action, result, task };
    pending.push(request);
    return request;
  }

  function dispatch(action: Action) {
    assert.equal(action.type, "unarchiveWorkspace");
    if (action.type !== "unarchiveWorkspace") return;
    dispatched.push(action);
    begin(action.workspaceId, action.useNewBranch);
  }

  function Harness() {
    const [restoreRequest, setRestoreRequest] = React.useState<RestoreRequest | null>(null);
    const closeRestore = React.useCallback(() => { closed++; setRestoreRequest(null); }, []);
    React.useEffect(() => model.onArchiveEvent<UnarchiveAction>((event) => route(event, setRestoreRequest)), []);
    return React.createElement(RestoreMount, { restoreRequest, dispatch, closeRestore });
  }

  let view: ReturnType<typeof create>;
  await act(async () => { view = create(React.createElement(Harness)); });
  const primary = () => view.root.findByProps({ "data-primary-action": true });
  const cancel = () => view.root.findByProps({ "data-dialog-cancel": true });
  const frames = () => view.root.findAllByType("dialog-frame");
  const body = () => view.root.findByProps({ "data-testid": "restore-workspace-dialog" }).children.join("");
  const outcome = (workspaceId: string, scenario: UnarchiveResult["scenario"] = "branchDeleted"): UnarchiveResult => ({
    restored: !scenario,
    branch: `branch-${workspaceId}`,
    recreatedBranch: false,
    restoredChanges: false,
    notices: [],
    scenario,
  });
  async function finish(request: (typeof pending)[number], scenario: UnarchiveResult["scenario"] = "branchDeleted") {
    await act(async () => { request.result.resolve(outcome(request.action.workspaceId, scenario)); await request.task; });
  }
  return {
    begin, finish, dispatched,
    pending: () => primary().props.disabled,
    cancelDisabled: () => cancel().props.disabled,
    body,
    visible: () => frames().length === 1,
    closed: () => closed,
    latestRestore: (id: string) => pending.filter((request) => request.action.workspaceId === id && request.action.useNewBranch).slice(-1)[0]!,
    async confirm() { await act(async () => primary().props.onClick()); },
    async repeatScenario(workspaceId: string) {
      await act(async () => model.emitArchiveEvent({ type: "unarchived", action: { type: "unarchiveWorkspace", repoId: "synthetic-repo", workspaceId }, result: outcome(workspaceId) }));
    },
    async close() {
      await act(async () => view.unmount());
      for (const request of pending) request.result.resolve(outcome(request.action.workspaceId, null));
      await Promise.all(pending.map((request) => request.task));
    },
  };
}

test("a second concurrent local restore request starts ready instead of inheriting the first workspace's pending state", async () => {
  const view = await fixture();
  try {
    // Both normal unarchive requests start before either backend result arrives.
    const a = view.begin("A");
    const b = view.begin("B");
    await view.finish(a);
    assert.match(view.body(), /branch-A/);
    await view.confirm();
    assert.equal(view.pending(), true);
    assert.equal(view.cancelDisabled(), true);
    assert.deepEqual(view.dispatched.map((action) => action.workspaceId), ["A"]);

    await view.finish(b);
    assert.match(view.body(), /branch-B/);
    assert.equal(view.pending(), false, "workspace B must not inherit workspace A's pending mutation");
    assert.equal(view.cancelDisabled(), false);
    await view.finish(view.latestRestore("A"), null);
    assert.equal(view.visible(), true, "late workspace A completion must not close workspace B");
    assert.equal(view.pending(), false);
    await view.confirm();
    assert.deepEqual(view.dispatched.map((action) => action.workspaceId), ["A", "B"]);
    assert.equal(view.pending(), true);
    await view.finish(view.latestRestore("B"), null);
    assert.equal(view.visible(), false);
    assert.equal(view.closed(), 1);
  } finally { await view.close(); }
});

test("same-workspace scenario refresh keeps its existing pending operation", async () => {
  const view = await fixture();
  try {
    await view.finish(view.begin("A"));
    await view.confirm();
    assert.equal(view.pending(), true);
    await view.repeatScenario("A");
    assert.equal(view.pending(), true, "same identity must not reset the accepted mutation");
    assert.equal(view.cancelDisabled(), true);
    assert.equal(view.dispatched.length, 1);
    await view.finish(view.latestRestore("A"), null);
    assert.equal(view.visible(), false);
  } finally { await view.close(); }
});

test("late completion for a replaced workspace cannot close the currently displayed restore request", async () => {
  const view = await fixture();
  try {
    const a = view.begin("A");
    const b = view.begin("B");
    await view.finish(a);
    await view.confirm();
    await view.finish(b);
    await view.finish(view.latestRestore("A"), null);
    assert.equal(view.visible(), true);
    assert.match(view.body(), /branch-B/);
    assert.equal(view.closed(), 0);
    assert.equal(view.dispatched.length, 1);
  } finally { await view.close(); }
});

test("an unrelated completed unarchive without a restore scenario does not replace a pending dialog", async () => {
  const view = await fixture();
  try {
    await view.finish(view.begin("A"));
    await view.confirm();
    await view.finish(view.begin("B"), null);
    assert.match(view.body(), /branch-A/);
    assert.equal(view.pending(), true);
    assert.equal(view.dispatched.length, 1);
  } finally { await view.close(); }
});
