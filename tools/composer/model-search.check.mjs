import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const origin = process.env.ORIGIN ?? `http://localhost:${process.env.PORT ?? 4427}`;
const output = process.env.OUTPUT ?? "evidence/chat/composer/model-keyboard";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];
const editor = page.locator(".composer [contenteditable=true]");
const menu = page.getByRole("menu", { name: "Model", exact: true });
const search = page.getByRole("textbox", { name: "Search models", exact: true });
const result = page.locator("[data-testid=composer-result]");
async function open() {
  await page.goto(`${origin}/tools/composer/demo.html?agent=claude&model-search-checks=1`);
  await editor.fill("Keep this unsent draft");
  await page.getByTestId("composer-model-button").click();
  await search.waitFor();
}
async function check(name, run) {
  try {
    await open();
    await run();
    assert.equal(await result.textContent(), "", "Model search must not submit the chat draft");
    assert.equal(await editor.textContent(), "Keep this unsent draft", "Model search must preserve the chat draft");
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    await page.screenshot({ path: `${output}/${process.env.PROOF_LABEL ?? "ours"}-failure-${checks.length}.png` });
  }
}
try {
  await check("Enter selects the first search result without sending the chat", async () => {
    await search.fill("sonnet");
    await search.press("Enter");
    assert.equal(await menu.isVisible(), true);
    assert.equal(await search.inputValue(), "");
    assert.match(await page.getByTestId("composer-model-button").textContent(), /Sonnet 4.6/);
  });
  await check("Enter with no matches does not send or close the menu", async () => {
    await search.fill("no-such-model-13576d11");
    await page.getByText("No models found", { exact: true }).waitFor();
    await search.press("Enter");
    assert.equal(await menu.isVisible(), true);
  });
  await check("Enter with an empty search does not send or close the menu", async () => {
    await search.press("Enter");
    assert.equal(await menu.isVisible(), true);
  });
  await check("Escape clears search before a second Escape closes the menu", async () => {
    await search.fill("opus");
    await search.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-testid="composer-model-button"]')?.getAttribute("aria-expanded") === "true" && document.querySelector('input[aria-label="Search models"]')?.value === "", null, { timeout: 2000 });
    assert.equal(await menu.isVisible(), true);
    await search.press("Escape");
    await menu.waitFor({ state: "hidden", timeout: 2000 });
  });
  await open();
  await search.fill("opus");
  await page.screenshot({ path: `${output}/${process.env.PROOF_LABEL ?? "ours"}-search.png` });
  await search.press("Enter");
  await page.screenshot({ path: `${output}/${process.env.PROOF_LABEL ?? "ours"}-after-enter.png` });
  fs.writeFileSync(`${output}/${process.env.PROOF_LABEL ?? "ours"}-checks.json`, JSON.stringify({ checks }, null, 2) + "\n");
  console.log(JSON.stringify({ checks }));
  assert.ok(checks.every((check) => check.passed), "Model search browser regressions failed");
} finally {
  await browser.close();
}
