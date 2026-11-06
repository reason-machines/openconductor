// ⌘W (nav.closeTab / terminal.closeTab) and ⌘⇧T (nav.reopenTab) with real key
// presses, as Conductor binds them (src/features/chat/closedTabs.ts):
// ⌘W closes only the tab on screen (a chat tab, All changes, the PR tab), or
// the terminal tab when the terminal has focus, and never the workspace's own
// chat; ⌘⇧T brings closed tabs back newest first. The window itself is not the
// webview's to close: src-tauri/src/menu.rs drops Tauri's ⌘W Close Window item.
// Run after `npm run build`:
//
//   node --test tests/e2e/close-tab.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "./right-panel-fixture.mjs";
import { showTerminalPanel } from "./terminal-panel.mjs";

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

async function open() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
  await page.goto(base + "/");
  await page.locator(".main-tabs").waitFor();
  return { context, page, errors };
}

const strip = (page) => page.locator(".main-tabs [role=tab]");
const tabNames = (page) => strip(page).allInnerTexts();
const activeTab = (page) => page.locator(".main-tabs [role=tab][aria-selected=true]").innerText();

/** Wait until the main tab strip reads `names` with `active` selected. */
async function expectTabs(page, names, active) {
  await page.waitForFunction(
    ([want, sel]) => {
      const tabs = [...document.querySelectorAll(".main-tabs [role=tab]")];
      return JSON.stringify(tabs.map((t) => t.textContent.trim())) === JSON.stringify(want) && tabs.find((t) => t.getAttribute("aria-selected") === "true")?.textContent.trim() === sel;
    },
    [names, active],
    { timeout: 3000 },
  ).catch(() => undefined);
  assert.deepEqual(await tabNames(page), names);
  assert.equal(await activeTab(page), active);
}

/** Focus nothing in particular, as a user clicking the empty tab strip does. */
const blur = (page) => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

test("⌘W closes only the chat tab on screen, never the workspace's own chat; ⌘⇧T reopens it", async () => {
  const { context, page, errors } = await open();
  await expectTabs(page, ["lisbon"], "lisbon");

  // ⌘T twice: two Untitled chats, the second one shown.
  await blur(page);
  await page.keyboard.press("Meta+t");
  await expectTabs(page, ["lisbon", "Untitled"], "Untitled");
  await blur(page);
  await page.keyboard.press("Meta+t");
  await expectTabs(page, ["lisbon", "Untitled", "Untitled"], "Untitled");
  assert.equal(await strip(page).nth(2).getAttribute("aria-selected"), "true");

  // ⌘W, also from inside the chat's composer, closes the shown chat and shows the one viewed before it.
  const composer = page.locator(".composer [contenteditable=true]").first();
  if (await composer.count()) await composer.focus();
  await page.keyboard.press("Meta+w");
  await expectTabs(page, ["lisbon", "Untitled"], "Untitled");
  await page.keyboard.press("Meta+w");
  await expectTabs(page, ["lisbon"], "lisbon");

  // On the workspace's own chat ⌘W does nothing: the page and its tab stay.
  await page.keyboard.press("Meta+w");
  await page.waitForTimeout(150);
  await expectTabs(page, ["lisbon"], "lisbon");

  // ⌘⇧T brings both back, newest closed first, each shown as it opens.
  await blur(page);
  await page.keyboard.press("Meta+Shift+t");
  await expectTabs(page, ["lisbon", "Untitled"], "Untitled");
  await page.keyboard.press("Meta+Shift+t");
  await expectTabs(page, ["lisbon", "Untitled", "Untitled"], "Untitled");
  // Nothing left to reopen: nothing changes.
  await page.keyboard.press("Meta+Shift+t");
  await page.waitForTimeout(150);
  await expectTabs(page, ["lisbon", "Untitled", "Untitled"], "Untitled");

  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘W closes the All changes tab, and ⌘⇧T opens it again", async () => {
  const { context, page, errors } = await open();
  // ⌘⇧D opens All changes (diff.open).
  await page.locator(".rp-tabs .tab-count").waitFor();
  await blur(page);
  await page.keyboard.press("Meta+Shift+d");
  await expectTabs(page, ["All changes", "lisbon"], "All changes");
  await page.keyboard.press("Meta+w");
  await expectTabs(page, ["lisbon"], "lisbon");
  await page.keyboard.press("Meta+Shift+t");
  await expectTabs(page, ["All changes", "lisbon"], "All changes");
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘W inside the terminal closes the terminal tab, not the chat tab", async () => {
  const { context, page, errors } = await open();
  await blur(page);
  await page.keyboard.press("Meta+t");
  await expectTabs(page, ["lisbon", "Untitled"], "Untitled");

  await showTerminalPanel(page);
  const termTabs = page.locator(".ws-strip .ws-strip-tabs [role=tab]");
  await page.waitForFunction(() => [...document.querySelectorAll(".ws-strip .ws-strip-tabs [role=tab]")].some((t) => t.textContent.includes("Terminal 1")));
  await page.locator(".terminal-panel .xterm-helper-textarea").first().focus();
  await page.keyboard.press("Meta+w");
  await page.waitForFunction(() => ![...document.querySelectorAll(".ws-strip .ws-strip-tabs [role=tab]")].some((t) => t.textContent.includes("Terminal 1")), null, { timeout: 3000 });
  assert.ok(!(await termTabs.allInnerTexts()).some((t) => t.includes("Terminal 1")), "the terminal tab is closed");
  // The chat tab is untouched.
  await expectTabs(page, ["lisbon", "Untitled"], "Untitled");
  assert.deepEqual(errors, []);
  await context.close();
});
