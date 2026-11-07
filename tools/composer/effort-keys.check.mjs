import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.ORIGIN ?? "http://localhost:4469";
const output = process.env.OUTPUT ?? "evidence/chat/composer/effort-keys";
const label = process.env.PROOF_LABEL ?? "ours";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const checks = [];
let page;
let trigger;
let submenu;
async function snapshot() {
  return page.evaluate(() => ({
    submenuVisible: !!document.querySelector(".oc-model-submenu"),
    focused: document.activeElement?.textContent,
    draft: document.querySelector(".composer [contenteditable=true]")?.textContent,
    sent: document.querySelector('[data-testid="composer-result"]')?.textContent,
  }));
}
async function focusIs(text) {
  assert.equal(await page.locator(":focus").textContent(), text);
}
async function open() {
  if (page) await page.context().close();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  // A built fixture can run without a second HTTP server in a shell sandbox.
  if (process.env.DEMO_DIR) {
    const directory = path.resolve(process.env.DEMO_DIR);
    await page.route(`${origin}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.resolve(directory, `.${pathname}`);
      if (!file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file)) return route.abort();
      const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
      await route.fulfill({ path: file, contentType });
    });
  }
  await page.goto(`${origin}/${process.env.DEMO_DIR ? "" : "tools/composer/"}demo.html?agent=claude&effort-key-checks=1`);
  await page.locator(".composer [contenteditable=true]").fill("Keep this unsent draft");
  await page.getByTestId("composer-model-button").click();
  trigger = page.locator(".oc-model-sub > button");
  submenu = page.locator(".oc-model-submenu");
  await trigger.focus();
}
async function first(key = "ArrowRight") {
  await trigger.press(key);
  assert.equal(await submenu.isVisible(), true, JSON.stringify(await snapshot()));
  await focusIs("Low");
}
async function check(name, run) {
  try {
    await open();
    await run();
    const state = await snapshot();
    assert.equal(state.draft, "Keep this unsent draft");
    assert.equal(state.sent, "");
    checks.push({ name, passed: true, state });
  } catch (error) {
    const state = await snapshot().catch(() => null);
    checks.push({ name, passed: false, error: error.message, state });
    await page.screenshot({ path: `${output}/${label}-${checks.length}-failure.png` });
  }
}
try {
  await check("ArrowRight opens effort at Low", async () => {
    await first();
    await page.screenshot({ path: `${output}/${label}-low.png` });
  });
  await check("Enter opens effort at Low", async () => { await first("Enter"); });
  await check("ArrowDown advances Low to Medium", async () => {
    await first();
    await page.keyboard.press("ArrowDown");
    await focusIs("Medium");
    await page.screenshot({ path: `${output}/${label}-medium.png` });
  });
  await check("ArrowUp wraps Low to Ultracode", async () => {
    await first();
    await page.keyboard.press("ArrowUp");
    await focusIs("Ultracode");
  });
  await check("ArrowLeft closes only submenu and focuses Effort", async () => {
    await first();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await submenu.isVisible(), false);
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.getByRole("menu", { name: "Model", exact: true }).isVisible(), true);
  });
  await check("Enter selects Medium and keeps parent menu open", async () => {
    await first();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(await submenu.isVisible(), false);
    assert.equal(await page.getByRole("menu", { name: "Model", exact: true }).isVisible(), true);
    assert.match(await trigger.textContent(), /Medium/);
    assert.match(await page.getByTestId("composer-model-button").textContent(), /Med/);
    await page.screenshot({ path: `${output}/${label}-selected.png` });
  });
  await check("Composing keyboard events neither open nor select effort", async () => {
    await trigger.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
    assert.equal(await submenu.isVisible(), false);
    await first();
    await page.locator(":focus").evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
    assert.equal(await submenu.isVisible(), true);
    assert.match(await trigger.textContent(), /High/);
  });
  fs.writeFileSync(`${output}/${label}-checks.json`, JSON.stringify({ origin, label, checks }, null, 2) + "\n");
  console.log(JSON.stringify({ label, checks }));
  assert.ok(checks.every((check) => check.passed), "Effort keyboard browser regressions failed");
} finally {
  await browser.close();
}
