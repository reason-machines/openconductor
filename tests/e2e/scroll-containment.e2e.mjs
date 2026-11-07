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
async function open(zoom = 1) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES, zoom });
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

test("settings zoom and resize retain containment and reachable fixed tabs", async () => {
  for (const zoom of [0.8, 1, 1.2]) {
    const page = await open(zoom);
    try {
      assert.equal(await page.evaluate(() => Number(getComputedStyle(document.documentElement).zoom)), zoom);
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        const bounds = await page.locator(".app").boundingBox();
        assert.ok(bounds && Math.abs(bounds.width - viewport.width) < 2 && Math.abs(bounds.height - viewport.height) < 2, "shell fills the viewport without relying on clipping");
        const composer = await page.locator(".composer").boundingBox();
        assert.ok(composer && composer.y >= 0 && composer.y + composer.height <= viewport.height + 1, "composer remains fully visible");
        const before = await positions(page);
        await wheel(page, ".ws-header", -1200);
        await wheel(page, ".rp-tabs", 1200);
        assert.deepEqual(await positions(page), before, `fixed at ${zoom} / ${viewport.width}`);
        const visible = await page.locator(".rp-tab-buttons").evaluate((group) => {
          const owner = group.getBoundingClientRect();
          return [...group.children].every((el) => {
            const b = el.getBoundingClientRect();
            return b.left >= owner.left - 1 && b.right <= owner.right + 1 && b.top >= owner.top - 1 && b.bottom <= owner.bottom + 1;
          });
        });
        assert.equal(visible, true, `all tabs reachable at ${zoom} / ${viewport.width}`);
      }
    } finally { await page.close(); }
  }
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
      await page.evaluate((selector) => {
        window.__scrollDelivery = [];
        const record = (event) => {
          const pane = document.querySelector(selector);
          window.__scrollDelivery.push({
            type: event.type, at: performance.now(), trusted: event.isTrusted,
            target: event.target?.className, deltaY: event.deltaY,
            inPane: pane.contains(event.target), top: pane.scrollTop,
            prevented: event.defaultPrevented,
          });
          if (window.__scrollDelivery.length > 50) window.__scrollDelivery.shift();
        };
        document.addEventListener("wheel", record, { capture: true, passive: true });
        document.addEventListener("scroll", record, { capture: true, passive: true });
        window.__stopScrollDelivery = () => {
          document.removeEventListener("wheel", record, true);
          document.removeEventListener("scroll", record, true);
        };
      }, selector);
      await wheel(page, selector, 600);
      try {
        await page.waitForFunction((s) => document.querySelector(s).scrollTop > 0, selector);
      } catch (cause) {
        const state = await page.locator(selector).first().evaluate((el) => {
          const box = el.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
            bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
            hit: hit?.className, hitInsidePane: !!hit && el.contains(hit),
            overflowY: getComputedStyle(el).overflowY, documentScroll: [scrollX, scrollY],
          };
        });
        const delivery = await page.evaluate(() => ({ events: window.__scrollDelivery, userAgent: navigator.userAgent }));
        throw new Error(`${selector} did not scroll after wheel: ${JSON.stringify(state)}; delivery: ${JSON.stringify(delivery)}; ${cause.message}`, { cause });
      } finally {
        await page.evaluate(() => window.__stopScrollDelivery());
      }
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
    await page.getByRole("button", { name: "New terminal", exact: true }).click();
    await page.locator(".term-body .xterm-scrollable-element").waitFor();
    assert.equal((await policy(page, ".term-body .xterm-scrollable-element")).overscrollY, "contain");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator(".settings-page").waitFor();
    assert.equal((await policy(page, ".settings-page")).overflowY, "auto");
    assert.equal((await policy(page, ".settings-page")).overscrollY, "contain");
    await wheel(page, ".settings-nav-top", -1800);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
  } finally { await page.close(); }
});

test("the settings body scrolls with a real wheel without moving the document", async () => {
  const page = await open();
  try {
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const pane = page.locator(".settings-page");
    await pane.waitFor();
    assert.equal(await pane.evaluate((el) => el.scrollHeight > el.clientHeight), true, "real settings content overflows");
    await pane.evaluate((el) => { el.scrollTop = 0; });
    await wheel(page, ".settings-page", 600);
    await page.waitForFunction(() => document.querySelector(".settings-page").scrollTop > 0);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
    await pane.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await wheel(page, ".settings-page", 1800);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
    await pane.evaluate((el) => { el.scrollTop = 0; });
    await wheel(page, ".settings-page", -1800);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
  } finally { await page.close(); }
});
