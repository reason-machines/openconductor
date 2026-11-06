// End-to-end check of parity.sidebar.archived-view in a real browser on the
// demo state (`?demo=1`, no backend: src/workspace/archive.ts keeps archived
// rows in memory): archive from the row menu, "View archived workspaces" in
// the palette, the "Archived workspaces" filter, opening an archived
// workspace (banner, Unarchive in place of Archive, "Workspace archived"
// placeholder), and Unarchive from the banner and from the palette row.
// Run after `npm run build`:
//
//   node --test tests/e2e/
//
// With SCREENSHOT_DIR set, it saves the archived list and the archived view there.
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

async function archiveFromMenu(page, label) {
  const r = row(page, label);
  await r.click({ button: "right" });
  await page.getByRole("menu", { name: "Workspace actions" }).getByRole("menuitem", { name: /Archive/ }).click();
  await r.waitFor({ state: "detached" });
}

async function openArchivedList(page) {
  await page.getByRole("button", { name: "Search" }).first().click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.locator(".palette-input").fill("archived");
  await palette.getByRole("option", { name: /View archived workspaces/ }).click();
  return palette;
}

test("archived workspaces are listed in the palette, open read-only and can be unarchived", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  await archiveFromMenu(page, "Quiet harbor");
  await archiveFromMenu(page, "Copper wren");

  // "View archived workspaces" switches to the Workspaces tab showing all.
  let palette = await openArchivedList(page);
  assert.equal(await palette.getByRole("tab", { selected: true }).textContent(), "Workspaces");
  const filter = palette.getByLabel("Archived workspaces");
  assert.equal(await filter.inputValue(), "all");
  assert.deepEqual(await filter.locator("option").allTextContents(), ["Hiding archived", "Showing all", "Only archived"]);
  const titles = () => palette.locator(".palette-item .palette-title").allTextContents();
  const archivedTitles = () => palette.locator(".palette-item[data-archived] .palette-title").allTextContents();
  assert.deepEqual(await archivedTitles(), ["copper-wren", "quiet-harbor"], "newest archived first");
  assert.ok((await titles()).includes("amber-falcon"), "Showing all keeps active workspaces");
  await filter.selectOption("archived");
  assert.deepEqual(await titles(), ["copper-wren", "quiet-harbor"]);
  await shot(page, "archived-workspaces-palette.png");
  await filter.selectOption("active");
  assert.deepEqual(await archivedTitles(), []);
  await filter.selectOption("archived");

  // Opening an archived workspace: read-only, with the banner and Unarchive.
  await palette.locator(".palette-item", { hasText: "quiet-harbor" }).click();
  assert.equal(await palette.count(), 0);
  const view = page.locator(".archived-workspace");
  await view.waitFor();
  assert.equal(await view.locator(".archived-banner-text").textContent(), " This workspace is archived.");
  assert.deepEqual((await view.locator(".ws-actions").getByRole("button").allTextContents()).map((t) => t.trim()), ["Unarchive"]);
  assert.equal(await view.getByRole("heading", { name: "Workspace archived" }).count(), 1);
  assert.equal(await view.locator(".composer").count(), 0, "no composer on an archived workspace");
  assert.equal(await row(page, "Quiet harbor").count(), 0, "the sidebar does not list it");
  await shot(page, "archived-workspace-view.png");

  // Unarchive from the banner: back in the sidebar, open, live.
  await view.locator(".archived-banner").getByRole("button", { name: "Unarchive" }).click();
  await row(page, "Quiet harbor").waitFor();
  assert.equal(await page.locator(".archived-workspace").count(), 0);
  assert.equal(await row(page, "Quiet harbor").getAttribute("aria-current"), "page");

  // Unarchive from the palette row's button.
  palette = await openArchivedList(page);
  await palette.getByLabel("Archived workspaces").selectOption("archived");
  assert.deepEqual(await palette.locator(".palette-item[data-archived] .palette-title").allTextContents(), ["copper-wren"]);
  const wren = palette.locator(".palette-item", { hasText: "copper-wren" });
  await wren.hover();
  await wren.getByRole("button", { name: "Unarchive workspace" }).click();
  assert.equal(await palette.count(), 0);
  await row(page, "Copper wren").waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});

// Conductor's Home list (`UJo`) runs the same archive filter over active and
// archived workspaces; archived ones are not in the sidebar state, so Home
// reads them from the archive (listArchivedWorkspaces).
test("Home's All workspaces lists archived workspaces under Only archived and Showing all", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  await archiveFromMenu(page, "Quiet harbor");

  await page.locator(".sb-row", { hasText: "Home" }).first().click();
  const list = page.getByRole("listbox", { name: "Workspaces" });
  await list.waitFor();
  const names = () => list.locator(".allws-row .allws-name").allTextContents();
  const archivedNames = () => list.locator(".allws-row", { has: page.locator(".allws-archived") }).locator(".allws-name").allTextContents();
  const setFilter = async (label) => {
    await page.getByRole("button", { name: "Archived workspaces" }).click();
    await page.getByRole("menuitemcheckbox", { name: label }).click();
  };
  const isHarbor = (n) => /quiet.harbor/i.test(n);

  assert.ok(!(await names()).some(isHarbor), "Hiding archived leaves it out");

  await setFilter("Only archived");
  await list.locator(".allws-row").first().waitFor();
  const only = await names();
  assert.ok(only.length > 0 && only.every(isHarbor), `Only archived lists the archived workspace, got ${JSON.stringify(only)}`);
  assert.deepEqual(await archivedNames(), only, "every row carries the archived mark");
  await shot(page, "home-only-archived.png");

  await setFilter("Showing all");
  const all = await names();
  assert.ok(all.some(isHarbor) && all.some((n) => !isHarbor(n)), `Showing all lists active and archived, got ${JSON.stringify(all)}`);

  // An archived row opens the read-only archived view.
  await setFilter("Only archived");
  await list.locator(".allws-row").first().click();
  await page.locator(".archived-workspace").waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});
