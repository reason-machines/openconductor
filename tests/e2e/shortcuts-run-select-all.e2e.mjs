// ⌘R (workspace.toggleRun) and ⌘A (native.preventSelectAll) with real key
// presses on the demo state (`?demo=1`, whose in-browser scripts stand-in has
// two run scripts). Conductor's semantics: renderApp-D_fmY7hW.js, see
// evidence/keybindings/README.md "Bound commands". Run after `npm run build`:
//
//   node --test tests/e2e/shortcuts-run-select-all.e2e.mjs
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

async function openDemo() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem("openconductor.firstRunOnboardingStep", "999"));
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

test("⌘R shows the Run tab and starts the run script, ⌘R again stops it (workspace.toggleRun)", async () => {
  const { context, page, errors } = await openDemo();
  const strip = page.getByRole("region", { name: "Terminal panel" });
  const runTab = strip.getByRole("tab", { name: "Run", exact: true });
  const run = page.getByRole("region", { name: "Run", exact: true });

  // Start from the Setup tab, so ⌘R has to switch to Run.
  await strip.getByRole("tab", { name: "Setup" }).click();
  assert.equal(await runTab.getAttribute("aria-selected"), "false");

  await press(page, "Meta+r");
  await page.waitForFunction(() => document.querySelector('.ws-strip [role="tab"][aria-selected="true"]')?.textContent?.trim() === "Run");
  await strip.getByRole("button", { name: "Stop Dev", exact: true }).waitFor();
  await run.locator(".scripts-output", { hasText: "vite --port 55000" }).waitFor();

  await press(page, "Meta+r");
  await strip.getByRole("button", { name: "Run Dev", exact: true }).waitFor();
  // The stopped run keeps its output, as Conductor's run terminal does.
  await run.locator(".scripts-output", { hasText: "vite --port 55000" }).waitFor();

  // ⌘R also works from the collapsed strip: it opens it on the Run tab.
  await strip.getByRole("button", { name: "Hide terminal panel" }).click();
  await press(page, "Meta+r");
  await strip.getByRole("button", { name: "Hide terminal panel" }).waitFor();
  await strip.getByRole("button", { name: "Stop Dev", exact: true }).waitFor();
  await press(page, "Meta+r");
  await strip.getByRole("button", { name: "Run Dev", exact: true }).waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘A outside a text field is swallowed; in the composer it is left to the field (native.preventSelectAll)", async () => {
  const { context, page, errors } = await openDemo();
  // Runs after the app's own capture listener on document, so it sees its preventDefault.
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener("keydown", (e) => window.__keys.push({ key: e.key, meta: e.metaKey, prevented: e.defaultPrevented }), true);
  });
  const last = () => page.evaluate(() => window.__keys.at(-1));

  await press(page, "Meta+a");
  assert.deepEqual(await last(), { key: "a", meta: true, prevented: true });

  const composer = page.locator(".chat textarea").first();
  await composer.fill("hello world");
  await composer.focus();
  await page.keyboard.press("Meta+a");
  assert.deepEqual(await last(), { key: "a", meta: true, prevented: false });

  // A plain "a" is typing, not the shortcut.
  await press(page, "a");
  assert.deepEqual(await last(), { key: "a", meta: false, prevented: false });

  assert.deepEqual(errors, []);
  await context.close();
});
