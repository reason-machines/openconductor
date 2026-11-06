// End-to-end check of a chat tab's right-click menu and the Rename chat dialog
// (Conductor's session tab `u8i` and `Iya`/`Rya`, renderApp-D_fmY7hW.js
// @7,374,777 and @11,059,961) in a real browser, on a stand-in Tauri backend:
// the menu's items in Conductor's order, Rename chat storing the title with
// db_rename_chat and showing it on the tab (also after a reload, from
// db_list_workspaces' chatTitle), Copy full / concise transcript and Copy link
// on the clipboard with Conductor's toasts, and Close others on a "+" chat.
// Run after `npm run build`:
//
//   node --test tests/e2e/chat-tab-menu.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

/** One workspace (oslo) whose chat has one finished turn; `chatTitle` is the stored main chat title. */
function fakeBackend({ chatTitle }) {
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" }, collapsed: [] }));
  const at = "2026-11-05T10:00:00.000Z";
  const turn = { status: "completed", startedAt: at, endedAt: "2026-11-05T10:01:00.000Z" };
  const messages = [
    { id: "w1:t1:user", sessionId: "w1", turnId: "w1:t1", role: "user", createdAt: at, blocks: [{ type: "text", text: "Why does login loop?" }], turn },
    {
      id: "w1:t1:assistant",
      sessionId: "w1",
      turnId: "w1:t1",
      role: "assistant",
      createdAt: at,
      blocks: [
        { type: "text", text: "Looking." },
        { type: "tool_use", id: "b1", name: "Bash: pnpm test", input: { toolName: "Bash", rawInput: { command: "pnpm test" } } },
        { type: "tool_result", toolUseId: "b1", content: "4 passed" },
        { type: "text", text: "Fixed." },
      ],
    },
  ];
  window.__writes = [];
  window.__clipboard = [];
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void window.__clipboard.push(t), readText: async () => window.__clipboard.at(-1) ?? "" } });
  let cb = 0;
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => ++cb,
    async invoke(cmd, args) {
      switch (cmd) {
        case "plugin:event|listen":
          return 1;
        case "plugin:event|unlisten":
          return;
        case "db_list_repos":
          return [{ id: "r1", name: "demo", rootPath: "/repo", remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: "2026-01-01T00:00:00Z" }];
        case "db_list_workspaces":
          return [
            {
              id: "w1", repositoryId: "r1", directoryName: "oslo", workspaceName: "oslo", branch: "oslo", placeholderBranchName: null, state: "ready", derivedStatus: null,
              manualStatus: null, workspacePath: "/repo/oslo", pinnedAt: null, unread: false, unreadChats: [], chatTabs: [], chatTitle, prTitle: null, prDescription: null,
              number: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
            },
          ];
        case "chat_messages_load":
          return args.chatId === "w1" ? { messages: messages.map((m) => JSON.stringify(m)), agentSessionId: null } : { messages: [], agentSessionId: null };
        case "db_rename_chat":
        case "db_open_chat_tab":
        case "db_close_chat_tab":
        case "db_set_chat_unread":
          window.__writes.push([cmd, args]);
          return;
        case "local_storage_get_entry":
          return null;
        case "local_storage_set_entry":
          return { success: true };
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}

const chatTab = (page) => page.locator(".main-tabs [role=tab]").first();
const menuOf = (page) => page.getByRole("menu", { name: "Chat actions" });
const items = (page) => menuOf(page).locator("[role=menuitem]").evaluateAll((els) => els.map((e) => e.textContent.trim()));
const writes = (page) => page.evaluate(() => window.__writes.splice(0));

test("the chat tab menu has Conductor's items; Rename chat stores and shows the title", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(fakeBackend, { chatTitle: null });
  await page.goto(`${base}/`);
  await chatTab(page).waitFor();
  assert.equal(await chatTab(page).textContent(), "oslo", "an unrenamed main chat shows the workspace name");

  await chatTab(page).click({ button: "right" });
  // The workspace's own chat has no close button, so no Close tab; Close others is disabled with no other tab.
  assert.deepEqual(await items(page), ["Mark as unread", "Rename chat", "Copy concise transcript⌘⌥C", "Copy full transcript", "Copy link", "Close others"]);
  assert.equal(await menuOf(page).getByRole("menuitem", { name: "Close others" }).getAttribute("aria-disabled"), "true");
  await menuOf(page).getByRole("menuitem", { name: "Rename chat" }).click();

  const dialog = page.getByRole("dialog", { name: "Rename chat" });
  await dialog.waitFor();
  const input = dialog.getByRole("textbox", { name: "Chat name" });
  assert.equal(await input.inputValue(), "oslo");
  await input.fill("Fix login loop");
  await input.press("Enter");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await chatTab(page).textContent(), "Fix login loop");
  assert.deepEqual(await writes(page), [["db_rename_chat", { chatId: "w1", workspaceId: "w1", title: "Fix login loop" }]]);

  // An unchanged title just closes.
  await chatTab(page).click({ button: "right" });
  await menuOf(page).getByRole("menuitem", { name: "Rename chat" }).click();
  await dialog.getByRole("button", { name: "OK" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(await writes(page), []);
  await page.close();
});

test("a stored main chat title shows after a restart", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(fakeBackend, { chatTitle: "Fix login loop" });
  await page.goto(`${base}/`);
  await page.locator(".main-tabs [role=tab]", { hasText: "Fix login loop" }).waitFor();
  await page.close();
});

