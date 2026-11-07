// ⌥⌘C (chat.copyTextConcise) and ⌥⌘↩ (chat.forkToNewTab) with real key
// presses on the demo state (`?demo=1`, whose stand-in agent answers each
// message). Conductor binds both on the active chat tab at priority 100
// (renderApp-D_fmY7hW.js ~7,376,706; evidence/keybindings/README.md). Run
// after `npm run build`:
//
//   node --test tests/e2e/shortcuts-chat-copy-fork.e2e.mjs
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

/** The demo workspace; `forkSetting` turns on Experimental › "Fork chat to new tab" (preview settings live in localStorage). */
async function openDemo({ forkSetting = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  await context.addInitScript((fork) => {
    localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
    if (fork) localStorage.setItem("openconductor.settings.preview", JSON.stringify({ experimental: { experimental_fork_to_new_tab: true } }));
  }, forkSetting);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`${base}/?demo=1`);
  await page.locator(".ws-strip").waitFor();
  return { context, page, errors };
}

/** Send `text` from the composer and wait for the stand-in agent's answer. */
async function send(page, text) {
  const composer = page.locator(".chat [contenteditable=true]").first();
  await composer.fill(text);
  await composer.press("Enter");
  await page.locator(".chat-scroll", { hasText: `“${text}” was not sent` }).waitFor();
}

/** Press `key` with nothing focused, as after clicking empty space. */
async function press(page, key) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press(key);
}

const toasts = (page) => page.locator(".toast").allInnerTexts();
const tabs = (page) => page.getByRole("tablist", { name: "Workspace tabs" });

test("⌥⌘C copies the chat on screen as the concise transcript (chat.copyTextConcise)", async () => {
  const { context, page, errors } = await openDemo();

  // With the All changes tab on screen no chat is shown, so the key passes on.
  await press(page, "Meta+Shift+d");
  await tabs(page).getByRole("tab", { name: /All changes/ }).waitFor();
  await press(page, "Meta+Alt+KeyC");
  await page.waitForTimeout(200);
  assert.deepEqual(await toasts(page), []);

  // An empty chat: Conductor's warning.
  await tabs(page).getByRole("tab", { name: "amber-falcon" }).click();
  await press(page, "Meta+Alt+KeyC");
  await page.locator(".toast", { hasText: "No chat content to copy" }).waitFor();

  // After a turn, from inside the composer too: the transcript goes to the clipboard.
  await send(page, "Explain the router");
  await page.locator(".chat [contenteditable=true]").first().focus();
  await page.keyboard.press("Meta+Alt+KeyC");
  await page.locator(".toast", { hasText: 'Copied concise transcript of "amber-falcon"' }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^## User\n\nExplain the router\n\n## Assistant\n\nBrowser preview: /);

  assert.deepEqual(errors, []);
  await context.close();
});

test("⌥⌘↩ forks the whole chat to a new tab, only with the experimental setting on (chat.forkToNewTab)", async () => {
  // Setting off (Conductor's default): nothing happens.
  {
    const { context, page, errors } = await openDemo();
    await send(page, "Explain the router");
    await press(page, "Meta+Alt+Enter");
    await page.waitForTimeout(300);
    assert.equal(await tabs(page).getByRole("tab", { name: /^Fork of/ }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Setting on: a "Fork of" tab opens with the transcript attached to its composer, unsent.
  const { context, page, errors } = await openDemo({ forkSetting: true });
  await send(page, "Explain the router");
  await send(page, "Now add a test");
  await press(page, "Meta+Alt+Enter");
  const fork = tabs(page).getByRole("tab", { name: "Fork of amber-falcon" });
  await fork.waitFor();
  assert.equal(await fork.getAttribute("aria-selected"), "true");
  await page.locator(".chat").getByText("Transcript of amber-falcon.md").waitFor();
  assert.equal(await page.locator(".chat-scroll", { hasText: "Now add a test" }).count(), 0, "the fork starts empty; nothing is sent");

  assert.deepEqual(errors, []);
  await context.close();
});
