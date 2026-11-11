#!/usr/bin/env node
// Mounted production-source behavior. Uses an already-admitted Vite server;
// no native app, provider process, sign-in, or server is started by this test.
// Usage: node tools/e2e/sent-user-content.browser.mjs <preview-url> <output-dir> [chromium]
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2];
const out = process.argv[3];
if (!base || !out) throw Error("preview URL and output directory are required");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.argv[4] ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.route("**/src/main.tsx", async (route) => {
    const entry = await (await route.fetch()).text();
    const composer = await (await fetch(new URL("/src/features/chat/Composer.tsx", base))).text();
    const react = composer.match(/from ["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    const dom = entry.match(/from ["']([^"']*react-dom_client[^"']*)["']/)?.[1];
    if (!react || !dom) throw Error("Vite's actual React module URLs were not found");
    const fixture = `
import * as React from ${JSON.stringify(react)};
import * as ReactDOM from ${JSON.stringify(dom)};
import { Composer } from "/src/features/chat/Composer.tsx";
import { Transcript } from "/src/features/chat/Transcript.tsx";
import { SentUserContent } from "/src/features/chat/SentUserContent.tsx";
import { KeybindingsProvider } from "/src/keybindings/KeybindingsProvider.tsx";
import { createChatRuntime } from "/src/features/chat/chatRuntime.ts";
import { applyReasonPayload } from "/src/features/chat/reason.ts";
import { writeComposerDraft } from "/src/features/chat/composerDocument.ts";
import { submittedUserPrompt } from "/src/features/chat/userContent.ts";
import { restoreEvents } from "/src/features/chat/persist.ts";
import { applyChatEvents, emptyTranscript } from "/src/features/chat/reducer.ts";
const h = React.createElement;
const runId = "mounted-v1";
let deliver;
const prompts = [];
const storage = new Map();
const saved = new Map();
const backend = {
  canSteer: true, defaultConfig: null,
  sessionKey: (id) => "fixture.session." + id,
  configKey: (id) => "fixture.config." + id,
  parseConfig: () => null,
  listen: async (send) => { deliver = send; },
  open: async () => {},
  prompt: (request) => { prompts.push(request); return new Promise(() => {}); },
  cancel: () => {},
};
const runtime = createChatRuntime(backend, {
  persist: true, invoke: async (command, args) => {
    if (command === "chat_messages_load") return { messages: [], agentSessionId: null };
    if (command === "chat_messages_save") {
      for (const row of args.upserts) saved.set(row.id, row.fullMessage);
      for (const id of args.deleteIds) saved.delete(id);
    }
    return null;
  }, recordTurnChanges: () => {},
  storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
});
const hostSource = await (await fetch("/src/components/WorkspaceView.tsx")).text();
const start = hostSource.indexOf("function submit(input, mode, attached = [])");
const end = hostSource.indexOf("\\n  }", start) + 4;
if (start < 0 || end < 4) throw Error("actual WorkspaceView submit adapter not found");
const submit = new Function("agent", "runId", "cwd", "main", "repo", "workspace", "dispatch", "renameAfterFirstMessage",
  hostSource.slice(start, end) + "; return submit;")(
    runtime, runId, "/ws", false, { id: "repo", path: "/repo" }, { id: "workspace" }, () => {}, () => {});
const initial = writeComposerDraft([
  { kind: "text", text: "  Review " },
  { kind: "file", path: "src/a file.ts", label: "Custom label", directory: false },
  { kind: "text", text: " + " },
  { kind: "file", path: "src", label: "Directory", directory: true },
  { kind: "text", text: " now  " },
]);
const api = window.sentV1 = { inputs: [], modes: [], opened: [], retryInputs: [], prompts,
  snapshot: () => runtime.snapshot(runId), saved: () => [...saved.values()], initial: submittedUserPrompt(initial) };
api.failAll = () => {
  const count = Object.values(runtime.snapshot(runId).transcript.turns).filter((turn) => turn.status === "running").length;
  for (let i = 0; i < count; i++) deliver(runId, (state) => applyReasonPayload(state, { chatId: runId, type: "turnEnded", end: { outcome: "failed", message: "fixture failure" } }));
};
api.failedSameTexts = async () => {
  api.failAll();
  for (const path of ["one.ts", "two.ts"]) {
    const userContent = submittedUserPrompt(writeComposerDraft([{ kind: "file", path, label: path, directory: false }])).userContent;
    submit({ text: "same", userContent }, "queue");
    await new Promise((resolve) => setTimeout(resolve, 0));
    api.failAll();
  }
};
function Harness() {
  const [draft, setDraft] = React.useState(initial);
  const [snapshot, setSnapshot] = React.useState(() => runtime.snapshot(runId));
  const [targets, setTargets] = React.useState(null);
  const [restored, setRestored] = React.useState(null);
  const inputRef = React.useRef(null);
  React.useEffect(() => runtime.subscribe(runId, setSnapshot), []);
  api.setDraft = setDraft;
  api.targets = setTargets;
  api.restoreSaved = () => {
    const result = applyChatEvents(emptyTranscript(runId), restoreEvents(runId, [...saved.values()]));
    if (!result.ok) throw Error("persisted transcript rejected");
    setRestored(result.transcript);
  };
  api.showLive = () => setRestored(null);
  return h("main", { style: { maxWidth: 840, margin: "24px auto", fontFamily: "system-ui" } },
    h("h1", {}, "Sent file identity"),
    h(Transcript, {
      transcript: restored ?? snapshot.transcript, workspacePath: "/ws",
      onOpenFile: (path) => api.opened.push(path),
      onRetry: (input) => { api.retryInputs.push(structuredClone(input)); submit(input, "queue"); },
    }),
    h(Composer, {
      draft, setDraft, inputRef, queue: snapshot.queue, canSteer: true, clearOnSubmit: false,
      onStop: () => {}, onQueue: (action) => runtime.queueAction(runId, action),
      onSubmit: (input, mode) => { api.inputs.push(structuredClone(input)); api.modes.push(mode); submit(input, mode); },
    }),
    h("section", { id: "target-cases" }, targets ? h(SentUserContent, {
      content: targets.content, workspacePath: targets.workspacePath,
      onOpenFile: targets.callback ? (path) => api.opened.push(path) : undefined,
    }) : null));
}
(ReactDOM.createRoot ?? ReactDOM.default.createRoot)(document.getElementById("root")).render(h(KeybindingsProvider, {}, h(Harness)));
`;
    await route.fulfill({ contentType: "text/javascript", body: fixture });
  });
  await page.goto(base);
  const composer = page.locator(".composer [contenteditable=true]");
  await composer.waitFor();
  await page.locator('[data-testid="composer-send-button"]').click();
  await page.waitForFunction(() => window.sentV1.inputs.length === 1);
  await composer.press("Enter");
  await page.waitForFunction(() => window.sentV1.inputs.length === 2);
  await composer.press("Meta+Enter");
  await page.waitForFunction(() => window.sentV1.inputs.length === 3);
  const submitted = await page.evaluate(() => ({ inputs: window.sentV1.inputs, modes: window.sentV1.modes, initial: window.sentV1.initial }));
  assert.deepEqual(submitted.inputs, [submitted.initial, submitted.initial, submitted.initial]);
  assert.deepEqual(submitted.modes, ["queue", "steer", "queue"]);
  assert.deepEqual(await page.evaluate(() => window.sentV1.prompts.map((request) => ({ text: request.text, attachments: request.attachments, leaked: "userContent" in request }))),
    Array.from({ length: 2 }, () => ({ text: submitted.initial.text, attachments: [], leaked: false })));

  const row = page.locator(".queue-row[data-id]").first();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const group = page.getByRole("group", { name: "Edit queued message" });
  const edit = group.locator("[contenteditable=true]");
  await edit.waitFor();
  assert.equal(await group.locator("[data-mention-path]").count(), 2);
  await page.screenshot({ path: join(out, "queued-file-atoms.png") });
  await edit.press("End");
  await edit.press("ArrowRight");
  await page.keyboard.insertText(" changed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  let queued = await page.evaluate(() => window.sentV1.snapshot().queue.items[0]);
  assert.ok(queued.text.endsWith("changed"));
  assert.equal(queued.userContent.parts.filter((part) => part.kind === "file").length, 2);
  const beforeCancel = structuredClone(queued);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await group.locator('[data-mention-path="src/a file.ts"]').click();
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.sentV1.snapshot().queue.items[0]), beforeCancel);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await group.locator('[data-mention-path="src/a file.ts"]').click();
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText("@src/a file.ts");
  assert.equal(await group.locator('[data-mention-path="src/a file.ts"]').count(), 0);
  await page.getByRole("button", { name: "Save and steer", exact: true }).click();
  await group.waitFor({ state: "detached" });
  queued = await page.evaluate(() => window.sentV1.snapshot().transcript.messages.filter((message) => message.role === "user").at(-1));
  assert.equal(queued.userContent.parts.some((part) => part.kind === "file" && part.path === "src/a file.ts"), false);
  assert.ok(queued.blocks[0].text.includes("@src/a file.ts"));
  assert.equal(await page.locator(".queue-row").count(), 0);

  await page.waitForFunction(() => window.sentV1.saved().length >= 3);
  await page.evaluate(() => window.sentV1.restoreSaved());
  const chip = page.locator(".transcript").getByRole("button", { name: "Custom label", exact: true }).first();
  await chip.click();
  await chip.press("Enter");
  await chip.press("Space");
  assert.deepEqual(await page.evaluate(() => window.sentV1.opened), ["/ws/src/a file.ts", "/ws/src/a file.ts", "/ws/src/a file.ts"]);
  assert.equal(await page.locator(".transcript").getByRole("button", { name: "Directory", exact: true }).count(), 0);
  await page.screenshot({ path: join(out, "sent-file-chips.png") });

  await page.evaluate(() => window.sentV1.targets({ callback: true, workspacePath: "/ws", content: {
    version: 1, parts: [
      { kind: "file", path: "../escape", label: "Traversal", directory: false },
      { kind: "file", path: "https://example.test/a", label: "URI", directory: false },
      { kind: "file", path: "/outside/a", label: "Outside", directory: false },
      { kind: "file", path: "src", label: "Directory", directory: true },
      { kind: "file", path: "a\0b", label: "NUL", directory: false },
      { kind: "file", path: "good file.ts", label: "<img onerror='bad'>", directory: false },
    ], attachments: [{ kind: "embedded", name: "notes.md", label: "Notes" }],
  } }));
  const targets = page.locator("#target-cases");
  await targets.getByRole("button").waitFor();
  assert.equal(await targets.getByRole("button").count(), 1);
  assert.equal(await targets.locator("img").count(), 0);
  assert.ok((await targets.textContent()).includes("Attached: notes.md"));
  await targets.getByRole("button").click();
  assert.equal(await page.evaluate(() => window.sentV1.opened.at(-1)), "/ws/good file.ts");
  for (const missing of ["callback", "workspacePath"]) {
    await page.evaluate((missing) => window.sentV1.targets({
      callback: missing !== "callback", workspacePath: missing !== "workspacePath" ? "/ws" : undefined,
      content: { version: 1, parts: [{ kind: "file", path: "a.ts", label: "Inert", directory: false }], attachments: [] },
    }), missing);
    await targets.getByText("Inert", { exact: true }).waitFor();
    assert.equal(await targets.getByRole("button").count(), 0);
  }

  await page.evaluate(() => window.sentV1.showLive());
  await page.evaluate(() => window.sentV1.failedSameTexts());
  const firstDuplicate = page.locator(".oc-turn").filter({ has: page.locator('.oc-user-text [title="one.ts"]') }).first();
  await firstDuplicate.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(() => window.sentV1.retryInputs.length === 1);
  const retry = await page.evaluate(() => ({
    input: window.sentV1.retryInputs[0], prompt: window.sentV1.prompts.at(-1),
    user: window.sentV1.snapshot().transcript.messages.filter((message) => message.role === "user").at(-1),
  }));
  assert.equal(retry.input.text, "same");
  assert.equal(retry.prompt.text, "same");
  assert.equal(retry.user.userContent.parts[0].path, "one.ts");
  assert.deepEqual(retry.user.userContent, retry.input.userContent);
  assert.deepEqual(errors, []);
  writeFileSync(join(out, "results.json"), JSON.stringify({ passed: true, boundaries: ["actual Composer form/default/opposite", "real queue editor save/delete/cancel/steer", "mouse/Enter/Space chips", "inert unsafe/missing/directory targets", "actual footer to WorkspaceView submit to runtime exact-source retry"], providerText: submitted.initial.text }, null, 2));
  console.log("PASS mounted sent-user V1 behavior; provider and native parity not exercised");
} finally {
  await browser.close();
}
