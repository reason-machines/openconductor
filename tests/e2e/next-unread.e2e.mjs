// End-to-end check of unread and "Go to next unread" (chat.nextAttention,
// Cmd+Alt+L) in a real browser. On the demo state (`?demo=1`): the palette lists
// it under Navigation only while a chat is unread, Cmd+Alt+L opens the unread
// chat and clears it, and with nothing unread the key does nothing; the chat tab
// menu marks one chat; a click on the open workspace's row reads its unread chat.
// With a stand-in Tauri backend: unread chats load from db_list_workspaces
// (sessions.unread_count, legacy workspaces.unread) and the row and tab menus
// write db_set_chat_unread / db_mark_workspace_read.
// Run after `npm run build`:
//
//   node --test tests/e2e/next-unread.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
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
const SHOTS = process.env.E2E_SHOTS_DIR;

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

const ROW = '[data-testid="left-sidebar-workspace-item"]';
const DOT = '[data-testid="chat-tab-unread"]';
const row = (page, label) => page.locator(ROW, { has: page.locator(".sb-ws-name", { hasText: label }) });
const palette = (page) => page.getByRole("dialog", { name: "Command palette", exact: true });
const navItems = (page) => palette(page).getByRole("group", { name: "Navigation" }).locator(".palette-title").allTextContents();
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

test("Go to next unread: palette entry while something is unread, Cmd+Alt+L opens it and clears it", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  const names = await page.locator(`${ROW} .sb-ws-name`).allTextContents();
  assert.ok(names.length >= 2, "the demo state has at least two workspaces");
  const [first, second] = names;

  // Nothing unread: no palette entry.
  await page.keyboard.press("Meta+k");
  await palette(page).waitFor();
  assert.ok(!(await navItems(page)).includes("Go to next unread"));
  await page.keyboard.press("Escape");
  await palette(page).waitFor({ state: "detached" });

  // Open the first workspace, mark the second unread from its row menu.
  await row(page, first).click();
  await row(page, second).click({ button: "right" });
  await page.keyboard.press("r");
  assert.equal(await row(page, second).getAttribute("data-unread"), "true");

  // The palette now lists it first under Navigation, with Conductor's shortcut.
  await page.keyboard.press("Meta+k");
  await palette(page).waitFor();
  assert.equal((await navItems(page))[0], "Go to next unread");
  const item = palette(page).locator(".palette-item", { hasText: "Go to next unread" });
  assert.ok((await item.locator(".palette-kbd").textContent())?.includes("L"));
  await shot(page, "1-palette-next-unread");
  await page.keyboard.press("Escape");
  await palette(page).waitFor({ state: "detached" });

  // Cmd+Alt+L opens the unread workspace and clears its unread flag.
  await page.keyboard.press("Meta+Alt+KeyL");
  await page.waitForFunction((label) => {
    const r = [...document.querySelectorAll('[data-testid="left-sidebar-workspace-item"]')].find((e) => e.querySelector(".sb-ws-name")?.textContent === label);
    return r?.getAttribute("aria-current") === "page";
  }, second);
  assert.equal(await row(page, second).getAttribute("data-unread"), null);
  await shot(page, "2-after-cmd-alt-l");

  // Nothing unread any more: the key changes nothing and the entry is gone.
  await page.keyboard.press("Meta+Alt+KeyL");
  assert.equal(await row(page, second).getAttribute("aria-current"), "page");
  await page.keyboard.press("Meta+k");
  await palette(page).waitFor();
  assert.ok(!(await navItems(page)).includes("Go to next unread"));
  await page.keyboard.press("Escape");

  // From the palette: mark the first unread again, then choose the entry.
  await row(page, first).click({ button: "right" });
  await page.keyboard.press("r");
  await page.keyboard.press("Meta+k");
  await palette(page).waitFor();
  await palette(page).locator(".palette-item", { hasText: "Go to next unread" }).click();
  assert.equal(await row(page, first).getAttribute("aria-current"), "page");
  assert.equal(await row(page, first).getAttribute("data-unread"), null);
  await page.close();
});

