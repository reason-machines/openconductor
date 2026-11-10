import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startViteFixture } from "./vite-fixture-server.mjs";

let browser;
let server;
before(async () => {
  server = await startViteFixture();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
});
after(async () => {
  try { await browser?.close(); } finally { await server?.close(); }
});

async function open(query = "") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, reducedMotion: "reduce" });
  try {
    await page.goto(`${server.base}/evidence/dialogs/rename-chat-focus/index.html${query}`);
    await page.locator('[data-overrides-ready="true"]').waitFor();
    await page.getByRole("button", { name: "Rename fixture chat", exact: true }).click();
    await page.getByRole("dialog", { name: "Rename chat", exact: true }).waitFor();
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

test("Rename chat keeps forward and backward Tab focus inside the dialog", async () => {
  const page = await open();
  try {
    const dialog = page.getByRole("dialog", { name: "Rename chat", exact: true });
    const input = dialog.getByRole("textbox", { name: "Chat name" });
    assert.equal(await input.inputValue(), "Fixture chat");
    assert.deepEqual(await input.evaluate((node) => [node.selectionStart, node.selectionEnd]), [0, 12]);
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(key);
        await page.waitForFunction(
          () => document.querySelector('[role="dialog"]')?.contains(document.activeElement),
          null,
          { timeout: 1500 },
        );
      }
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "Rename fixture chat", null, { timeout: 1500 });
    assert.equal(await page.getByTestId("renamed").textContent(), "[]");
  } finally {
    await page.close();
  }
});

test("Rename chat Cancel returns focus to its opener without saving", async () => {
  const page = await open();
  try {
    const dialog = page.getByRole("dialog", { name: "Rename chat", exact: true });
    await dialog.getByRole("textbox", { name: "Chat name" }).fill("Unsaved title");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "Rename fixture chat", null, { timeout: 1500 });
    assert.equal(await page.getByTestId("renamed").textContent(), "[]");
  } finally {
    await page.close();
  }
});

for (const [query, key] of [["", "Meta+Enter"], ["?customShortcut=1", "Alt+k"]]) {
  test(`Rename chat primary shortcut ${key} confirms while Cancel has focus`, async () => {
    const page = await open(query);
    try {
      const dialog = page.getByRole("dialog", { name: "Rename chat", exact: true });
      await dialog.getByRole("textbox", { name: "Chat name" }).fill("Saved title");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press(key);
      await dialog.waitFor({ state: "detached", timeout: 2500 });
      assert.equal(await page.getByTestId("renamed").textContent(), '["Saved title"]');
      assert.equal(await page.getByTestId("errors").textContent(), "[]");
    } finally {
      await page.close();
    }
  });
}

test("Rename chat pending save stays single-shot and Cancel remains available", async () => {
  const page = await open("?customShortcut=1&hold=1");
  try {
    const dialog = page.getByRole("dialog", { name: "Rename chat", exact: true });
    await dialog.getByRole("textbox", { name: "Chat name" }).fill("Pending title");
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="renamed"]')?.textContent === '["Pending title"]');
    assert.equal(await dialog.getByRole("textbox", { name: "Chat name" }).isDisabled(), true);
    assert.equal(await dialog.getByRole("button", { name: "Renaming...", exact: true }).isDisabled(), true);
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await cancel.focus();
    await page.keyboard.press("Alt+k");
    assert.equal(await page.getByTestId("renamed").textContent(), '["Pending title"]');
    await cancel.click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "Rename fixture chat", null, { timeout: 1500 });
    assert.equal(await page.getByTestId("renamed").textContent(), '["Pending title"]');
  } finally {
    await page.close();
  }
});
