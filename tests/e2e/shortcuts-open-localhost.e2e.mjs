// ⌘⇧B (terminal.openLocalhost) and the Run tab's Open button with real key
// presses on the demo state (`?demo=1`, whose in-browser run script prints
// "Local: http://localhost:55000/"). Conductor's semantics: renderApp-D_fmY7hW.js,
// see evidence/keybindings/README.md "terminal.openLocalhost". Outside Tauri the
// app opens URLs with window.open, which the test records instead of loading.
// Run after `npm run build`:
//
//   node --test tests/e2e/shortcuts-open-localhost.e2e.mjs
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
let base = process.env.E2E_BASE;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  if (!base) {
    server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function openDemo() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`${base}/?demo=1`);
  await page.locator(".ws-strip").waitFor();
  return { context, page, errors };
}

/** Press `key` with nothing focused, as after clicking empty space. */
async function press(page, key) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press(key);
}

const opened = (page) => page.evaluate(() => window.__opened.slice());

test("⌘⇧B opens the run's localhost URL from the Run tab; it does nothing before the URL exists or on another tab (terminal.openLocalhost)", async () => {
  const { context, page, errors } = await openDemo();
  const strip = page.getByRole("region", { name: "Terminal panel" });
  const run = page.getByRole("region", { name: "Run", exact: true });
  await strip.getByRole("tab", { name: "Run", exact: true }).click();

  // No run yet: no Open button, and the key passes through.
  await press(page, "Meta+Shift+b");
  await page.waitForTimeout(300);
  assert.deepEqual(await opened(page), []);
  assert.equal(await strip.getByTestId("preview-open").count(), 0);

  // Start the dev script; once its output prints the URL, the Open button appears.
  await strip.getByRole("button", { name: "Run Dev", exact: true }).click();
  await run.getByRole("region", { name: "Script output", exact: true }).locator(".xterm-rows", { hasText: "http://localhost:55000/" }).waitFor();
  const open = strip.getByRole("button", { name: "Open http://localhost:55000/" });
  await open.waitFor();

  await press(page, "Meta+Shift+b");
  await page.waitForFunction(() => window.__opened.length === 1);
  assert.deepEqual(await opened(page), ["http://localhost:55000/"]);

  // Clicking the button opens the same URL.
  await open.click();
  assert.deepEqual(await opened(page), ["http://localhost:55000/", "http://localhost:55000/"]);

  // On the Setup tab the run panel handler passes the key on, as Conductor's does off the Run tab.
  await strip.getByRole("tab", { name: "Setup" }).click();
  await press(page, "Meta+Shift+b");
  await page.waitForTimeout(300);
  assert.equal((await opened(page)).length, 2);

  // Back on Run, stopping the script hides the button and ⌘⇧B does nothing again.
  await strip.getByRole("tab", { name: "Run", exact: true }).click();
  await strip.getByRole("button", { name: "Stop Dev", exact: true }).click();
  await strip.getByRole("button", { name: "Run Dev", exact: true }).waitFor();
  assert.equal(await strip.getByTestId("preview-open").count(), 0);
  await press(page, "Meta+Shift+b");
  await page.waitForTimeout(300);
  assert.equal((await opened(page)).length, 2);

  assert.deepEqual(errors, []);
  await context.close();
});

test("the Open button shows the port and its tooltip names the URL and ⌘⇧B", async () => {
  const { context, page, errors } = await openDemo();
  const strip = page.getByRole("region", { name: "Terminal panel" });
  const run = page.getByRole("region", { name: "Run", exact: true });
  await strip.getByRole("tab", { name: "Run", exact: true }).click();
  await strip.getByRole("button", { name: "Run Dev", exact: true }).click();
  const open = strip.getByRole("button", { name: "Open http://localhost:55000/" });
  await open.waitFor();
  await open.hover();
  const tip = page.locator('[data-slot="tooltip-content"]', { hasText: "Open http://localhost:55000/" });
  await tip.waitFor();
  assert.match((await tip.textContent()) ?? "", /⌘⇧B|⇧⌘B/);
  assert.deepEqual(errors, []);
  await context.close();
});
