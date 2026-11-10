import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((path) => path && existsSync(path));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, "Chrome or Chromium is required; set CHROME_PATH");
  assert.ok(existsSync("dist/index.html"), "Build the app before running this test");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    await new Promise((resolve, reject) => {
      if (!server) return resolve();
      server.httpServer.close((error) => error ? reject(error) : resolve());
      server.httpServer.closeAllConnections();
    });
  }
});

test("composer declares its text-assistance contract on the editable element", { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.addInitScript(() => localStorage.setItem("openconductor.firstRunOnboardingStep", "999"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?demo=1`);
    await page.locator(".ws-strip").waitFor();
    const input = page.locator(".chat [contenteditable=true]").first();
    await input.waitFor();
    const attributes = () => input.evaluate((element) => Object.fromEntries(
      ["autocomplete", "autocorrect", "autocapitalize", "writingsuggestions", "spellcheck"]
        .map((name) => [name, element.getAttribute(name)]),
    ));
    const expected = {
      autocomplete: "new-password",
      autocorrect: "off",
      autocapitalize: "off",
      writingsuggestions: "false",
      spellcheck: "false",
    };
    const initial = await attributes();
    console.log(JSON.stringify({ composerInputAttributes: initial }));
    assert.deepEqual(initial, expected, "The editable element must declare the retained Conductor text-assistance settings");

    await input.focus();
    await page.keyboard.type("const mixedCase = 1;");
    assert.equal(await input.textContent(), "const mixedCase = 1;");
    await input.evaluate((element) => element.blur());
    await input.focus();
    assert.deepEqual(await attributes(), expected, "Typing and refocusing must preserve the input attributes");
    assert.equal(await input.getAttribute("role"), "textbox");
    assert.equal(await input.getAttribute("aria-multiline"), "true");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
