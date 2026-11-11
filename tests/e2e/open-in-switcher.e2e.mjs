// Run against tools/open-in/server.mjs after building; the server owns only fake data.
// OPEN_IN_BASE_URL=http://localhost:4518 node --test tests/e2e/open-in-switcher.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { preview } from "vite";
import { fakeBackend, SHELL, FILES } from "./right-panel-fixture.mjs";
import { installOpenInBackend } from "./open-in-fixture.mjs";
import { DEFAULT_APP_PREFS } from "../../src/settings/appPrefs.ts";

const external = process.env.OPEN_IN_BASE_URL;
let base = external;
let server;
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);
let browser;
before(async () => {
  if (!base) {
    server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
    base = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});
async function pageFor() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  if (!external) {
    const apps = ["finder", "cursor", "vscode", "zed", "xcode", "ghostty", "terminal"].map((id) => ({ id, name: id === "finder" ? "Finder" : id === "cursor" ? "Cursor" : id === "terminal" ? "Terminal" : id, iconType: "code", icon: null }));
    await page.addInitScript({ content: `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES })});(${installOpenInBackend})(${JSON.stringify({ apps, initialPrefs: { ...DEFAULT_APP_PREFS, onboarding_step: 99, first_time_onboarding_step: 999 } })});` });
  }
  await page.goto(base);
  await page.getByRole("button", { name: "Open in Finder", exact: true }).waitFor();
  await page.locator("body").click({ position: { x: 500, y: 100 } });
  return page;
}
const opened = (page) => page.evaluate(() => window.__fake.calls.filter((c) => c.cmd === "open_in_app"));
const held = async (page) => { await page.keyboard.down("Meta"); await page.keyboard.press("o"); };
const chooser = (page) => page.getByRole("dialog", { name: "Open in app", exact: true });
const chosen = (page) => chooser(page).locator('button[aria-pressed="true"]');

test("holding opens no app, cycling reveals chooser, reverse cycles, release opens exactly once", async () => {
  const page = await pageFor();
  await held(page);
  assert.equal((await opened(page)).length, 0, "no app may open on keydown before Command is released");
  await chooser(page).waitFor();
  assert.equal(await chosen(page).getAttribute("aria-label"), "Finder");
  await page.keyboard.press("o");
  assert.equal(await chosen(page).getAttribute("aria-label"), "Cursor");
  await page.keyboard.press("Shift+o");
  assert.equal(await chosen(page).getAttribute("aria-label"), "Finder");
  await page.keyboard.up("Meta");
  await chooser(page).waitFor({ state: "detached" });
  assert.deepEqual((await opened(page)).map((c) => c.appId), ["finder"]);
  await page.close();
});
test("Escape, window blur and the Close tile cancel without opening", async () => {
  const page = await pageFor();
  await held(page);
  await page.keyboard.press("Escape");
  await page.keyboard.up("Meta");
  assert.equal((await opened(page)).length, 0);
  await held(page);
  await chooser(page).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("Meta");
  assert.equal((await opened(page)).length, 0);
  await held(page);
  await page.keyboard.press("Shift+o");
  assert.equal(await chosen(page).getAttribute("aria-label"), "Close");
  await page.keyboard.up("Meta");
  assert.equal((await opened(page)).length, 0);
  await page.close();
});
test("quick release opens the first app without leaving an overlay; pointer button stays immediate", async () => {
  const page = await pageFor();
  await page.keyboard.press("Meta+o");
  await page.waitForTimeout(400);
  assert.equal(await chooser(page).count(), 0);
  assert.deepEqual((await opened(page)).map((c) => c.appId), ["finder"]);
  await page.getByRole("button", { name: "Open in Finder", exact: true }).click();
  assert.equal((await opened(page)).length, 2);
  await page.close();
});
test("inactive Shift+Command+O keeps opening the numbered menu; chosen app becomes MRU", async () => {
  const page = await pageFor();
  await page.keyboard.press("Meta+Shift+o");
  const menu = page.getByRole("menu", { name: "Open in", exact: true });
  await menu.waitFor();
  await page.keyboard.press("2");
  await page.getByRole("button", { name: "Open in Cursor", exact: true }).waitFor();
  assert.deepEqual((await opened(page)).map((c) => c.appId), ["cursor"]);
  await held(page);
  await chooser(page).waitFor();
  assert.equal(await chooser(page).getByRole("button").first().getAttribute("aria-label"), "Cursor");
  await chooser(page).getByRole("button", { name: "Terminal", exact: true }).click();
  await page.keyboard.up("Meta");
  assert.deepEqual((await opened(page)).map((c) => c.appId), ["cursor", "terminal"]);
  await page.close();
});
