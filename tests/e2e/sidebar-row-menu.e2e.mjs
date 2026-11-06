// End-to-end check of the sidebar workspace row menu (right-click a row):
// Mark as read / unread, Pin / Unpin and the Pinned group, Set status,
// the R and P keys while the menu is open, and Archive, in a real browser
// on the demo state (`?demo=1`). Run after `npm run build`:
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

const ROW = '[data-testid="left-sidebar-workspace-item"]';
const row = (page, label) => page.locator(ROW, { has: page.locator(".sb-ws-name", { hasText: label }) });
const menu = (page) => page.getByRole("menu", { name: "Workspace actions" });
// Item label = the row's text without its shortcut hint (`.cm-shortcut`).
const menuItems = (page) =>
  menu(page)
    .locator(":scope > [role=menuitem]")
    .evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => !(n instanceof Element && n.classList.contains("cm-shortcut"))).map((n) => n.textContent).join("").trim()));

test("row menu: read/unread, pin into the Pinned group, status, keys, archive", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  const harbor = row(page, "Quiet harbor");
  await harbor.waitFor();

  // Conductor's order for a local workspace.
  await harbor.click({ button: "right" });
  assert.deepEqual(await menuItems(page), ["Mark as unread", "Pin", "Set status", "Move to section", "Rename", "Copy link", "Archive"]);
  assert.equal(await harbor.getAttribute("data-menu-open"), "true");
  await page.keyboard.press("Escape");
  // Conductor's 100 ms exit animation runs before the menu unmounts.
  await menu(page).waitFor({ state: "detached" });

  // Pin moves the row into the Pinned group above the repositories.
  await harbor.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Pin" }).click();
  await menu(page).waitFor({ state: "detached" });
  const pinnedGroup = page.locator('.sb-group[data-group="Pinned"]');
  assert.deepEqual(await pinnedGroup.locator(".sb-ws-name").allTextContents(), ["Quiet harbor"]);
  assert.equal(await page.locator(".sb-repo-groups .sb-ws-name", { hasText: "Quiet harbor" }).count(), 0);

  // P while the menu is open unpins; the group goes away.
  await harbor.click({ button: "right" });
  assert.deepEqual((await menuItems(page)).slice(0, 2), ["Mark as unread", "Unpin"]);
  await page.keyboard.press("p");
  await menu(page).waitFor({ state: "detached" });
  assert.equal(await pinnedGroup.count(), 0);
  assert.equal(await page.locator(".sb-repo-groups .sb-ws-name", { hasText: "Quiet harbor" }).count(), 1);

  // R marks unread (semibold row); opening the workspace clears it.
  await harbor.click({ button: "right" });
  await page.keyboard.press("r");
  await menu(page).waitFor({ state: "detached" });
  assert.equal(await harbor.getAttribute("data-unread"), "true");
  await harbor.click({ button: "right" });
  assert.equal((await menuItems(page))[0], "Mark as read");
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });
  await harbor.click();
  assert.equal(await harbor.getAttribute("data-unread"), null);

  // Set status: the default is In progress; choosing one checks it next time.
  await harbor.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Set status" }).hover();
  const statuses = page.getByRole("menu", { name: "Set status" });
  // The submenu opens after Conductor's hover delay.
  await statuses.waitFor();
  assert.deepEqual(await statuses.locator("[role=menuitemradio]").allTextContents(), ["Backlog", "In progress", "In review", "Done", "Canceled"]);
  // The current one carries Conductor's trailing check icon (lucide Check), not a text glyph.
  assert.equal(await statuses.getByRole("menuitemradio", { name: "In progress" }).getAttribute("aria-checked"), "true");
  await statuses.getByRole("menuitemradio", { name: "In review" }).click();
  await menu(page).waitFor({ state: "detached" });
  await harbor.click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Set status" }).hover();
  assert.equal(await statuses.getByRole("menuitemradio", { name: "In review" }).getAttribute("aria-checked"), "true");

  // Archive (selected row shows the ⌘⇧A hint) removes the row.
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });
  await harbor.click({ button: "right" });
  assert.equal(await menu(page).getByRole("menuitem", { name: /Archive/ }).locator(".cm-shortcut").textContent(), "⌘⇧A");
  await menu(page).getByRole("menuitem", { name: /Archive/ }).click();
  assert.equal(await harbor.count(), 0);
  await page.close();
});

