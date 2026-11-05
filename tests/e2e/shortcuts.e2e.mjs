// End-to-end check of the keyboard shortcuts in a real browser.
//
// Serves the production build (dist/) with `vite preview` and drives it with
// real key presses through playwright-core and the machine's own Chrome or
// Chromium, so no browser is downloaded. Run after `npm run build`:
//
//   node --test tests/e2e/
//
// CHROME_PATH points at the browser when it is not in a standard place.
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

async function openApp(path = "/") {
  const context = await browser.newContext();
  // Past the first-run onboarding (tests/e2e/first-run.e2e.mjs covers it).
  await context.addInitScript(() => localStorage.setItem("openconductor.firstRunOnboardingStep", "999"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base + path);
  await page.waitForSelector(".app, .settings-nav");
  return { page, context, errors };
}

const dialog = (page, name) => page.getByRole("dialog", { name, exact: true });

test("app-shell shortcuts: sidebar, help dialog, palette gating and New workspace", async () => {
  const { page, context, errors } = await openApp();
  const sidebar = page.getByRole("complementary", { name: "Repositories and workspaces" });

  // ⌘B hides the left sidebar and [ brings it back.
  await assert.doesNotReject(sidebar.waitFor());
  await page.keyboard.press("Meta+b");
  await sidebar.waitFor({ state: "detached" });
  assert.ok(await page.locator(".app.sidebar-hidden").isVisible());
  await page.keyboard.press("[");
  await sidebar.waitFor();

  // ⌥⌘/ toggles the help dialog, also from inside its own search field.
  await page.keyboard.press("Meta+Alt+Slash");
  const help = dialog(page, "Keyboard shortcuts");
  await help.waitFor();
  assert.ok(await help.getByText("Command palette").first().isVisible());
  await page.keyboard.press("Meta+Alt+Slash");
  await help.waitFor({ state: "detached" });

  // ⌘K opens the palette; while it is open ⌘N is blocked (dialog gating).
  await page.keyboard.press("Meta+k");
  const palette = dialog(page, "Command palette");
  await palette.waitFor();
  await page.keyboard.press("Meta+n");
  await page.waitForTimeout(150);
  assert.equal(await dialog(page, "New workspace").count(), 0, "⌘N must not fire while the palette is open");

  // Escape closes the palette, then ⌘N opens New workspace.
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  await page.keyboard.press("Meta+n");
  await dialog(page, "New workspace").waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});

test("key-bindings page: record, conflict, persist across reload, reset", async () => {
  const { page, context, errors } = await openApp("/settings/user/key-bindings");
  const row = page.locator('.kb-row[data-command-id="openKeyboardShortcuts"]');
  const recorder = row.locator("button.kb-recorder");
  await recorder.waitFor();
  await assert.doesNotReject(page.waitForFunction(() => !document.querySelector('.kb-row[data-command-id="openKeyboardShortcuts"] button.kb-recorder')?.hasAttribute("disabled")));

  // A shortcut another command owns is refused and does not run that command.
  await recorder.click();
  await page.keyboard.press("Meta+k");
  await row.getByRole("alert").filter({ hasText: "Already used by Command palette. Type another shortcut." }).waitFor();
  assert.equal(await dialog(page, "Command palette").count(), 0, "recording must swallow ⌘K");

  // Escape cancels; a free shortcut saves and shows Reset.
  await page.keyboard.press("Escape");
  await recorder.click();
  await page.keyboard.press("Control+Shift+h");
  await row.getByRole("button", { name: "Reset" }).waitFor();

  // The override survives a reload and replaces the default in the app shell.
  await page.goto(base + "/");
  await page.waitForSelector(".app");
  await page.keyboard.press("Meta+Alt+Slash");
  await page.waitForTimeout(150);
  assert.equal(await dialog(page, "Keyboard shortcuts").count(), 0, "the default ⌥⌘/ must be replaced");
  await page.keyboard.press("Control+Shift+h");
  await dialog(page, "Keyboard shortcuts").waitFor();
  await page.keyboard.press("Escape");

  // Reset brings the default back.
  await page.goto(base + "/settings/user/key-bindings");
  await row.getByRole("button", { name: "Reset" }).click();
  await row.getByRole("button", { name: "Reset" }).waitFor({ state: "detached" });
  await page.goto(base + "/");
  await page.waitForSelector(".app");
  await page.keyboard.press("Meta+Alt+Slash");
  await dialog(page, "Keyboard shortcuts").waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});
