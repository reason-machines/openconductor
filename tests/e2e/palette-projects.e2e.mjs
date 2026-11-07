import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { projectsInit } from "../../tools/palette/projects-fixture.mjs";

let browser;
let server;
let base = process.env.PALETTE_PROJECTS_BASE_URL;
before(async () => {
  if (!base) {
    server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
    base = server.resolvedUrls.local[0];
  }
  const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean).find(existsSync);
  assert.ok(executablePath, "Chrome or Chromium is required");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function freshPage() {
  const page = await browser.newPage();
  await page.addInitScript({ content: projectsInit() });
  await page.goto(base);
  await page.locator(".sidebar").waitFor();
  return page;
}
async function projects(page) {
  await page.locator("body").press("Meta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("tab", { name: "Projects", exact: true }).click();
  await palette.getByRole("combobox").fill("tide");
  await selected(page, "tide-web");
  assert.deepEqual(await palette.locator(".palette-title").allTextContents(), ["tide-web", "tide-api"]);
  return palette;
}
async function selected(page, name) {
  await page.waitForFunction((name) => document.querySelector('.palette-item[aria-selected="true"] .palette-title')?.textContent === name, name);
}

test("Projects navigates and wraps across two filtered rows without activating on arrows or Ctrl+N/P", async () => {
  const page = await freshPage();
  const palette = await projects(page);
  for (const [key, name] of [["ArrowDown", "tide-api"], ["ArrowUp", "tide-web"], ["ArrowUp", "tide-api"], ["ArrowDown", "tide-web"], ["Control+n", "tide-api"], ["Control+p", "tide-web"]]) {
    await palette.getByRole("combobox").press(key);
    await selected(page, name);
    assert.equal(await palette.count(), 1);
    assert.equal(await page.locator(".ws-header").count(), 0);
  }
  await page.close();
});

test("Enter on the second filtered project returns to its last-viewed workspace instead of its first workspace", async () => {
  const page = await freshPage();
  await page.locator("body").press("Meta+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("tab", { name: "Workspaces", exact: true }).click();
  await palette.getByRole("combobox").fill("pagination");
  await palette.getByRole("combobox").press("ArrowDown");
  await palette.getByRole("combobox").press("Enter");
  await palette.waitFor({ state: "detached" });
  assert.equal(await page.locator(".ws-header .ws-title strong").textContent(), "accra");
  await projects(page);
  await palette.getByRole("combobox").press("ArrowDown");
  await selected(page, "tide-api");
  await palette.getByRole("combobox").press("Enter");
  await palette.waitFor({ state: "detached" });
  assert.equal(await page.locator(".ws-header .ws-title strong").textContent(), "accra");
  assert.equal(await page.locator('.sb-ws[data-active="true"]').getAttribute("title"), "accra · ada/pagination-cursor · Local workspace");
  await page.close();
});
