// Run: node --test "src/**/*.test.ts"
// Archive over a running Codex chat, against a fake Tauri: a working Codex
// chat blocks a plain archive, and "Stop agents and archive" cancels it
// (`codex_cancel`) before the backend removes the folder. Conductor's archive
// refuses over working/cancelling/waiting sessions of any agent (`dYe`,
// index-BGEQ8YjU.js @966,492) and cancels every session of the workspace
// (`Z$` @974,867).
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

// Some imports omit `.ts` (Vite resolves them); resolve those here.
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) {
    if (s.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s + ".ts", c);
    throw e;
  }
}`),
  import.meta.url,
);

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const callbacks = new Map<number, (e: { event: string; payload: unknown }) => void>();
const eventOf = new Map<number, string>();
let nextCallback = 1;
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.isTauri = true;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
g.window = globalThis;
g.__TAURI_INTERNALS__ = {
  transformCallback: (fn: (e: { event: string; payload: unknown }) => void) => {
    const id = nextCallback++;
    callbacks.set(id, fn);
    return id;
  },
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    calls.push({ cmd, args });
    if (cmd === "plugin:event|listen") {
      eventOf.set(args.handler as number, args.event as string);
      return 1;
    }
    if (cmd === "session_statuses") return [];
    // A Codex prompt resolves when its turn ends; these turns keep running.
    if (cmd === "codex_prompt") return new Promise(() => undefined);
    if (cmd === "reason_prompt") return new Promise(() => undefined);
    if (cmd === "claude_prompt") return new Promise(() => undefined);
    if (cmd === "chat_messages_load") return { messages: [], agentSessionId: null };
    return null;
  },
};

const codex = await import("../features/chat/codexChat.ts");
const archive = await import("./archive.ts");
const reason = await import("../features/chat/reasonChat.ts");
const claude = await import("../features/chat/claudeChat.ts");

const settle = () => new Promise((r) => setTimeout(r, 0));
function emitCodex(payload: Record<string, unknown>) {
  for (const [id, fn] of callbacks) if (eventOf.get(id) === "codex-chat-event") fn({ event: "codex-chat-event", payload });
}
function emitReason(payload: Record<string, unknown>) {
  for (const [id, fn] of callbacks) if (eventOf.get(id) === "reason-chat-event") fn({ event: "reason-chat-event", payload });
}
const reasonCancels = (chatId: string) => calls.filter((c) => c.cmd === "reason_cancel" && c.args.chatId === chatId).length;
const cancels = (chatId: string) => calls.filter((c) => c.cmd === "codex_cancel" && c.args.chatId === chatId).length;

test("a working Codex chat blocks a plain archive", async () => {
  codex.submitCodex("ws-codex-run", "/ws/codex-run", "refactor the parser");
  await settle();
  assert.equal(archive.workspaceAgentStatus("ws-codex-run"), "working");
  assert.equal(archive.blockedByAgents(archive.workspaceAgentStatus("ws-codex-run"), false), true);
  assert.equal(archive.blockedByAgents(archive.workspaceAgentStatus("ws-codex-run"), true), false);
});

test("Stop agents and archive cancels the workspace's running Codex turn", async () => {
  codex.submitCodex("ws-codex-stop", "/ws/codex-stop", "run the tests");
  await settle();
  assert.equal(codex.codexSnapshot("ws-codex-stop").queue.status, "working");
  archive.stopWorkspaceAgents("ws-codex-stop");
  assert.equal(cancels("ws-codex-stop"), 1);
  assert.equal(codex.codexSnapshot("ws-codex-stop").queue.status, "cancelling");
});

test("Stop agents and archive also cancels a Codex chat waiting on an approval", async () => {
  codex.submitCodex("ws-codex-ask", "/ws/codex-ask", "write hello.txt");
  await settle();
  emitCodex({ chatId: "ws-codex-ask", type: "approval", requestId: 7, kind: "command", itemId: "exec-1", command: "touch hello.txt", cwd: "/ws/codex-ask", reason: null, decisions: ["accept", "cancel"] });
  assert.equal(codex.codexSnapshot("ws-codex-ask").queue.status, "needs_user_permission");
  archive.stopWorkspaceAgents("ws-codex-ask");
  assert.equal(cancels("ws-codex-ask"), 1);
});

test("Stop agents and archive also cancels a Reason chat waiting on a permission", async () => {
  reason.submitChat("ws-reason-ask", "/ws/reason-ask", "clean the build", "queue");
  await settle();
  await settle();
  assert.equal(calls.filter((c) => c.cmd === "reason_prompt" && c.args.chatId === "ws-reason-ask").length, 1);
  emitReason({ chatId: "ws-reason-ask", type: "permissionRequest", requestId: "permission-1", title: "bash: rm -rf build", options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }] });
  assert.equal(reason.chatSnapshot("ws-reason-ask").queue.status, "needs_user_permission");
  archive.stopWorkspaceAgents("ws-reason-ask");
  await settle();
  assert.equal(reason.chatSnapshot("ws-reason-ask").queue.status, "cancelling");
  assert.equal(reasonCancels("ws-reason-ask"), 1);
});

test("Stop agents and archive cancels a running Claude Code chat through its own runtime only", async () => {
  const chatId = claude.claudeChatId("ws-claude-stop");
  claude.claudeRuntime.submit(chatId, "/ws/claude-stop", "fix the build", "queue");
  await settle();
  await settle();
  assert.equal(calls.filter((c) => c.cmd === "claude_prompt" && c.args.chatId === chatId).length, 1);
  assert.equal(archive.workspaceAgentStatus("ws-claude-stop"), "working");
  archive.stopWorkspaceAgents("ws-claude-stop");
  await settle();
  assert.equal(claude.claudeRuntime.snapshot(chatId).queue.status, "cancelling");
  assert.equal(calls.filter((c) => c.cmd === "claude_cancel" && c.args.chatId === chatId).length, 1);
  assert.equal(reasonCancels(chatId), 0);
  assert.equal(cancels(chatId), 0);
});

test("startArchive stops the Codex chat before the backend archive runs", async () => {
  codex.submitCodex("ws-codex-order", "/ws/codex-order", "long job");
  await settle();
  const order: string[] = [];
  await archive.startArchive(
    { type: "archiveWorkspace", repoId: "r", workspaceId: "ws-codex-order", stopRunningAgents: true },
    {
      status: archive.workspaceAgentStatus("ws-codex-order"),
      hide: () => order.push("hide"),
      stopAgents: () => {
        archive.stopWorkspaceAgents("ws-codex-order");
        order.push(`stop:${cancels("ws-codex-order")}`);
      },
      run: async () => {
        order.push("run");
        return { archived: true, branch: null, archiveCommit: null, notices: [] };
      },
      reload: () => order.push("reload"),
      emit: () => undefined,
    },
  );
  assert.deepEqual(order, ["hide", "stop:1", "run"]);
});

test("another workspace's Codex chat is left running", async () => {
  codex.submitCodex("ws-codex-other", "/ws/codex-other", "keep going");
  await settle();
  archive.stopWorkspaceAgents("ws-codex-elsewhere");
  assert.equal(cancels("ws-codex-other"), 0);
  assert.equal(codex.codexSnapshot("ws-codex-other").queue.status, "working");
});
