import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let base = process.env.DIALOGS_URL;
let browser;
let server;
before(async () => {
  if (!base) {
    server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    await server.listen();
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await server?.close(); });

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
