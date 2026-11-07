import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const reference = process.argv[2] === "reference";
const origin = process.env.ORIGIN ?? `http://localhost:${process.env.PORT ?? 4457}`;
const output = process.env.OUTPUT ?? "evidence/chat/composer/model-arrows";
const label = process.env.PROOF_LABEL ?? (reference ? "reference" : "ours");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
let page;
let search;
let chip;
let editor;
const names = ["Sonnet 4.6", "Sonnet 5 1M", "Sonnet 5.5", "Sonnet 4.6 1M"];
const checks = [];
async function open() {
  if (page) await page.context().close();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  search = page.getByRole("textbox", { name: "Search models", exact: true });
  chip = page.locator(reference ? "[aria-label^='Change agent']" : "[data-testid=composer-model-button]");
  editor = page.locator(reference ? "[contenteditable=true]" : ".composer [contenteditable=true]");
  await page.goto(`${origin}/${reference ? "?oc_scenario=populated&oc_mention_files=1" : "tools/composer/demo.html?agent=claude&model-arrow-checks=1"}`);
  if (reference) {
    await page.getByText("tide-web", { exact: true }).click();
    await page.getByText("Ada/fix login redirect", { exact: true }).click();
  }
  await editor.fill("Keep this unsent draft");
  await chip.click();
  await search.fill("sonnet");
  assert.equal(await search.inputValue(), "sonnet");
}
async function focused(name) {
  await page.waitForFunction((name) => document.activeElement?.getAttribute("role") === "menuitem" && document.activeElement.textContent.includes(name), name, { timeout: 1500 });
}
async function check(name, run) {
  try {
    await open();
    await run();
    assert.equal(await editor.textContent(), "Keep this unsent draft");
    if (!reference) assert.equal(await page.getByTestId("composer-result").textContent(), "");
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
  }
}
try {
  await check("ArrowDown focuses the second search match and ArrowUp returns to the first", async () => {
    await search.press("ArrowDown");
    await focused(names[1]);
    await page.keyboard.press("ArrowUp");
    await focused(names[0]);
    await page.screenshot({ path: `${output}/${label}-first.png` });
  });
  await check("Search-result arrows wrap in both directions", async () => {
    await search.press("ArrowUp");
    await focused(names[3]);
    await page.keyboard.press("ArrowDown");
    await focused(names[0]);
  });
  await check("Enter chooses the arrow-focused result, clears search, and keeps the menu open", async () => {
    await search.press("ArrowDown");
    await focused(names[1]);
    await page.screenshot({ path: `${output}/${label}-second.png` });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('input[aria-label="Search models"]')?.value === "");
    assert.equal(await search.isVisible(), true);
    assert.match(await chip.textContent(), /Sonnet 5 1M/);
    await page.screenshot({ path: `${output}/${label}-selected.png` });
  });
  fs.writeFileSync(`${output}/${label}-arrow-checks.json`, JSON.stringify({ reference, checks }, null, 2) + "\n");
  console.log(JSON.stringify({ label, checks }));
  assert.ok(checks.every((check) => check.passed), "Model arrow browser regressions failed");
} finally {
  await browser.close();
}
