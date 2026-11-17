import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const root = process.env.DIALOG_SOURCE_ROOT ?? fileURLToPath(new URL("../../", import.meta.url));

type Repo = { id: string; name: string; path: string; workspaces: unknown[] };
type State = { repos: Repo[]; selection: { kind: "root" } };
type Action = { type: "removeRepo"; repoId: string };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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
      throw new Error(`Unexpected removal qualification dependency: ${name}`);
    },
  });
  return exports;
}

function load(relative: string, replacements: Record<string, unknown>) {
  return evaluate(readFileSync(resolve(root, relative), "utf8"), relative, replacements);
}

function productionProjection() {
  const text = readFileSync(resolve(root, "src/App.tsx"), "utf8");
  const source = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations: string[] = [];
  const mounts: string[] = [];
  const sidebarBindings: string[] = [];
  function visit(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(source);
      if (name === "[removingRepoId, setRemovingRepoId]" || name === "removingRepo" || name === "removeRepositoryFromMenu") {
        declarations.push(`const ${node.getText(source)};`);
      }
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression) && node.expression.left.getText(source) === "removingRepo") {
      mounts.push(node.expression.getText(source));
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Sidebar") {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "onRemoveRepository") sidebarBindings.push(attribute.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(declarations.length, 3, "use the actual App target state, derived repository and menu-open handler");
  assert.equal(mounts.length, 1, "use the actual App removal JSX and captured success callback");
  assert.equal(sidebarBindings.length, 1, "open through the actual Sidebar callback binding, not a request setter");

  const storeText = readFileSync(resolve(root, "src/state/store.ts"), "utf8");
  const store = ts.createSourceFile("store.ts", storeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const reducers: string[] = [];
  function findReducer(node: import("typescript").Node) {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === "removeRepo") reducers.push(node.statements.map((statement) => statement.getText(store)).join("\n"));
    ts.forEachChild(node, findReducer);
  }
  findReducer(store);
  assert.equal(reducers.length, 1, "apply the actual removeRepo reducer after settlement");
  return `
    import { useState } from "react";
    import { RemoveRepositoryDialog } from "./RemoveRepositoryDialog";
    import { MISC_COPY } from "../settings/repoMisc";
    export function removeRepo(state, action) { ${reducers[0]} }
    export function RemovalBranch({ state, dispatch, show }) {
      ${declarations.join("\n")}
      return <><sidebar-boundary ${sidebarBindings[0]} />{${mounts[0]}}</>;
    }
  `;
}

async function fixture() {
  const operations: Array<{ id: string; result: ReturnType<typeof deferred> }> = [];
  const repoMisc = load("src/settings/repoMisc.ts", {
    "@tauri-apps/api/core": {
      invoke(command: string, payload: { repoId: string }) {
        assert.equal(command, "db_remove_repo");
        const result = deferred();
        operations.push({ id: payload.repoId, result });
        return result.promise;
      },
    },
  });
  const confirmation = load("src/components/ConfirmationDialog.tsx", {
    "./DialogFrame": { DialogFrame: ({ children, ...props }: { children: ReactNode }) => React.createElement("dialog-frame", props, children) },
    "./menu/menuIcons": { CornerDownLeftIcon: () => null },
  });
  const removal = load("src/components/RemoveRepositoryDialog.tsx", {
    "./ConfirmationDialog": confirmation,
    "../settings/repoMisc": repoMisc,
  });
  const projection = evaluate(productionProjection(), "RemovalBranch.tsx", {
    "./RemoveRepositoryDialog": removal,
    "../settings/repoMisc": repoMisc,
  });
  const RemovalBranch = projection.RemovalBranch as React.ComponentType<{ state: State; dispatch: (action: Action) => void; show: (...args: unknown[]) => void }>;
  const removeRepo = projection.removeRepo as (state: State, action: Action) => State;
  const dispatched: Action[] = [];
  const notifications: unknown[][] = [];
  function Harness() {
    const [state, setState] = React.useState<State>({ repos: ["A", "B"].map((id) => ({ id, name: `Repo ${id}`, path: `/synthetic/${id}`, workspaces: [] })), selection: { kind: "root" } });
    return React.createElement(RemovalBranch, {
      state,
      dispatch(action) { dispatched.push(action); setState((previous) => removeRepo(previous, action)); },
      show(...args) { notifications.push(args); },
    });
  }
  let view: ReturnType<typeof create>;
  await act(async () => { view = create(React.createElement(Harness)); });
  const primary = () => view.root.findAllByType("button").find((node: { children: unknown[] }) => node.children.some((child) => child === "Remove" || child === "Removing..."))!;
  return {
    operations, dispatched, notifications,
    visible: () => view.root.findAllByType("dialog-frame").length === 1,
    title: () => view.root.findByType("h2").children.join(""),
    pending: () => primary().props.disabled,
    async open(id: string) { await act(async () => view.root.findByType("sidebar-boundary").props.onRemoveRepository(id)); },
    async confirm() { await act(async () => primary().props.onClick()); },
    // Exercise the production frame-close callback; this is not an Escape-key or DOM test.
    async dismiss() { await act(async () => view.root.findByType("dialog-frame").props.onClose()); },
    async finish(index: number, error?: Error) { await act(async () => { if (error) operations[index]!.result.reject(error); else operations[index]!.result.resolve(); await Promise.resolve(); }); },
    async close() {
      await act(async () => view.unmount());
      for (const operation of operations) operation.result.resolve();
      await Promise.allSettled(operations.map((operation) => operation.result.promise));
    },
  };
}

