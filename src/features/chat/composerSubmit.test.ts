import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { ComposerSession } from "./composerSession.ts";
import { submittedUserPrompt, withSentAttachmentDisplay, type UserPrompt } from "./userContent.ts";
import { composerPrompt, writeComposerDraft } from "./composerDocument.ts";

function source(path: string) {
  return process.env.COMPOSER_REGRESSION_REF
    ? execFileSync("git", ["show", `${process.env.COMPOSER_REGRESSION_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}
function handler(source: string, signature: string, bindings: Record<string, unknown>) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1);
  const end = source.indexOf("\n  }", start) + "\n  }".length;
  const code = stripTypeScriptTypes(source.slice(start, end));
  return new Function(...Object.keys(bindings), `${code}; return ${signature.includes("onSubmit") ? "onSubmit" : "submit"};`)(...Object.values(bindings));
}

test("actual Composer and WorkspaceView submit handlers retain text and chips when native copy rejects", async () => {
  const session = new ComposerSession("chat-b", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  const attachment = { name: ".context/attachments/abc123/binary.png", staged: ".context/attachments/abc123/binary.png", text: "The file is in the workspace" };
  session.setDraft("keep me"); session.setAttachments([attachment]);
  let deliveries = 0; const nativeCalls: unknown[] = [];
  const workspaceSubmit = handler(source("src/components/WorkspaceView.tsx"), "  async function onSubmit(", {
    session,
    withSentAttachmentDisplay,
    attachments: session.snapshot().attachments,
    setAttachments: session.setAttachments,
    setAttachError: () => {},
    workspace: { id: "native-workspace" }, cwd: "/native/worktree",
    draftAttachmentsApi: { uploadToWorkspace: async (args: unknown) => { nativeCalls.push(args); throw Error("copy refused"); } },
    submit: () => { deliveries++; },
  });
  let submitted: Promise<unknown> | undefined;
  const composerSubmit = handler(source("src/features/chat/Composer.tsx"), "  function submit(opposite:", {
    inputRef: { current: { composing: () => false } }, draft: session.snapshot().draft,
    submittedUserPrompt, composerPrompt, hasAttachments: true,
    onCommand: undefined, working: false, mode: () => "queue", clearOnSubmit: false,
    setDraft: session.setDraft,
    onSubmit: (...args: unknown[]) => { submitted = workspaceSubmit(...args); },
  });
  composerSubmit(false); await submitted;
  assert.equal(deliveries, 0, "no invalid file note reaches the agent");
  assert.equal(session.snapshot().draft, "keep me");
  assert.deepEqual(session.snapshot().attachments, [attachment]);
  assert.deepEqual(nativeCalls, [{ localWorkspaceId: "native-workspace", relativePath: attachment.staged, workspacePath: "/native/worktree" }]);
  session.disconnect();
});

function hostSubmit(session: ComposerSession, upload: (args: unknown) => Promise<void>, deliver: (input: UserPrompt, mode: string, attachments: unknown) => void) {
  return handler(source("src/components/WorkspaceView.tsx"), "  async function onSubmit(", {
    session, withSentAttachmentDisplay, workspace: { id: "workspace" }, cwd: "/ws",
    draftAttachmentsApi: { uploadToWorkspace: upload }, submit: deliver,
  });
}

function composerSubmit(session: ComposerSession, deliver: (...args: unknown[]) => void, command?: (text: string) => boolean) {
  return handler(source("src/features/chat/Composer.tsx"), "  function submit(opposite:", {
    inputRef: { current: { composing: () => false } }, draft: session.snapshot().draft,
    submittedUserPrompt, composerPrompt, hasAttachments: session.snapshot().attachments.length > 0,
    onCommand: command, working: true, mode: (opposite: boolean) => opposite ? "queue" : "steer",
    clearOnSubmit: false, setDraft: session.setDraft, onSubmit: deliver,
  });
}

test("actual submit snapshots atoms before asynchronous copy; later draft edits cannot retarget the sent file", async () => {
  const session = new ComposerSession("host-snapshot", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  const path = ".context/attachments/abc123/file.png";
  session.setAttachments([{ name: path, label: "Picture", text: "body bytes", staged: path }]);
  const draft = writeComposerDraft([{ kind: "text", text: " Review " }, { kind: "file", path: "src/a file.ts", label: "Custom", directory: false }]);
  session.setDraft(draft);
  let copied = () => {};
  const pending = new Promise<void>((resolve) => { copied = resolve; });
  const deliveries: { input: UserPrompt; mode: string; attachments: unknown }[] = [];
  const actualHost = hostSubmit(session, () => pending, (input, mode, attachments) => deliveries.push({ input, mode, attachments }));
  let sent: Promise<void> | undefined;
  composerSubmit(session, (...args) => { sent = actualHost(...args); })(false);
  assert.deepEqual(deliveries, [], "no partial sent row before the copy completes");
  session.setDraft("a later draft");
  copied();
  await sent;
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.input.text, composerPrompt(draft).trim());
  assert.deepEqual(deliveries[0]?.input.userContent?.parts, submittedUserPrompt(draft).userContent?.parts);
  assert.deepEqual(deliveries[0]?.input.userContent?.attachments, [{ kind: "workspace-file", name: path, label: "Picture", path }]);
  assert.deepEqual(deliveries[0]?.attachments, [{ name: path, text: "body bytes" }]);
  assert.equal(deliveries[0]?.mode, "steer");
  assert.equal(session.snapshot().draft, "a later draft");
  const json = JSON.stringify(deliveries[0]?.input.userContent);
  assert.ok(!json.includes("body bytes") && !json.includes("staged") && !json.includes("generation"));
  session.disconnect();
});

test("actual host generation invalidation sends nothing and previously copied paths do not gain a fabricated receipt", async () => {
  const session = new ComposerSession("host-invalidated", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  const path = ".context/attachments/abc123/file.png";
  session.setAttachments([{ name: path, text: "body", staged: path }]);
  let copied = () => {};
  const pending = new Promise<void>((resolve) => { copied = resolve; });
  const deliveries: UserPrompt[] = [];
  const actualHost = hostSubmit(session, () => pending, (input) => deliveries.push(input));
  const send = actualHost({ text: "send" }, "queue");
  session.disconnect();
  copied(); await send;
  assert.deepEqual(deliveries, []);
  await session.connect();
  await hostSubmit(session, async () => assert.fail("already copied attachment"), (input) => deliveries.push(input))({ text: "send" }, "queue");
  assert.deepEqual(deliveries, [{ text: "send" }]);
  session.disconnect();
});

test("actual attachment-only host send keeps transport bytes and only confirmed display targets", async () => {
  const session = new ComposerSession("host-attachment-only", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  const path = ".context/attachments/abc123/picture.png";
  session.setAttachments([{ name: path, label: "Picture", text: "provider bytes", staged: path }, { name: "generated.md", text: "generated body" }]);
  const delivered: { input: UserPrompt; attachments: unknown }[] = [];
  await hostSubmit(session, async () => {}, (input, _mode, attachments) => delivered.push({ input, attachments }))({ text: "" }, "queue");
  assert.equal(delivered[0]?.input.text, "");
  assert.deepEqual(delivered[0]?.input.userContent?.attachments, [
    { kind: "workspace-file", name: path, label: "Picture", path },
    { kind: "embedded", name: "generated.md", label: "generated.md" },
  ]);
  assert.deepEqual(delivered[0]?.attachments, [{ name: path, text: "provider bytes" }, { name: "generated.md", text: "generated body" }]);
  session.disconnect();
});

test("actual opposite send and slash interception preserve the scalar command contract", async () => {
  const session = new ComposerSession("host-opposite", { load: async () => "", save: async () => true, clear: async () => {} });
  await session.connect();
  session.setDraft(writeComposerDraft([{ kind: "file", path: "a.ts", label: "A", directory: false }]));
  const inputs: unknown[][] = [];
  composerSubmit(session, (...args) => inputs.push(args))(true);
  assert.equal(inputs[0]?.[1], "queue");
  assert.deepEqual(inputs[0]?.[0], submittedUserPrompt(session.snapshot().draft));
  session.setDraft("/help");
  const commands: string[] = [];
  composerSubmit(session, () => assert.fail("handled command submitted"), (text) => { commands.push(text); return true; })(false);
  assert.deepEqual(commands, ["/help"]);
  assert.equal(session.snapshot().draft, "");
  session.disconnect();
});
