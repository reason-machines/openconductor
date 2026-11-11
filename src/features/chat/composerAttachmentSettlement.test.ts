import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { ComposerDrafts } from "../../lib/local-storage/composerDrafts.ts";
import { LocalStorageClient } from "../../lib/local-storage/client.ts";
import { memoryInvoke } from "../../lib/local-storage/memory.ts";
import { composerSessionFor } from "./composerSession.ts";
import { AGENT_NAMES, isKnownCommand, parseSlashCommand } from "./slashCommands.ts";
import { submittedUserPrompt, withSentAttachmentDisplay, type UserPrompt } from "./userContent.ts";
import type { ComposerAttachment } from "./composerAttachments.ts";
import type { DraftAttachments } from "../draft-attachments/staging.ts";
import type { LocalChatReplacement } from "./localClear.ts";

type Agent = "claude" | "reason";
type PickedFile = Parameters<ReturnType<typeof composerSessionFor>["attach"]>[0];
type Callbacks = {
  attachFiles(files: PickedFile): Promise<void>;
  removeAttachment(attachment: ComposerAttachment): void;
  onSubmit(input: UserPrompt, mode: "queue"): Promise<void>;
  onCommand(text: string): boolean;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function sourceTree(path: string) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function declaration(tree: ts.SourceFile, name: string) {
  const matches: ts.FunctionDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, `Expected one production ${name} declaration`);
  return matches[0]!.getText(tree).replace(/^export\s+/, "");
}

