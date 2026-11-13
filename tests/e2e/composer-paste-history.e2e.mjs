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

test("composer undo and redo isolate a paste from typing on both sides", { timeout: 30_000 }, async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    await context.addInitScript(() => localStorage.setItem("openconductor.firstRunOnboardingStep", "999"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?demo=1`);
    await page.locator(".ws-strip").waitFor();
    const input = page.locator(".chat [contenteditable=true]").first();
    await input.waitFor();
    await input.focus();
    assert.equal(await input.textContent(), "");
    await page.evaluate(() => navigator.clipboard.writeText(" pasted "));
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
    await page.keyboard.type("before");
    await page.keyboard.press(`${modifier}+v`);
    await page.keyboard.type("after");
    assert.equal(await input.textContent(), "before pasted after");

    const undoStates = [];
    for (const expected of ["before pasted ", "before", ""]) {
      await page.keyboard.press(`${modifier}+z`);
      const actual = await input.textContent();
      undoStates.push(actual);
      assert.equal(actual, expected, `Undo must restore ${JSON.stringify(expected)} without removing an adjacent edit`);
    }
    const redoStates = [];
    for (const expected of ["before", "before pasted ", "before pasted after"]) {
      await page.keyboard.press(`${modifier}+Shift+z`);
      const actual = await input.textContent();
      redoStates.push(actual);
      assert.equal(actual, expected, `Redo must restore ${JSON.stringify(expected)} as one edit`);
    }
    console.log(JSON.stringify({ undoStates, redoStates }));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
