import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright-core";

const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path) => path && existsSync(path));
const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

test("shell fills its viewport after resize at every supported interface zoom", async () => {
  assert.ok(executablePath, "Chrome is required; set CHROME_PATH");
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style><div id="root"><div class="app"><aside class="sidebar"><div class="repo-list"></div><footer class="sb-footer">Footer</footer></aside><main class="main"><div class="workspace">Workspace</div></main></div></div>`);
    for (const shell of ["app", "settings"]) {
      await page.evaluate((shell) => { document.querySelector("#root > div").className = shell; }, shell);
      for (const zoom of [0.5, 0.8, 1, 1.2, 2, 3]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      // Reuse the same document: enlargement must not retain its launch dimensions.
      for (const [width, height] of [[900, 600], [1400, 900], [2100, 1300], [900, 600]]) {
        await page.setViewportSize({ width, height });
        const bounds = await page.evaluate(() => Object.fromEntries(["html", "body", "#root", "#root > div", ".sidebar", ".main"].map((selector) => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])));
        for (const selector of ["html", "body", "#root", "#root > div"]) {
          const rect = bounds[selector];
          assert.ok(Math.abs(rect.width - width) <= 1 && Math.abs(rect.height - height) <= 1 && rect.x === 0 && rect.y === 0, `${selector} at zoom ${zoom}, ${width}x${height}: ${JSON.stringify(rect)}`);
        }
        assert.ok(Math.abs(bounds[".sidebar"].bottom - height) <= 1, "sidebar footer must reach the bottom");
        assert.ok(Math.abs(bounds[".main"].right - width) <= 1, "main must reach the right edge");
        const scroll = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight }));
        assert.ok(scroll.width <= scroll.clientWidth && scroll.height <= scroll.clientHeight, `no outer document scrolling: ${JSON.stringify(scroll)}`);
      }
      }
    }
  } finally {
    await browser.close();
  }
});
