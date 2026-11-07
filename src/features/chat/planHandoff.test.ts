import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handoffPlan } from "./planHandoff.ts";
import type { ComposerAttachment } from "./composerAttachments.ts";
import ts from "typescript";

function productionHandoff({ failStage = false } = {}) {
  const source = readFileSync(new URL("../../components/WorkspaceView.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("WorkspaceView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body = "";
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handoffPlanToTab") body = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.notEqual(body, "", "the production panel must own handoff wiring");
  const events: unknown[] = [];
  const ports = {
    agentId: "claude",
    runId: "source-chat:claude",
    agent: {
      snapshot: () => ({ permissions: [{ kind: "plan", requestId: "review-plan" }] }),
      answerPermission: async (...args: unknown[]) => { events.push(["answer", ...args]); },
      stop: (id: string) => { events.push(["stop", id]); },
    },
    handoffPlan,
    attachmentPath: (name: string, dir: string) => `.context/attachments/${dir}/${name}`,
    randomDir: () => "abc123",
    workspace: { id: "native-workspace" },
    draftAttachmentsApi: { write: async (args: { draftWorkspaceId: string; relativePath: string; data: Uint8Array }) => {
      if (failStage) throw new Error("disk full");
      events.push(["file", args.draftWorkspaceId, args.relativePath, new TextDecoder().decode(args.data)]);
    } },
    forkToNewTab: (title: string, config: unknown, draft: unknown) => { events.push(["tab", title, config, draft]); return "new-chat"; },
    saveAgent: (id: string, agentId: string) => { events.push(["agent", id, agentId]); },
    notify: (kind: string, message: string) => { events.push(["notice", kind, message]); },
  };
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const run: (requestId: string, plan: string) => Promise<void> = new Function(...Object.keys(ports), `${js}\nreturn handoffPlanToTab;`)(...Object.values(ports));
  return { events, run };
}

test("production handoff wiring stages under the workspace, retains Claude and seeds an unsent plan attachment", async () => {
  const h = productionHandoff();
  await h.run("review-plan", "# Exact plan");
  const path = ".context/attachments/abc123/plan.md";
  assert.deepEqual(h.events, [
    ["file", "native-workspace", path, "# Exact plan"],
    ["tab", "Implement plan", [], { text: "", attachments: [{ name: path, label: "plan.md", text: "# Exact plan", staged: path }] }],
    ["agent", "new-chat", "claude"],
    ["answer", "source-chat:claude", "review-plan", { kind: "plan", approved: false }],
    ["stop", "source-chat:claude"],
  ]);
});

test("production handoff reports staging failure without answering or cancelling the original", async () => {
  const h = productionHandoff({ failStage: true });
  await assert.rejects(h.run("review-plan", "# Plan"), /disk full/);
  assert.deepEqual(h.events, [["notice", "error", "Failed to hand off plan: disk full"]]);
});

function harness() {
  const events: string[] = [];
  const drafts: { text: string; attachments: ComposerAttachment[] }[] = [];
  const files: ComposerAttachment[] = [];
  let pending = true;
  const input = {
    plan: "# Plan\n\nKeep the worktree unchanged until I send.",
    attachmentPath: ".context/attachments/abc123/plan.md",
    isPending: () => pending,
    stage: async (file: ComposerAttachment) => { files.push(file); events.push("stage"); },
    openDraft: (draft: { text: string; attachments: ComposerAttachment[] }) => { drafts.push(draft); events.push("draft"); },
    reject: async () => { events.push("reject"); },
    stop: () => { events.push("stop"); },
  };
  return { events, drafts, files, input, expire: () => { pending = false; } };
}

test("handoff stages plan.md and opens an unsent draft before rejecting and stopping the original", async () => {
  const h = harness();
  await handoffPlan(h.input);
  assert.deepEqual(h.events, ["stage", "draft", "reject", "stop"]);
  assert.deepEqual(h.files, [{ name: h.input.attachmentPath, staged: h.input.attachmentPath, label: "plan.md", text: h.input.plan }]);
  assert.deepEqual(h.drafts, [{ text: "", attachments: h.files }]);
});

test("a staging failure leaves the original plan untouched", async () => {
  const h = harness();
  await assert.rejects(handoffPlan({ ...h.input, stage: async () => { throw new Error("disk full"); } }), /disk full/);
  assert.deepEqual(h.events, []);
});

test("a destination failure leaves the original plan untouched", async () => {
  const h = harness();
  await assert.rejects(handoffPlan({ ...h.input, openDraft: () => { throw new Error("tab unavailable"); } }), /tab unavailable/);
  assert.deepEqual(h.events, ["stage"]);
});

test("failed rejection does not cancel the original session", async () => {
  const h = harness();
  await assert.rejects(handoffPlan({ ...h.input, reject: async () => { throw new Error("agent disconnected"); } }), /agent disconnected/);
  assert.deepEqual(h.events, ["stage", "draft"]);
});

test("an expired request never creates a destination", async () => {
  const h = harness();
  h.expire();
  await assert.rejects(handoffPlan(h.input), /no longer pending/);
  assert.deepEqual(h.events, []);
});

test("a request answered while staging does not create a destination or stop a newer turn", async () => {
  const h = harness();
  await assert.rejects(handoffPlan({ ...h.input, stage: async () => { h.events.push("stage"); h.expire(); } }), /no longer pending/);
  assert.deepEqual(h.events, ["stage"]);
});

test("empty plans cannot hand off", async () => {
  const h = harness();
  await assert.rejects(handoffPlan({ ...h.input, plan: " \n " }), /no plan text/);
  assert.deepEqual(h.events, []);
});

test("plan review exposes handoff separately from approval", () => {
  const source = readFileSync(new URL("./PermissionRequests.tsx", import.meta.url), "utf8");
  assert.match(source, /Send plan to a new chat for implementation/);
  assert.match(source, />\s*Hand off\s*</);
});
