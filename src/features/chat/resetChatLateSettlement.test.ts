import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import { createChatRuntime, type ChatBackend, type ChatHost, type Deliver } from "./chatRuntime.ts";
import { applyReasonPayload } from "./reason.ts";
import { buildRows } from "./view.ts";
import { turnMenuItems, TURN_MENU_TOOLTIP, TURN_MENU_TRIGGER_LABEL } from "./turnMenu.ts";
import { turnTime } from "./turnTime.ts";
import { changedSinceTurn } from "./checkpoints.ts";

const dependencies = createRequire(import.meta.url);
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const root = resolve(process.env.RESET_CHAT_LATE_SOURCE_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url)));
const settle = () => new Promise<void>((done) => setImmediate(done));
let serial = 0;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function evaluate(source: string, fileName: string, replacements: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const javascript = ts.transpileModule(source, {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(javascript, {
    exports, Error, ...globals,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(Object.prototype.hasOwnProperty.call(replacements, name), `Unexpected Reset qualification dependency: ${name}`);
      return replacements[name];
    },
  }, { filename: fileName });
  return exports;
}

function projection() {
  const text = readFileSync(resolve(root, "src/components/WorkspaceView.tsx"), "utf8");
  const source = ts.createSourceFile("WorkspaceView.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations: string[] = [];
  const mounts: string[] = [];
  const bindings: string[] = [];
  function visit(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "[resetTurn, setResetTurn]") declarations.push(`const ${node.getText(source)};`);
    if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression)
      && node.expression.condition.getText(source) === "resetTurn !== null") mounts.push(node.expression.getText(source));
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Transcript") {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && ["onResetChat", "resetDisabled"].includes(attribute.name.getText(source))) bindings.push(attribute.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(declarations.length, 1, "use the actual WorkspaceView Reset target state");
  assert.equal(mounts.length, 1, "use the actual Reset mount and captured completion callback");
  assert.equal(bindings.length, 2, "open through the actual Transcript binding and disabled predicate, never a direct setter");
  return `
    import { useState } from "react";
    import { ResetChatDialog } from "./ResetChatDialog";
    export function ResetBranch({ agent, runId, cwd, snapshot, invoke }) {
      const reason = true, workspace = { status: "ready" }, running = snapshot.transcript.activeTurn !== null, planWaiting = undefined;
      ${declarations[0]}
      return <><Transcript snapshot={snapshot} ${bindings.join(" ")} />{${mounts[0]}}</>;
    }
  `;
}

function footerSource() {
  const text = readFileSync(resolve(root, "src/features/chat/Transcript.tsx"), "utf8");
  const source = ts.createSourceFile("Transcript.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ["TurnFooter", "TurnMenu"].map((name) => {
    const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node, `use actual ${name}`);
    return node.getText(source);
  });
  const icons = source.statements.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === "TURN_MENU_ICONS"));
  assert.ok(icons);
  return `${declarations.join("\n")}\n${icons.getText(source)}\nexports.TurnFooter = TurnFooter;`;
}

