// End-to-end check of Quit (quitApplication, ⌘Q) with real key presses in a
// real browser. The native app menu's Quit item sends the same request
// (`quit_requested`, src-tauri/src/app_quit.rs); outside the desktop app,
// quitting fires `openconductor:quit` on window instead (src/backend.ts).
// Run after `npm run build`:
//
//   node --test tests/e2e/
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

async function openApp(path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
    window.__quits = 0;
    window.addEventListener("openconductor:quit", () => window.__quits++);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base + path);
  await page.waitForSelector(".app");
  return { page, context, errors };
}

const quits = (page) => page.evaluate(() => window.__quits);
const quitDialog = (page) => page.getByRole("dialog", { name: "Quit OpenConductor?", exact: true });

test("⌘Q quits at once while no agent is running", async () => {
  const { page, context, errors } = await openApp("/");
  await page.keyboard.press("Meta+q");
  await page.waitForFunction(() => window.__quits === 1);
  assert.equal(await quitDialog(page).count(), 0, "no confirm without running agents");
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘Q asks first while agents run: Cancel keeps the app, ⌘↵ quits", async () => {
  // The demo state has workspaces whose agents are working.
  const { page, context, errors } = await openApp("/?demo=1");
  await page.keyboard.press("Meta+q");
  const dialog = quitDialog(page);
  await dialog.waitFor();
  assert.match(await dialog.locator("p").innerText(), /^[1-9]\d* agents? (is|are) currently running and will be stopped\.$/);
  assert.equal(await quits(page), 0, "nothing quits before the user confirms");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await quits(page), 0);

  // dialog.primaryAction (⌘↵) confirms, like the Quit button.
  await page.keyboard.press("Meta+q");
  await dialog.waitFor();
  assert.ok(await dialog.getByRole("button", { name: /^Quit/ }).isVisible());
  await page.keyboard.press("Meta+Enter");
  await page.waitForFunction(() => window.__quits === 1);
  await dialog.waitFor({ state: "detached" });

  assert.deepEqual(errors, []);
  await context.close();
});

test("Quit confirmation initially focuses Cancel rather than the destructive action", async () => {
  const { page, context, errors } = await openApp("/?demo=1");
  try {
    await page.keyboard.press("Meta+q");
    const dialog = quitDialog(page);
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("button", { name: "Cancel", exact: true }).evaluate((button) => document.activeElement === button),
      true,
      "the reference Cancel action receives initial focus",
    );
    assert.equal(await quits(page), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("plain Enter cancels the newly opened Quit confirmation without quitting", async () => {
  const { page, context, errors } = await openApp("/?demo=1");
  try {
    await page.keyboard.press("Meta+q");
    const dialog = quitDialog(page);
    await dialog.waitFor();
    await page.keyboard.press("Enter");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await quits(page), 0, "plain Enter activates Cancel, not Quit");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
