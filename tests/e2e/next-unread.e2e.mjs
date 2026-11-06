// End-to-end check of "Go to next unread" (chat.nextAttention, Cmd+Alt+L) in a
// real browser on the demo state (`?demo=1`): the palette lists it under
// Navigation only while a workspace is unread, Cmd+Alt+L opens the unread
// workspace and clears it, and with nothing unread the key does nothing.
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
  const composer = page.locator(".composer textarea");
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
