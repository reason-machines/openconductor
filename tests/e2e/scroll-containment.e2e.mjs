// Browser coverage of scroll ownership. This does NOT prove native WKWebView
// momentum/rubber-banding; that requires the separate macOS recording pass.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "./right-panel-fixture.mjs";

let server, browser, base;
before(async () => {
  base = process.env.OC_E2E_BASE;
  if (!base) {
    server = await preview({ preview: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    base = server.resolvedUrls.local[0];
  }
  const executablePath = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
  assert.ok(executablePath, "Chrome is required");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});
async function open() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
  await page.goto(base);
  await page.locator(".rp-tabs").waitFor();
  return page;
}
async function policy(page, selector) {
  return page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { overflowX: s.overflowX, overflowY: s.overflowY, overscrollX: s.overscrollBehaviorX, overscrollY: s.overscrollBehaviorY };
  });
}
async function wheel(page, selector, dy) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, selector);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, dy);
  // Wheel delivery is asynchronous; wait two painted frames, not just dispatch.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function positions(page) {
  return page.evaluate(() => ({ x: scrollX, y: scrollY, regions: [...document.querySelectorAll(".sb-header, .sb-footer, .ws-header, .main-tabs, .rp-tabs, .ws-strip-tabs, .composer")].map((el) => {
    const b = el.getBoundingClientRect();
    return [el.className, b.x, b.y, b.width, b.height, el.scrollTop, el.scrollLeft];
  }) }));
}

test("wheel over fixed chrome, headers, tabs, composer and footer leaves them fixed", async () => {
  const page = await open();
  try {
    for (const root of ["html", "body"]) assert.deepEqual(await policy(page, root), { overflowX: "hidden", overflowY: "hidden", overscrollX: "none", overscrollY: "none" });
    const before = await positions(page);
    for (const selector of [".sb-header", ".sb-footer", ".ws-header", ".main-tabs", ".rp-tabs", ".ws-strip-tabs", ".composer"]) {
      await wheel(page, selector, -1200);
      await wheel(page, selector, 1200);
      assert.deepEqual(await positions(page), before, selector);
    }
  } finally { await page.close(); }
});

test("real content panes scroll while their boundary cannot chain to the document", async () => {
  const page = await open();
  try {
    await page.getByRole("tab", { name: "All files", exact: true }).click();
    for (const selector of [".repo-list", ".chat-scroll", ".oc-files"]) {
      assert.equal((await policy(page, selector)).overflowY, "auto", selector);
      assert.equal((await policy(page, selector)).overscrollY, "contain", selector);
      // Deliberately overflow the real pane without invoking a provider or a terminal.
      await page.locator(selector).first().evaluate((el) => {
        const filler = document.createElement("div");
        filler.style.cssText = "height:3000px;min-height:3000px;flex:none";
        filler.dataset.scrollFixture = "";
        el.append(filler);
        el.scrollTop = 0;
      });
      const before = await positions(page);
      await wheel(page, selector, 600);
      await page.waitForFunction((s) => document.querySelector(s).scrollTop > 0, selector);
      assert.deepEqual(await positions(page), before, selector + " content scroll must not move chrome");
      await page.locator(selector).first().evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await wheel(page, selector, 1800);
      assert.deepEqual(await positions(page), before, selector + " bottom boundary");
      await page.locator(selector).first().evaluate((el) => { el.scrollTop = 0; });
      await wheel(page, selector, -1800);
      assert.deepEqual(await positions(page), before, selector + " top boundary");
      await page.locator(selector + " [data-scroll-fixture]").evaluateAll((els) => els.forEach((el) => el.remove()));
    }
    await page.getByRole("tab", { name: /^Changes/ }).click();
    assert.equal((await policy(page, ".oc-changes")).overscrollY, "contain");
  } finally { await page.close(); }
});
