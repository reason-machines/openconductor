// End-to-end check that a workspace's status follows its pull request: in
// the browser preview the PR demo scenario "ready" is an open PR, so opening
// a workspace derives "In review", and that replaces a status set by hand
// (as Conductor does). Run after `npm run build`:
//
//   node --test tests/e2e/
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

async function checkedStatus(page, row) {
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set status" }).hover();
  const statuses = page.getByRole("menu", { name: "Set status" });
  const checked = await statuses.locator('[role=menuitemradio][aria-checked="true"]').innerText();
  return { statuses, checked: checked.replace("✓", "").trim() };
}

test("opening a workspace with an open PR derives In review and drops the manual status", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => localStorage.setItem("openconductor.pr.demo", "ready"));
  await page.goto(`${base}/?demo=1`);
  await page.locator(ROW, { hasText: "Quiet harbor" }).waitFor();
  // Once its PR is read the row shows the PR title, so keep hold of it by position.
  const names = await page.locator(`${ROW} .sb-ws-name`).allTextContents();
  const harbor = page.locator(ROW).nth(names.findIndex((n) => n.includes("Quiet harbor")));

  // Before the PR is read: the default, then a status set by hand.
  let s = await checkedStatus(page, harbor);
  assert.equal(s.checked, "In progress");
  await s.statuses.getByRole("menuitemradio", { name: "Backlog" }).click();
  s = await checkedStatus(page, harbor);
  assert.equal(s.checked, "Backlog");
  await page.keyboard.press("Escape");

  // Open it: its PR is read, and the status follows the open PR.
  await harbor.click();
  for (let i = 0; i < 20; i++) {
    s = await checkedStatus(page, harbor);
    if (s.checked !== "Backlog") break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  assert.equal(s.checked, "In review");

  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/pr-derived-status.png` });
  }
  await page.close();
});