function evaluate<T>(source: string, result: string, ports: Record<string, unknown>): T {
  const javascript = ts.transpileModule(`${source}\nconst evaluated = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...Object.keys(ports), `${javascript}\nreturn evaluated;`)(...Object.values(ports));
}

const workspaceTree = sourceTree("../../components/WorkspaceView.tsx");
const callbacksSource = ["attachFiles", "removeAttachment", "onSubmit"].map((name) => declaration(workspaceTree, name)).join("\n");
const commandInitializers: ts.Expression[] = [];
function commandInitializer(node: ts.Node) {
  if (ts.isJsxAttribute(node) && node.name.getText(workspaceTree) === "onCommand" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
    commandInitializers.push(node.initializer.expression);
  }
  ts.forEachChild(node, commandInitializer);
}
commandInitializer(workspaceTree);
assert.equal(commandInitializers.length, 1, "Expected the actual Composer onCommand initializer");
const commandSource = commandInitializers[0]!.getText(workspaceTree);
const clearSource = declaration(sourceTree("./localClear.ts"), "clearLocalChat");
const stagingSource = declaration(sourceTree("../draft-attachments/staging.ts"), "draftAttachments");
const composerSubmitSource = declaration(sourceTree("./Composer.tsx"), "submit");

function picked(name: string, read = async () => new Uint8Array([0, 1]).buffer) {
  return { name, size: 2, arrayBuffer: read };
}

async function fixture(agentId: Agent) {
  const workspaceId = "settlement-workspace";
  const originalId = "settlement-source";
  const client = new LocalStorageClient(memoryInvoke());
  const drafts = new ComposerDrafts(client, (message) => assert.fail(message));
  let currentId = originalId;
  let current = composerSessionFor(currentId, drafts);
  await current.connect();
  const original = current;
  const requests: { command: string; args: Record<string, unknown> }[] = [];
  const staged = new Map<string, unknown>();
  const copied: string[] = [];
  const delivered: { chatId: string; input: UserPrompt; attachments: unknown }[] = [];
  const replacements: { sourceId: string; replacement: LocalChatReplacement }[] = [];
  let writeWait: Promise<void> | undefined;
  let copyWait: Promise<void> | undefined;
  let writeStarted = deferred<void>();
  let copyStarted = deferred<void>();
  let clearFinished = deferred<void>();
  let replacementReady = Promise.resolve();

  async function invoke(command: string, args: Record<string, unknown> = {}) {
    requests.push({ command, args });
    if (command === "db_clear_local_chat") {
      assert.equal(args.workspaceId, workspaceId);
      assert.equal(args.chatId, currentId);
      return { chatId: "settlement-replacement", primaryChatId: "settlement-replacement", title: "Untitled" };
    }
    const path = args.relativePath;
    assert.equal(typeof path, "string");
    if (typeof path !== "string") throw new Error("Attachment IPC omitted its path");
    if (command === "draft_attachment_write") {
      writeStarted.resolve();
      await writeWait;
      staged.set(path, args.data);
      return { storedPath: `/synthetic/app-data/${path}` };
    }
    if (command === "draft_attachment_remove") return staged.delete(path);
    if (command === "draft_attachment_upload") {
      assert.equal(staged.has(path), true, "Only an existing fixture-staged file can be copied");
      copyStarted.resolve();
      await copyWait;
      copied.push(path);
      staged.delete(path);
      return `/synthetic/workspace/${path}`;
    }
    throw new Error(`Unexpected IPC in attachment fixture: ${command}`);
  }

  const api = evaluate<DraftAttachments>(stagingSource, "draftAttachments(invoke)", { invoke });
  const clearLocalChat = evaluate<(workspaceId: string, chatId: string, agent: string) => Promise<LocalChatReplacement>>(clearSource, "clearLocalChat", {
    invoke,
    getSettings: async () => ({ models: { default_fast_mode: false } }),
    localModelOptions: () => ({ model: "fixture-local-model", effort: "high" }),
    defaultEffortSetting: () => assert.fail("The fixture supplies the existing model effort"),
    fastModeAvailable: () => false,
    saveModelChoice: () => {},
    saveAgent: () => {},
  });

  function callbacks(): Callbacks {
    const session = current;
    const chatId = currentId;
    return evaluate<Callbacks>(callbacksSource, `{ attachFiles, removeAttachment, onSubmit, onCommand: (${commandSource}) }`, {
      session,
      chatId,
      setAttachments: session.setAttachments,
      reason: agentId === "reason",
      workspace: { id: workspaceId, status: "ready" },
      cwd: "/synthetic/workspace",
      draftAttachmentsApi: api,
      submit: (input: UserPrompt, _mode: string, attachments: unknown) => { delivered.push({ chatId, input, attachments }); },
      withSentAttachmentDisplay,
      parseSlashCommand,
      isKnownCommand,
      slashCommands: [],
      planMode: undefined,
      agentId,
      clearing: { current: false },
      running: false,
      queue: { status: "idle", items: [] },
      permissions: [],
      approvals: [],
      consents: [],
      clearLocalChat,
      AGENT_NAMES,
      COMPOSER_AGENT: { claude: "claude", reason: "acp" },
      setAttachError: (error: string) => { session.setError(error); clearFinished.reject(new Error(error)); },
      onClearLocal: (sourceId: string, replacement: LocalChatReplacement) => {
        replacements.push({ sourceId, replacement });
        session.disconnect();
        currentId = replacement.chatId;
        current = composerSessionFor(currentId, drafts);
        replacementReady = current.connect();
        clearFinished.resolve();
      },
      console,
    });
  }

  return {
    originalId, original, drafts, client, requests, staged, copied, delivered, replacements, callbacks,
    current: () => current,
    currentId: () => currentId,
    holdWrite(promise: Promise<void>) { writeWait = promise; writeStarted = deferred<void>(); return writeStarted.promise; },
    holdCopy(promise: Promise<void>) { copyWait = promise; copyStarted = deferred<void>(); return copyStarted.promise; },
    async clear() {
      clearFinished = deferred<void>();
      const owner = current;
      owner.setDraft("/clear");
      const submitCommand = evaluate<(opposite: boolean) => void>(composerSubmitSource, "submit", {
        inputRef: { current: { composing: () => false } },
        submittedUserPrompt,
        draft: owner.snapshot().draft,
        hasAttachments: owner.snapshot().attachments.length > 0,
        onCommand: callbacks().onCommand,
        setDraft: owner.setDraft,
        onSubmit: () => assert.fail("A consumed local /clear must not reach message delivery"),
        working: false,
        clearOnSubmit: false,
      });
      submitCommand(false);
      await clearFinished.promise;
      await replacementReady;
    },
    async select(id: string) {
      current.disconnect();
      currentId = id;
      current = composerSessionFor(id, drafts);
      await current.connect();
      return current;
    },
    async persisted(id: string) {
      current.flush(); original.flush();
      await drafts.load(id);
      return new ComposerDrafts(client).load(id);
    },
    dispose() { current.disconnect(); original.disconnect(); },
  };
}

for (const agent of ["claude", "reason"] satisfies Agent[]) {
  for (const phase of agent === "reason" ? ["read", "write"] : ["read"]) {
    test(`${agent}: removing settled A cannot remove or resurrect it when B finishes ${phase}`, { timeout: 10_000 }, async (t) => {
      const h = await fixture(agent); t.after(h.dispose);
      await h.callbacks().attachFiles([picked("A.png")]);
      const a = h.current().snapshot().attachments[0]; assert.ok(a);
      const read = deferred<ArrayBuffer>(), write = deferred<void>();
      const readStarted = deferred<void>();
      const writeStarted = phase === "write" ? h.holdWrite(write.promise) : undefined;
      const adding = h.callbacks().attachFiles([picked("B.png", phase === "read" ? () => { readStarted.resolve(); return read.promise; } : undefined)]);
      await (writeStarted ?? readStarted.promise);
      assert.deepEqual(h.current().snapshot().attachments.map((item) => item.label), ["A.png"]);
      h.callbacks().removeAttachment(a);
      assert.deepEqual(h.current().snapshot().attachments, []);
      read.resolve(new Uint8Array([0, 1]).buffer); write.resolve(); await adding;
      const [b] = h.current().snapshot().attachments; assert.ok(b);
      assert.equal(b.label, "B.png"); assert.notEqual(b.name, a.name);
      assert.deepEqual(h.current().snapshot().attachments, [b]);
      const removals = h.requests.filter((item) => item.command === "draft_attachment_remove");
      assert.deepEqual(removals.map((item) => item.args.relativePath), agent === "reason" ? [a.name] : []);
      if (agent === "reason") { assert.equal(h.staged.has(a.name), false); assert.equal(h.staged.has(b.name), true); }
      assert.deepEqual(await h.persisted(h.originalId), { message: "", attachments: [b] });
      assert.deepEqual(h.delivered, []);
    });
  }
}

test("local /clear during B read separates the replacement from late original-owner settlement", { timeout: 10_000 }, async (t) => {
  const h = await fixture("claude"); t.after(h.dispose);
  h.original.setDraft("original draft");
  const read = deferred<ArrayBuffer>(), started = deferred<void>();
  const adding = h.callbacks().attachFiles([picked("B.png", () => { started.resolve(); return read.promise; })]);
  await started.promise;
  await h.clear();
  assert.notEqual(h.currentId(), h.originalId);
  h.current().setDraft("replacement draft");
  read.resolve(new Uint8Array([0, 1]).buffer); await adding;
  const b = h.original.snapshot().attachments[0]; assert.ok(b);
  assert.equal(b.label, "B.png"); assert.equal(b.staged, undefined);
  assert.equal(h.current().snapshot().draft, "replacement draft");
  assert.deepEqual(h.current().snapshot().attachments, []);
  assert.equal(h.original.snapshot().draft, "");
  assert.deepEqual(await h.persisted(h.originalId), { message: "", attachments: [b] });
  assert.equal(await h.persisted(h.currentId()), "replacement draft");
  assert.deepEqual(h.replacements.map((item) => item.sourceId), [h.originalId]);
  assert.deepEqual(h.requests.map((item) => item.command), ["db_clear_local_chat"]);
  assert.deepEqual(h.delivered, []);
});

test("local /clear during persisted-attachment copy stops old-chat delivery without touching the replacement", { timeout: 10_000 }, async (t) => {
  const h = await fixture("claude"); t.after(h.dispose);
  const attachment = { name: ".context/attachments/abc123/plan.md", label: "plan.md", text: "Exact plan", staged: ".context/attachments/abc123/plan.md" };
  await h.drafts.save("persisted-source", "implement", [attachment]);
  h.staged.set(attachment.name, new TextEncoder().encode(attachment.text));
  const source = await h.select("persisted-source");
  assert.deepEqual(source.snapshot().attachments, [attachment]);
  const copy = deferred<void>(); const started = h.holdCopy(copy.promise);
  const sending = h.callbacks().onSubmit({ text: "implement" }, "queue");
  await started;
  await h.clear();
  h.current().setDraft("replacement stays");
  copy.resolve(); await sending;
  assert.deepEqual(h.delivered, []);
  assert.deepEqual(h.copied, [attachment.name]);
  const { staged: _staged, ...copied } = attachment;
  assert.deepEqual(source.snapshot().attachments, [copied]);
  assert.equal(source.snapshot().draft, "");
  assert.deepEqual(await h.persisted("persisted-source"), { message: "", attachments: [copied] });
  assert.equal(await h.persisted(h.currentId()), "replacement stays");
  assert.deepEqual(h.current().snapshot().attachments, []);
  assert.deepEqual(h.replacements.map((item) => item.sourceId), ["persisted-source"]);
  assert.deepEqual(h.requests.filter((item) => item.command === "draft_attachment_upload").map((item) => item.args), [{ localWorkspaceId: "settlement-workspace", relativePath: attachment.name, workspacePath: "/synthetic/workspace" }]);
});

for (const phase of ["read", "write"]) {
  test(`navigation and remount preserve pending ${phase} and permit one later send`, { timeout: 10_000 }, async (t) => {
    const h = await fixture("reason"); t.after(h.dispose);
    h.original.setDraft("keep with original");
    const read = deferred<ArrayBuffer>(), write = deferred<void>(), readStarted = deferred<void>();
    const writeStarted = phase === "write" ? h.holdWrite(write.promise) : undefined;
    const adding = h.callbacks().attachFiles([picked("B.png", phase === "read" ? () => { readStarted.resolve(); return read.promise; } : undefined)]);
    await (writeStarted ?? readStarted.promise);
    await h.select("unrelated-chat"); h.current().setDraft("other chat");
    read.resolve(new Uint8Array([0, 1]).buffer); write.resolve(); await adding;
    const [b] = h.original.snapshot().attachments; assert.ok(b?.staged);
    assert.deepEqual(h.current().snapshot().attachments, []);
    assert.equal(h.current().snapshot().draft, "other chat");
    assert.deepEqual(await h.persisted(h.originalId), { message: "keep with original", attachments: [b] });
    assert.equal(await h.select(h.originalId), h.original);
    await h.callbacks().onSubmit({ text: "keep with original" }, "queue");
    assert.equal(h.delivered.length, 1);
    assert.equal(h.delivered[0]?.chatId, h.originalId);
    assert.deepEqual(h.copied, [b.name]);
    assert.deepEqual(h.delivered[0]?.attachments, [{ name: b.name, text: b.text }]);
    assert.deepEqual(h.original.snapshot().attachments, []);
    assert.equal(await h.persisted(h.originalId), "");
    assert.equal(await h.persisted("unrelated-chat"), "other chat");
  });
}
