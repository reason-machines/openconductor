// End-to-end check of archive and the archived list in a real browser on the
// demo state (`?demo=1`, no backend: archive.ts keeps archived rows in memory):
// the running-agents confirmation, archive from the row menu, "View archived
// workspaces" in the palette, the "Archived workspaces" filter and Unarchive.
// Run after `npm run build`:
//
//   node --test tests/e2e/
//
// With SCREENSHOT_DIR set, it saves the dialog and the archived list there.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
const shots = process.env.SCREENSHOT_DIR;

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  if (shots) mkdirSync(shots, { recursive: true });
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

const ROW = '[data-testid="left-sidebar-workspace-item"]';
const row = (page, label) => page.locator(ROW, { has: page.locator(".sb-ws-name", { hasText: label }) });
const shot = async (page, name) => shots && (await page.screenshot({ path: join(shots, name) }));

test("archive asks only while the agent runs; archived workspaces are listed in the palette and can be unarchived", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?demo=1`);
  const harbor = row(page, "Quiet harbor");
  await harbor.waitFor();

  // A running turn (the browser stand-in agent works for 2.5 s): Archive asks first.
  await harbor.click();
  await page.locator(".composer textarea").fill("Refactor the login form");
  await page.locator(".composer textarea").press("Enter");
  await page.getByTitle("Archive workspace").click();
  const dialog = page.getByRole("dialog", { name: "Archive workspace?" });
  await dialog.waitFor();
  assert.equal(await dialog.locator("p").textContent(), "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.");
  assert.deepEqual(await dialog.locator(".modal-actions button").allTextContents(), ["Cancel", "Stop agents and archive ⌘↵"]);
  await shot(page, "archive-confirm-dialog.png");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal(await harbor.count(), 1, "Cancel keeps the workspace");

  // Confirming stops the agent and archives.
  await page.getByTitle("Archive workspace").click();
  if ((await dialog.count()) > 0) await dialog.getByRole("button", { name: /Stop agents and archive/ }).click();
  await harbor.waitFor({ state: "detached" });

  // No agent running: the row menu's Archive archives straight away.
  const reef = row(page, "Lunar reef");
  await reef.click({ button: "right" });
  await page.getByRole("menu", { name: "Workspace actions" }).getByRole("menuitem", { name: /Archive/ }).click();
  assert.equal(await page.getByRole("dialog", { name: "Archive workspace?" }).count(), 0);
  await reef.waitFor({ state: "detached" });

  // Palette: View archived workspaces switches to the Workspaces tab showing all.
  await page.getByRole("button", { name: "Search" }).first().click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.locator(".palette-input").fill("archived");
  await palette.getByRole("option", { name: /View archived workspaces/ }).click();
  assert.equal(await palette.getByRole("tab", { selected: true }).textContent(), "Workspaces");
  const filter = palette.getByLabel("Archived workspaces");
  assert.equal(await filter.inputValue(), "all");
  assert.deepEqual(await filter.locator("option").allTextContents(), ["Hiding archived", "Showing all", "Only archived"]);
  const titles = () => palette.locator(".palette-item .palette-title").allTextContents();
  const archivedTitles = () => palette.locator('.palette-item[data-archived] .palette-title').allTextContents();
  assert.deepEqual(await archivedTitles(), ["lunar-reef", "quiet-harbor"], "newest archived first");
  assert.ok((await titles()).includes("amber-falcon"), "Showing all keeps active workspaces");
  await filter.selectOption("archived");
  assert.deepEqual(await titles(), ["lunar-reef", "quiet-harbor"]);
  await shot(page, "archived-workspaces-palette.png");
  await filter.selectOption("active");
  assert.deepEqual(await archivedTitles(), []);
  await filter.selectOption("archived");

  // Unarchive puts it back in the sidebar and opens it.
  const lunar = palette.locator(".palette-item", { hasText: "lunar-reef" });
  await lunar.hover();
  await lunar.getByRole("button", { name: "Unarchive workspace" }).click();
  assert.equal(await palette.count(), 0);
  await reef.waitFor();
  assert.equal(await reef.getAttribute("aria-current"), "page");
  await shot(page, "unarchived-back-in-sidebar.png");

  assert.deepEqual(errors, []);
  await page.close();
});