test("holding Cmd shows 1..9 on the visible rows, and Cmd+N opens that row", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  const hints = () => page.locator('.sb-ws-hint[data-state="visible"]').allTextContents();
  const names = () => page.locator(`${ROW} .sb-ws-name`).allTextContents();

  await page.keyboard.down("Meta");
  assert.deepEqual(await hints(), [], "hints wait 500 ms");
  await page.waitForTimeout(700);
  const shown = await hints();
  // Only the first nine rows get a number (Cmd+1..9); the demo has more.
  assert.deepEqual(shown, (await names()).slice(0, 9).map((_, i) => String(i + 1)));
  assert.equal(await page.locator(".sb-ws-hint").first().getAttribute("aria-label"), "Switch with Command-1");
  await page.keyboard.press("2");
  await page.keyboard.up("Meta");
  assert.deepEqual(await hints(), []);
  const second = (await names())[1];
  assert.equal(await row(page, second).getAttribute("aria-current"), "page");

  // As in Conductor, pointer events hide them only once the modifier is no longer held.
  await page.keyboard.down("Meta");
  await page.waitForTimeout(700);
  await page.mouse.move(600, 400);
  assert.ok((await hints()).length > 0);
  await page.keyboard.up("Meta");
  assert.deepEqual(await hints(), []);
  await page.close();
});

test("diff stats: muted on unselected rows unless Colored sidebar diffs is on", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  const stats = page.locator(`${ROW}:not([data-active]) [data-testid="workspace-diff-stat"] .add`);
  assert.ok((await stats.count()) > 0, "the demo has unselected rows with changes");
  const colors = () =>
    page.evaluate(() => {
      const add = document.querySelector('[data-testid="left-sidebar-workspace-item"]:not([data-active]) [data-testid="workspace-diff-stat"] .add');
      const muted = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-muted-foreground").trim();
      const probe = document.createElement("span");
      probe.style.color = muted;
      document.body.append(probe);
      const mutedRgb = getComputedStyle(probe).color;
      probe.remove();
      return { add: getComputedStyle(add).color, muted: mutedRgb, text: add.textContent };
    });
  const off = await colors();
  assert.match(off.text, /^\+(\d+|\d+(\.\d)?k|✱✱)$/);
  assert.equal(off.add, off.muted, "default (off): unselected rows use the muted color");

  await page.evaluate(() => {
    const key = "openconductor.settings.preview";
    const s = JSON.parse(localStorage.getItem(key) ?? "{}");
    s.appearance = { ...(s.appearance ?? { zoom_level_v2: 1, low_contrast_dark_mode: false }), colored_sidebar_diffs: true };
    localStorage.setItem(key, JSON.stringify(s));
  });
  await page.reload();
  await row(page, "Quiet harbor").waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.coloredSidebarDiffs === "");
  const on = await colors();
  assert.notEqual(on.add, on.muted, "on: unselected rows keep the green");
  await page.close();
});

test("row status icon follows the agent, then the PR, then the branch", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  await row(page, "Quiet harbor").waitFor();
  const icon = (label) => row(page, label).getByTestId("workspace-status-icon");
  const status = async (label) => [await icon(label).getAttribute("data-status"), await icon(label).getAttribute("aria-label"), await icon(label).getAttribute("data-color")];
  assert.deepEqual(await status("Lunar reef"), ["working", "Working", "muted"]);
  assert.equal(await icon("Lunar reef").locator(".sb-ws-loader").count(), 1);
  assert.deepEqual(await status("Quiet harbor"), ["ready-to-merge", "Ready to merge", "ready"]);
  assert.deepEqual(await status("Copper wren"), ["checks-failing", "Checks failing", "destructive"]);
  assert.deepEqual(await status("Misty larch"), ["merged", "Merged", "merged"]);
  // No PR: "Ready" on a repo with a remote, "Local workspace" without one. Amber falcon is
  // open, and the open workspace reports its agent as idle, over the demo's "working".
  assert.deepEqual(await status("Amber falcon"), ["branch", "Ready", "muted"]);
  assert.deepEqual(await status("Brisk otter"), ["local", "Local workspace", "muted"]);
  const rgb = (label) => icon(label).evaluate((el) => getComputedStyle(el).color);
  assert.notEqual(await rgb("Copper wren"), await rgb("Amber falcon"), "checks failing is coloured");
  assert.match(await row(page, "Copper wren").getAttribute("title"), /Checks failing$/);
  await page.close();
});

test("row status: a workspace's agent keeps showing on its row after you leave it", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?demo=1`);
  const icon = (label) => row(page, label).getByTestId("workspace-status-icon");
  await row(page, "Brisk otter").click();
  assert.equal(await icon("Brisk otter").getAttribute("data-status"), "local");
  // The browser preview's stand-in agent works for 2.5 s per prompt.
  const input = page.locator(".composer textarea, textarea[placeholder]").first();
  await input.fill("look around");
  await input.press("Enter");
  await page.waitForFunction(() => document.querySelector('[aria-label^="Stop the agent"]') !== null);
  await row(page, "Quiet harbor").click();
  // Brisk otter is no longer open, but its chat is still running.
  assert.deepEqual([await icon("Brisk otter").getAttribute("data-status"), await icon("Brisk otter").getAttribute("aria-label")], ["working", "Working"]);
  await page.waitForFunction(
    (sel) => [...document.querySelectorAll(sel)].some((r) => r.textContent.includes("Brisk otter") && r.querySelector('[data-testid="workspace-status-icon"]').dataset.status === "local"),
    '[data-testid="left-sidebar-workspace-item"]',
    { timeout: 10_000 },
  );
  await page.close();
});
