// Run against tools/settings/fixture.mjs, which delays IPC writes until completed here.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.OC_BASE_URL ?? "http://localhost:51749";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/settings/user/providers?manual_writes=1`);
  const workspace = page.getByLabel("Workspace for new chats", { exact: true });
  const model = page.getByLabel("Default Reason model", { exact: true });
  const effort = page.getByLabel("Default Reason effort", { exact: true });
  await workspace.waitFor();
  await workspace.selectOption("");
  await model.selectOption("");
  await page.waitForFunction(() => window.__settingsTest.writes.length >= 1);
  await page.evaluate(() => window.__settingsTest.complete(0));
  await page.waitForTimeout(100);
  // A completed older save must not bring back the model just cleared in the UI.
  assert.equal(await model.inputValue(), "", "older save response restored the cleared model");
  await effort.selectOption("");
  for (let index = 1; index < 3; index++) {
    await page.waitForFunction((i) => window.__settingsTest.writes.length > i, index);
    await page.evaluate((i) => window.__settingsTest.complete(i), index);
  }
  await page.waitForFunction(() => window.__settingsTest.writes.every((w) => w.done));
  assert.deepEqual(await page.evaluate(() => window.__settingsTest.stored().reason), { workspace: null, model: null, reasoning_effort: null });
  assert.equal(await workspace.inputValue(), "");
  assert.equal(await model.inputValue(), "");
  assert.equal(await effort.inputValue(), "");
  console.log("PASS: three rapid default clears survive an older response and persist together");

  // A rejected write rolls back; a later edit still saves normally.
  await effort.selectOption("low");
  await page.waitForFunction(() => window.__settingsTest.writes.length === 4);
  await page.evaluate(() => window.__settingsTest.complete(3, true));
  await page.waitForFunction(() => document.querySelector('[aria-label="Default Reason effort"]').value === "");
  await effort.selectOption("medium");
  await page.waitForFunction(() => window.__settingsTest.writes.length === 5);
  await page.evaluate(() => window.__settingsTest.complete(4));
  await page.waitForFunction(() => window.__settingsTest.stored().reason.reasoning_effort === "medium");
  console.log("PASS: rejected save rolls back and does not poison the next save");
} finally {
  await browser.close();
}
