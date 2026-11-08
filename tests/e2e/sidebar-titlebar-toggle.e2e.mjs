import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "./right-panel-fixture.mjs";

const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path) => path && existsSync(path));
let server;
let browser;
let base = process.env.OC_TEST_BASE_URL;

before(async () => {
  assert.ok(executablePath, "Chrome is required; set CHROME_PATH");
  if (!base) {
    server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

for (const archived of [false, true]) {
  test(`workspace title-bar toggle keeps its position and reopens the sidebar (${archived ? "archived" : "active"})`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      const shell = structuredClone(SHELL);
      if (archived) shell.repos[0].workspaces[0].status = "archived";
      await page.addInitScript(fakeBackend, { shell, files: FILES });
      await page.goto(base);
      await page.locator(".ws-header").waitFor();
      const toggle = page.getByRole("button", { name: "Toggle left sidebar", exact: true });
      await toggle.waitFor();
      assert.equal(await toggle.count(), 1);
      const expanded = await toggle.boundingBox();
      assert.equal(expanded.x, 86, "toggle clears native traffic lights by the reference inset");
      assert.equal(expanded.y, 12);
      if (process.env.OC_TOGGLE_SCREENSHOT_DIR && !archived) await page.screenshot({ path: `${process.env.OC_TOGGLE_SCREENSHOT_DIR}/toggle-expanded.png` });
      await page.keyboard.press("Meta+b");
      await page.locator(".app.sidebar-hidden").waitFor();
      assert.equal(await toggle.count(), 1, "a visible toggle must survive collapse");
      assert.ok(await toggle.isVisible());
      const collapsed = await toggle.boundingBox();
      assert.equal(collapsed.x, expanded.x);
      assert.equal(collapsed.y, expanded.y);
      if (process.env.OC_TOGGLE_SCREENSHOT_DIR && !archived) await page.screenshot({ path: `${process.env.OC_TOGGLE_SCREENSHOT_DIR}/toggle-collapsed.png` });
      const title = await page.locator(".ws-title").boundingBox();
      assert.ok(title.x >= collapsed.x + collapsed.width + 12, "repository breadcrumb follows the toggle without overlap");
      await toggle.click();
      await page.locator(".sidebar").waitFor();
      assert.equal(await toggle.count(), 1);
      await toggle.click();
      await page.locator(".app.sidebar-hidden").waitFor();
      await page.keyboard.press("Meta+b");
      await page.locator(".sidebar").waitFor();
    } finally {
      await context.close();
    }
  });
}