// parity:sidebar.ws-unread follow-up: Conductor marks a chat unread when its turn
// ends while the user is not looking at it (applyTurnCompletionTails), shows a
// "Next unread" button above the composer while another chat is unread (g1o),
// and keeps a hand mark on the open workspace (manuallyUnreadSessions).
test("a turn that ends out of view marks its workspace unread; the composer's Next unread opens it", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  const [first, second] = await page.locator(`${ROW} .sb-ws-name`).allTextContents();
  const composer = page.locator(".composer [contenteditable=true]");
  const nextUnread = page.getByRole("button", { name: "Next unread" });

  // A turn that ends while its chat is on screen leaves the workspace read.
  await row(page, first).click();
  await composer.fill("stay and watch");
  await composer.press("Enter");
  await page.locator(".composer-wrap").getByText(/Stop|Waiting/).first().waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(3_500);
  assert.equal(await row(page, first).getAttribute("data-unread"), null, "watched turn does not mark unread");
  assert.equal(await nextUnread.count(), 0, "nothing unread: no button");

  // Send, then leave for the second workspace before the stand-in agent answers (2.5 s).
  await composer.fill("work on this while I look elsewhere");
  await composer.press("Enter");
  await row(page, second).click();
  await page.waitForFunction((label) => {
    const r = [...document.querySelectorAll('[data-testid="left-sidebar-workspace-item"]')].find((e) => e.querySelector(".sb-ws-name")?.textContent === label);
    return r?.getAttribute("data-unread") === "true";
  }, first, { timeout: 10_000 });
  await nextUnread.waitFor();
  await shot(page, "3-composer-next-unread");

  // The button opens the unread workspace and clears it; then it is gone.
  await nextUnread.click();
  assert.equal(await row(page, first).getAttribute("aria-current"), "page");
  assert.equal(await row(page, first).getAttribute("data-unread"), null);
  assert.equal(await nextUnread.count(), 0);

  // A hand mark on the open workspace sticks while it is on screen.
  await row(page, first).click({ button: "right" });
  await page.keyboard.press("r");
  await page.waitForTimeout(300);
  assert.equal(await row(page, first).getAttribute("data-unread"), "true", "Mark as unread on the open workspace is kept");
  await page.close();
});

// parity:sidebar.ws-unread part 4: unread is per chat (sessions.unread_count).
// The chat tab menu marks one chat (renderApp @7,377,893); a click on the open
// workspace's row opens its unread chat and reads it (@9,885,472, fea).
test("the chat tab menu marks one chat; a click on the open workspace's row reads it", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  const [first] = await page.locator(`${ROW} .sb-ws-name`).allTextContents();
  await row(page, first).click();
  const tab = page.locator(".main-tabs [role=tab]").filter({ hasNotText: /All changes|PR/ }).first();
  const chatMenu = page.getByRole("menu", { name: "Chat actions" });

  await tab.click({ button: "right" });
  await chatMenu.getByRole("menuitem", { name: "Mark as unread" }).click();
  assert.equal(await tab.getAttribute("data-unread"), "true", "the chat is unread");
  assert.equal(await tab.locator(DOT).count(), 1, "the unread chat's tab shows the dot (Conductor's l8i)");
  assert.equal(await row(page, first).getAttribute("data-unread"), "true", "so is its workspace");
  await page.waitForTimeout(300);
  assert.equal(await row(page, first).getAttribute("data-unread"), "true", "a hand mark sticks while the chat is shown");
  await shot(page, "4-chat-tab-mark-unread");

  // The open workspace's row opens its first unread chat and reads it.
  await row(page, first).click();
  assert.equal(await tab.getAttribute("data-unread"), null);
  assert.equal(await tab.locator(DOT).count(), 0, "reading the chat clears its tab's dot");
  assert.equal(await row(page, first).getAttribute("data-unread"), null);

  // And the tab menu's "Mark as read" reads it too.
  await tab.click({ button: "right" });
  await chatMenu.getByRole("menuitem", { name: "Mark as unread" }).click();
  await tab.click({ button: "right" });
  assert.equal(await tab.locator(DOT).count(), 1);
  await chatMenu.getByRole("menuitem", { name: "Mark as read" }).click();
  assert.equal(await tab.locator(DOT).count(), 0, "Mark as read clears the dot");
  assert.equal(await row(page, first).getAttribute("data-unread"), null);
  await page.close();
});