test("Copy full transcript, Copy concise transcript and Copy link", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(fakeBackend, { chatTitle: null });
  await page.goto(`${base}/`);
  await page.getByText("Fixed.").waitFor();
  const clip = () => page.evaluate(() => window.__clipboard.at(-1));
  const pick = async (name) => {
    await chatTab(page).click({ button: "right" });
    await menuOf(page).getByRole("menuitem", { name }).click();
  };

  await pick("Copy full transcript");
  await page.getByText('Copied complete transcript of "oslo"').waitFor();
  assert.equal(await clip(), "## User\n\nWhy does login loop?\n\n## Assistant\n\nLooking.\n\n    Bash: pnpm test\n    ↳ 4 passed\n\nFixed.");

  await pick(/Copy concise transcript/);
  await page.getByText('Copied concise transcript of "oslo"').waitFor();
  assert.equal(await clip(), "## User\n\nWhy does login loop?\n\n## Assistant\n\nLooking.\n\n[1 tool call elided]\n\nFixed.");

  await pick("Copy link");
  await page.getByText("Copied link", { exact: true }).waitFor();
  assert.equal(await clip(), "openconductor://workspace?id=w1&session=w1");
  await page.close();
});

test("a + chat's menu has Close tab; Close others closes the other chats", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(fakeBackend, { chatTitle: null });
  await page.goto(`${base}/`);
  await chatTab(page).waitFor();
  const newChat = page.getByRole("button", { name: /New chat/ });
  await newChat.click();
  await newChat.click();
  const tabs = page.locator(".main-tabs [role=tab]");
  await page.waitForFunction(() => document.querySelectorAll(".main-tabs [role=tab]").length === 3);
  await writes(page);

  await tabs.nth(1).click({ button: "right" });
  assert.deepEqual(await items(page), ["Mark as unread", "Rename chat", "Copy concise transcript⌘⌥C", "Copy full transcript", "Copy link", "Close tab⌘W", "Close others"]);
  await menuOf(page).getByRole("menuitem", { name: "Rename chat" }).click();
  const input = page.getByRole("dialog", { name: "Rename chat" }).getByRole("textbox", { name: "Chat name" });
  assert.equal(await input.inputValue(), "Untitled");
  await input.fill("Scratch");
  await input.press("Enter");
  await page.locator(".main-tabs [role=tab]", { hasText: "Scratch" }).waitFor();
  const [rename] = await writes(page);
  assert.equal(rename[0], "db_rename_chat");
  assert.equal(rename[1].title, "Scratch");

  await tabs.nth(1).click({ button: "right" });
  await menuOf(page).getByRole("menuitem", { name: "Close others" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".main-tabs [role=tab]").length === 2);
  assert.deepEqual(await tabs.allTextContents(), ["oslo", "Scratch"], "the other + chat closed; the workspace's own chat stays");
  assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true", "the chat the menu was opened on is shown");
  assert.deepEqual((await writes(page)).map((w) => w[0]), ["db_close_chat_tab"]);
  await page.close();
});
