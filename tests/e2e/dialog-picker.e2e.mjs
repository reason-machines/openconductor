import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startViteFixture } from "./vite-fixture-server.mjs";

let base = process.env.DIALOGS_URL;
let browser;
let server;
before(async () => {
  if (!base) {
    server = await startViteFixture();
    base = server.base;
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
});
after(async () => {
  try { await browser?.close(); } finally { await server?.close(); }
});

for (const [dialog, title] of [["create", "Choose where to create the project"], ["clone", "Choose where to clone the repository"]]) {
  for (const mode of ["initial", "cancel", "select"]) {
    test(`${dialog}: Browse uses ${mode === "initial" ? "the loaded" : "the edited"} folder and ${mode === "select" ? "accepts the selection" : "preserves it on Cancel"}`, async () => {
      const page = await browser.newPage();
      try {
        const result = mode === "select" ? "&pickerResult=%2FUsers%2Fdemo%2Fselected" : "";
        await page.goto(`${base}/tools/dialogs/index.html?dialog=${dialog}&reference=1${result}`);
        const input = page.locator(".field-row input");
        await page.waitForFunction(() => document.querySelector(".field-row input")?.value === "/Users/demo/conductor/repos");
        const expected = mode === "initial" ? "/Users/demo/conductor/repos" : "/Users/demo/Code/with spaces";
        if (mode !== "initial") await input.fill(expected);
        await page.getByRole("button", { name: "Browse", exact: true }).click();
        await page.waitForFunction(() => document.documentElement.dataset.pickerRequest);
        const request = await page.evaluate(() => JSON.parse(document.documentElement.dataset.pickerRequest));
        assert.deepEqual(request, { directory: true, multiple: false, title, defaultPath: expected });
        assert.equal(await input.inputValue(), mode === "select" ? "/Users/demo/selected" : expected);
        if (process.env.PICKER_SCREENSHOTS) await page.screenshot({ path: `${process.env.PICKER_SCREENSHOTS}/${dialog}-${mode}.png` });
      } finally { await page.close(); }
    });
  }
}