// Runs in the page before the app: a stand-in Tauri backend with four workspaces.
function fakeBackend() {
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" }, collapsed: [] }));
  const row = (id, name, extra) => ({
    id, repositoryId: "r1", directoryName: name, workspaceName: name, branch: name, placeholderBranchName: null, state: "ready", derivedStatus: null,
    manualStatus: null, workspacePath: `/repo/${name}`, pinnedAt: null, unread: false, unreadChats: [], prTitle: null, prDescription: null, number: null,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...extra,
  });
  window.__writes = [];
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
            row("w1", "oslo"),
            // An unread main chat (sessions.unread_count = 1).
            row("w2", "lima", { unreadChats: [{ id: "w2", updatedAt: "2026-01-02 00:00:00" }] }),
            // The legacy per-workspace flag.
            row("w3", "rome", { unread: true }),
            // Only a review chat is unread: review tabs do not survive a restart, so it counts as hidden.
            row("w4", "kyiv", { unreadChats: [{ id: "w4:review:1", updatedAt: "2026-01-03 00:00:00" }] }),
          ];
        case "db_set_chat_unread":
        case "db_mark_workspace_read":
          window.__writes.push([cmd, args]);
          return;
        case "local_storage_get_entry":
          return null;
        case "local_storage_set_entry":
          return { success: true };
        case "chat_messages_load":
          return { messages: [], agentSessionId: null };
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}

test("unread chats load from conductor.db and the row menu writes per-chat unread", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(fakeBackend);
  await page.goto(`${base}/`);
  await row(page, "kyiv").waitFor();
  const unread = async (name) => (await row(page, name).getAttribute("data-unread")) === "true";
  const writes = () => page.evaluate(() => window.__writes.splice(0));
  const wsMenu = page.getByRole("menu", { name: "Workspace actions" });

  assert.deepEqual([await unread("oslo"), await unread("lima"), await unread("rome"), await unread("kyiv")], [false, true, true, false]);
  await shot(page, "5-unread-from-db");

  // "Mark as read" on an unread workspace reads all its chats and the legacy flag.
  await row(page, "rome").click({ button: "right" });
  await wsMenu.getByRole("menuitem", { name: /Mark as read/ }).click();
  assert.equal(await unread("rome"), false);
  assert.deepEqual(await writes(), [["db_mark_workspace_read", { workspaceId: "w3" }]]);

  // "Mark as unread" on a read workspace marks its selected chat (its main chat when it is not open).
  await row(page, "kyiv").click({ button: "right" });
  await wsMenu.getByRole("menuitem", { name: /Mark as unread/ }).click();
  assert.equal(await unread("kyiv"), true);
  assert.deepEqual(await writes(), [["db_set_chat_unread", { chatId: "w4", workspaceId: "w4", unread: true }]]);

  // Opening a workspace shows its main chat, which is read when the window has focus.
  assert.ok(await page.evaluate(() => document.hasFocus()), "the page has focus");
  await row(page, "lima").click();
  await page.waitForFunction(() => window.__writes.length > 0);
  assert.equal(await unread("lima"), false);
  assert.deepEqual(await writes(), [["db_set_chat_unread", { chatId: "w2", workspaceId: "w2", unread: false }]]);
  await page.close();
});