async function fixture() {
  const chatId = `reset-late-${++serial}`;
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
  let deliver: Deliver = () => assert.fail("agent event before listen");
  const prompts: Array<() => void> = [];
  const checkpoints: Array<{ id: string; result: ReturnType<typeof deferred> }> = [];
  const backend: ChatBackend<string> = {
    canSteer: true, defaultConfig: "synthetic", sessionKey: (id) => `session.${id}`, configKey: (id) => `config.${id}`, parseConfig: () => null,
    async listen(listener) { deliver = listener; }, async open() {},
    prompt() { return new Promise((done) => prompts.push(() => done({}))); }, cancel() {},
  };
  const host: ChatHost = {
    persist: false, storage, recordTurnChanges() {},
    async invoke(command, args) {
      if (command === "checkpoint_changed_count") return 3;
      if (command === "checkpoint_exists") return true;
      assert.equal(command, "checkpoint_restore", "no persistence, filesystem or provider boundary is admitted");
      const result = deferred();
      checkpoints.push({ id: String(args.checkpointId), result });
      return result.promise;
    },
  };
  const runtime = createChatRuntime(backend, host);
  for (const label of ["earlier B", "later A", "latest C"]) {
    runtime.submit(chatId, "/synthetic/workspace", { text: label }, "queue");
    await settle();
    for (const payload of [{ chatId, type: "text" as const, text: `reply ${label}` }, { chatId, type: "turnEnded" as const, end: { outcome: "completed" as const } }]) {
      deliver(chatId, (state) => applyReasonPayload(state, payload));
    }
    prompts.at(-1)!();
    await settle();
  }
  const rows = buildRows(runtime.snapshot(chatId).transcript).filter((row) => row.kind === "turn_end");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.canReset), [true, true, false], "both A and the earlier B are normally resettable, unlike latest C");
  const [b, a] = rows.map((row) => row.turnId);
  const frame = ({ children, ...props }: { children: ReactNode }) => React.createElement("dialog-frame", props, children);
  const reset = evaluate(readFileSync(resolve(root, "src/features/chat/ResetChatDialog.tsx"), "utf8"), "ResetChatDialog.tsx", {
    "../../components/DialogFrame.tsx": { DialogFrame: frame },
    "../../components/menu/menuIcons": { CornerDownLeftIcon: () => null },
    "./checkpoints.ts": dependencies("./checkpoints.ts"),
  }, { localStorage: storage });
  const icon = () => null;
  const footer = evaluate(footerSource(), "Transcript.tsx", {}, {
    useState: React.useState, turnMenuItems, turnTime, TURN_MENU_TOOLTIP, TURN_MENU_TRIGGER_LABEL,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    DropdownMenu: ({ children, ...props }: { children: ReactNode }) => React.createElement("menu-host", props, children),
    MenuItem: ({ children, ...props }: { children: ReactNode }) => React.createElement("menu-item-host", props, children),
    EllipsisIcon: icon, MessageSquarePlusIcon: icon, SplitIcon: icon, Undo2Icon: icon,
    CopyButton: icon, TurnDetails: icon, ChatSignInCard: icon,
  });
  const TurnFooter = footer.TurnFooter as React.ComponentType<Record<string, unknown>>;
  function Transcript({ snapshot, onResetChat, resetDisabled }: { snapshot: ReturnType<typeof runtime.snapshot>; onResetChat?: (turnId: string) => void; resetDisabled: boolean }) {
    return React.createElement(React.Fragment, {}, ...buildRows(snapshot.transcript).filter((row) => row.kind === "turn_end").map((row) => React.createElement(TurnFooter, {
      key: row.turnId, row, ctx: { onResetChat, resetDisabled, now: () => 0 },
    })));
  }
  const branch = evaluate(projection(), "ResetBranch.tsx", { "./ResetChatDialog": reset }, { Transcript, changedSinceTurn });
  const ResetBranch = branch.ResetBranch as React.ComponentType<Record<string, unknown>>;
  function Harness() {
    const [snapshot, setSnapshot] = React.useState(() => runtime.snapshot(chatId));
    React.useEffect(() => runtime.subscribe(chatId, setSnapshot), []);
    return React.createElement(ResetBranch, { agent: { reset: runtime.reset }, runId: chatId, cwd: "/synthetic/workspace", snapshot, invoke: host.invoke });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const primary = () => renderer.root.findByProps({ "data-primary-action": true });
  const visible = () => renderer.root.findAllByType("dialog-frame").length === 1;
  return {
    a: a!, b: b!, checkpoints, visible,
    pending: () => primary().props.disabled,
    messages: () => runtime.snapshot(chatId).transcript.messages,
    error: () => renderer.root.findAllByProps({ className: "error small" }).map((node: { children: unknown[] }) => node.children.join("")).join(""),
    async open(turnId: string) {
      const row = renderer.root.findByProps({ className: "chat-turn-end oc-turn-footer status-completed", "data-turn-id": turnId });
      await act(async () => row.findByProps({ "aria-label": "Show message actions" }).props.onClick({ currentTarget: { getBoundingClientRect: () => ({ x: 0, y: 0, width: 20, height: 20 }) } }));
      const item = row.findAllByType("menu-item-host").find((node: { children: unknown[] }) => node.children.includes("Reset chat"));
      assert.ok(item, "open through the actual turn menu's Reset chat item");
      assert.equal(item.props.disabled, false, "ordinary Reset action is enabled during the earlier pending reset");
      // The portal host supplies normal selection dismissal through TurnMenu's
      // actual onClose callback; no DOM/menu propagation is claimed here.
      await act(async () => { item.props.onSelect(); row.findByType("menu-host").props.onClose(); });
    },
    async confirm(resetFiles = true) {
      await act(async () => renderer.root.findByProps({ "aria-label": "Also reset files" }).props.onChange({ target: { checked: resetFiles } }));
      await act(async () => { primary().props.onClick(); await settle(); });
    },
    async cancel() { await act(async () => renderer.root.findByProps({ "data-dialog-cancel": true }).props.onClick()); },
    async finish(index: number, error?: Error) {
      await act(async () => { const operation = checkpoints[index]!; if (error) operation.result.reject(error); else operation.result.resolve(); await settle(); });
    },
    async dispose() {
      await act(async () => renderer.unmount());
      for (const checkpoint of checkpoints) checkpoint.result.resolve();
      await settle();
    },
  };
}

