import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as status from "./localMcpStatus.ts";
import * as commands from "./slashCommands.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
function javascript(text: string) {
  return ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}
function deferred() {
  let resolve!: (rows: status.LocalMcpServer[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<status.LocalMcpServer[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const rows: status.LocalMcpServer[] = [
  { name: "live-connected", status: "connected", tools: [{ name: "hidden-tool" }] },
  { name: "live-auth", status: "needs-auth", tools: [] },
  { name: "live-error", status: "failed", tools: [] },
];

function dialog() {
  const exports: Partial<Pick<typeof import("./McpStatusDialog.tsx"), "McpStatusDialog">> = {};
  const Frame = ({ children }: { children: unknown }) => React.createElement("section", {}, children);
  runInNewContext(javascript(readFileSync("src/features/chat/McpStatusDialog.tsx", "utf8")), {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith("DialogFrame.tsx")) return { DialogFrame: Frame };
      if (name.endsWith("backend.ts")) return { codexMcpStatus: () => assert.fail("test must supply inert load") };
      if (name === "./localMcpStatus.ts") return status;
      throw new Error(`Unexpected dialog dependency ${name}`);
    },
  });
  assert.ok(exports.McpStatusDialog);
  return exports.McpStatusDialog;
}

function text(renderer: ReturnType<typeof create>): string {
  return renderer.root.findAllByType("span").map((node: { children: unknown[] }) => node.children.join("")).join(" ");
}

test("actual MCP dialog loads only results and retains rows beside refresh errors", async () => {
  const Component = dialog();
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const loads = [first, second, third];
  const calls: string[] = [];
  const load = (id: string) => { calls.push(id); return loads.shift()!.promise; };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Component, { chatId: "codex-a", load, onClose() {} })); });
  try {
    assert.match(text(renderer), /Loading MCP servers…/);
    assert.equal(renderer.root.findByProps({ title: undefined, className: "btn btn-ghost" }).props.disabled, true);
    await act(async () => first.resolve(rows));
    assert.deepEqual(calls, ["codex-a"]);
    const badges = renderer.root.findAllByProps({ className: "mcp-status-row" });
    assert.equal(badges.length, 3);
    assert.equal(badges[0].props.title, undefined);
    assert.equal(badges[1].props.title, "Update this server in Settings → MCP");
    assert.equal(badges[1].props.role, undefined);
    assert.match(text(renderer), /\(needs auth\)/);
    assert.match(text(renderer), /\(error\)/);
    assert.doesNotMatch(text(renderer), /hidden-tool|connected\)/);
    await act(async () => renderer.root.findByProps({ className: "btn btn-ghost" }).props.onClick());
    assert.doesNotMatch(text(renderer), /Loading MCP servers/);
    assert.equal(renderer.root.findAllByProps({ className: "mcp-status-row" }).length, 3);
    await act(async () => second.reject(new Error("Synthetic failure")));
    assert.equal(renderer.root.findByProps({ role: "alert" }).children.length > 0, true);
    assert.match(text(renderer), /Couldn't load MCP servers. Try refreshing./);
    assert.equal(renderer.root.findByProps({ className: "btn btn-ghost" }).props.title, "Synthetic failure");
    await act(async () => renderer.root.findByProps({ className: "btn btn-ghost" }).props.onClick());
    await act(async () => third.resolve([]));
    assert.match(text(renderer), /No MCP servers configured./);
    assert.equal(renderer.root.findAllByProps({ className: "mcp-status-row" }).length, 0);
  } finally { act(() => renderer.unmount()); }
});

test("actual dialog ignores completions after chat change, close and unmount", async () => {
  const Component = dialog();
  const old = deferred();
  const current = deferred();
  let closed = 0;
  const load = (id: string) => id === "old" ? old.promise : current.promise;
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Component, { chatId: "old", load, onClose() { closed++; } })); });
  await act(async () => renderer.update(React.createElement(Component, { chatId: "current", load, onClose() { closed++; } })));
  await act(async () => old.resolve(rows));
  assert.match(text(renderer), /Loading MCP servers…/);
  assert.doesNotMatch(text(renderer), /live-connected/);
  act(() => renderer.root.findByProps({ "aria-label": "Close MCP status" }).props.onClick());
  assert.equal(closed, 1);
  await act(async () => current.resolve(rows));
  assert.doesNotMatch(text(renderer), /live-connected/);
  act(() => renderer.unmount());
});

test("bounded request reports timeout and rejects late completions", async () => {
  const pending = deferred();
  const states: status.McpStatusState[] = [];
  const cancel = status.requestMcpStatus("codex", () => pending.promise, [], (s) => states.push(s), 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(states.at(-1)?.kind, "error");
  pending.resolve(rows);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(states.length, 2);
  cancel();
});

test("actual Workspace typed command dispatch is Codex-only and respects collisions", () => {
  const source = readFileSync("src/components/WorkspaceView.tsx", "utf8");
  const start = source.indexOf("        onCommand={(text) => {");
  const end = source.indexOf("\n        minimize={minimize}", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start + "        onCommand={".length, end).trim().slice(0, -1);
  for (const agentId of ["codex", "claude", "reason"]) {
    for (const collision of [null, "agent", "skill"]) {
      const opened: string[] = [];
      const errors: string[] = [];
      const slashCommands = collision ? [{ name: "mcp-status", effect: collision }] : [{ name: "mcp-status", effect: "show_mcp_status" }];
      const run = runInNewContext(javascript(`const run = ${handler}; run;`), {
        parseSlashCommand: commands.parseSlashCommand, isKnownCommand: commands.isKnownCommand,
        slashCommands, agentId, chatId: "current-chat", setMcpStatusChat: (id: string) => opened.push(id),
        setAttachError: (message: string) => errors.push(message), planMode: undefined, fastMode: undefined,
        AGENT_NAMES: commands.AGENT_NAMES, COMPOSER_AGENT: { codex: "codex", claude: "claude", reason: "acp" },
      });
      assert.equal(run("/mcp-status"), collision ? false : true);
      assert.deepEqual(opened, !collision && agentId === "codex" ? ["current-chat"] : []);
      assert.equal(errors.length, !collision && agentId !== "codex" ? 1 : 0);
    }
  }
  assert.match(source, /agentId === "codex" && mcpStatusChat === chatId/);
  assert.match(source, /onMcpStatus=\{agentId === "codex"/);
});
