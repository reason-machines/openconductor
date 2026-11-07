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

async function open() {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto(`${base}/tools/dialogs/index.html?workspaceFixture=1`);
  await page.getByRole("button", { name: "workspace", exact: true }).click();
  await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "First message" }).waitFor();
  return page;
}

for (const key of ["Tab", "Shift+Tab"]) {
  test(`New workspace: ${key} stays inside the actual dialog and Escape restores opener focus`, async () => {
    const page = await open();
    try {
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(key);
        await page.waitForFunction(() => document.querySelector('[aria-labelledby="create-dialog-title"]')?.contains(document.activeElement), null, { timeout: 1500 });
      }
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.textContent === "workspace", null, { timeout: 1500 });
      assert.equal(await page.getByTestId("events").textContent(), "[]");
    } finally { await page.close(); }
  });
}

test("New workspace: nested Create from consumes the first Escape, outer dialog consumes the second", async () => {
  const page = await open();
  try {
    await page.getByRole("button", { name: "Create from", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Create new workspace from PR, branch, or issue", exact: true });
    await picker.waitFor();
    await picker.getByRole("textbox").focus();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("dialog", { name: "New workspace", exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "First message" }).focus();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "New workspace", exact: true }).waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "workspace", null, { timeout: 1500 });
  } finally { await page.close(); }
});

test("New workspace: pending creation blocks Escape and backdrop dismissal, failure re-enables dismissal", async () => {
  const page = await open();
  try {
    const dialog = page.getByRole("dialog", { name: "New workspace", exact: true });
    await dialog.getByRole("group", { name: "Create workspace", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.createPending === "true");
    assert.equal(await dialog.getByRole("form", { name: "composer" }).getAttribute("aria-busy"), "true");
    assert.equal(await page.getByRole("textbox", { name: "First message" }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 1);
    await page.mouse.click(10, 100);
    assert.equal(await dialog.count(), 1);
    assert.equal(await page.getByTestId("events").textContent(), "[]");
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:reject-create")));
    await page.waitForFunction(() => document.querySelector('[aria-label="composer"]')?.getAttribute("aria-busy") === "false");
    assert.match(await dialog.getByRole("status").textContent(), /Fixture creation failed/);
    await page.getByRole("textbox", { name: "First message" }).focus();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "workspace", null, { timeout: 1500 });
  } finally { await page.close(); }
});