test("late reset A success preserves the earlier B dialog opened after Cancel", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm();
    assert.equal(view.pending(), true);
    await view.cancel(); assert.equal(view.visible(), false);
    await view.open(view.b); assert.equal(view.pending(), false);
    await view.finish(0);
    assert.equal(view.visible(), true, "dismissed A must not close the current B reset dialog");
    assert.equal(view.pending(), false);
    assert.ok(view.messages().some((message) => message.turnId === view.b), "earlier B survives A's real transcript truncation");
    await view.confirm(); await view.finish(1);
    assert.equal(view.visible(), false, "B's own completion still closes B");
    assert.ok(view.messages().every((message) => message.turnId === view.b));
  } finally { await view.dispose(); }
});

test("late reset A success cannot close B while B's own reset is pending", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm(); await view.cancel();
    await view.open(view.b); await view.confirm();
    assert.equal(view.checkpoints.length, 2);
    await view.finish(0);
    assert.equal(view.visible(), true, "A does not own B's pending dialog");
    assert.equal(view.pending(), true);
    await view.finish(1); assert.equal(view.visible(), false);
  } finally { await view.dispose(); }
});

test("late A rejection leaves B ready without leaking A's error", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm(); await view.cancel(); await view.open(view.b);
    await view.finish(0, new Error("synthetic checkpoint failure"));
    assert.equal(view.visible(), true); assert.equal(view.pending(), false); assert.equal(view.error(), "");
    assert.equal(view.messages().length, 6, "failed reset must not truncate any message");
  } finally { await view.dispose(); }
});

test("current reset failure stays open and can be retried without resetting files", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm();
    await view.finish(0, new Error("synthetic checkpoint failure"));
    assert.equal(view.visible(), true); assert.equal(view.pending(), false);
    assert.match(view.error(), /Failed to reset chat: synthetic checkpoint failure/);
    await view.confirm(false);
    assert.equal(view.visible(), false); assert.equal(view.checkpoints.length, 1);
  } finally { await view.dispose(); }
});

test("a reopened same-turn dialog still closes when its reset makes that turn the latest", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm(); await view.cancel(); await view.open(view.a);
    assert.equal(view.visible(), true);
    await view.finish(0);
    assert.equal(view.visible(), false, "same-turn completion still owns the reopened same-target dialog");
    assert.equal(view.messages().at(-1)?.turnId, view.a);
  } finally { await view.dispose(); }
});

test("a dismissed reset still truncates its own later messages without reopening a dialog", async () => {
  const view = await fixture();
  try {
    await view.open(view.a); await view.confirm(); await view.cancel(); await view.finish(0);
    assert.equal(view.visible(), false);
    assert.equal(view.messages().length, 4);
    assert.ok(view.messages().some((message) => message.turnId === view.a));
  } finally { await view.dispose(); }
});