test("late repository A success does not close the ready removal dialog opened for B", async () => {
  const view = await fixture();
  try {
    await view.open("A");
    await view.confirm();
    assert.equal(view.pending(), true);
    await view.dismiss();
    assert.equal(view.visible(), false, "pending dismissal remains available");
    await view.open("B");
    assert.equal(view.title(), "Remove Repo B?");
    await view.finish(0);
    assert.equal(view.visible(), true, "late A settlement must not close B's removal dialog");
    assert.equal(view.title(), "Remove Repo B?");
    assert.equal(view.pending(), false);
    assert.deepEqual(view.operations.map((operation) => operation.id), ["A"]);
    assert.deepEqual(view.dispatched.map((action) => action.repoId), ["A"]);
    await view.confirm();
    await view.finish(1);
    assert.equal(view.visible(), false);
    assert.deepEqual(view.dispatched.map((action) => action.repoId), ["A", "B"]);
  } finally { await view.close(); }
});

test("late A success preserves B's own pending operation until B settles", async () => {
  const view = await fixture();
  try {
    await view.open("A"); await view.confirm(); await view.dismiss();
    await view.open("B"); await view.confirm();
    await view.finish(0);
    assert.equal(view.visible(), true, "late A must not dismiss pending B");
    assert.equal(view.pending(), true);
    assert.deepEqual(view.operations.map((operation) => operation.id), ["A", "B"]);
    await view.finish(1);
    assert.equal(view.visible(), false);
    assert.deepEqual(view.dispatched.map((action) => action.repoId), ["A", "B"]);
  } finally { await view.close(); }
});

test("the current repository's own success still closes its dialog and removes only that repository", async () => {
  const view = await fixture();
  try {
    await view.open("A"); await view.confirm(); await view.finish(0);
    assert.equal(view.visible(), false);
    assert.deepEqual(view.dispatched.map((action) => action.repoId), ["A"]);
    assert.equal(view.notifications.length, 1);
  } finally { await view.close(); }
});

test("late A rejection reports the failure without closing or mutating B", async () => {
  const view = await fixture();
  try {
    await view.open("A"); await view.confirm(); await view.dismiss(); await view.open("B");
    await view.finish(0, new Error("synthetic rejection"));
    assert.equal(view.visible(), true);
    assert.equal(view.title(), "Remove Repo B?");
    assert.equal(view.pending(), false);
    assert.equal(view.dispatched.length, 0);
    assert.equal(view.notifications.length, 1);
    assert.match(String(view.notifications[0]![1]), /Failed to remove repository:/);
  } finally { await view.close(); }
});

test("success after dismissal without a replacement stays closed but retains removal and notification", async () => {
  const view = await fixture();
  try {
    await view.open("A"); await view.confirm(); await view.dismiss(); await view.finish(0);
    assert.equal(view.visible(), false);
    assert.deepEqual(view.dispatched.map((action) => action.repoId), ["A"]);
    assert.equal(view.notifications.length, 1);
  } finally { await view.close(); }
});
