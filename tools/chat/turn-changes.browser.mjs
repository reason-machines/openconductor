import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = process.env.BASE_URL ?? "http://localhost:4526";
const serve = process.argv.includes("--serve");
if (serve) {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { host: "0.0.0.0", port: new URL(origin).port, strictPort: true } });
  await server.listen();
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const first = page.locator(".chat-turn-changes");
const more = page.locator(".chat-turn-chip.more");
const counts = more.locator(".oc-chip-counts");

async function open(width, files, theme = "dark") {
  await page.goto(`${origin}/tools/chat/transcript-fixture.html?width=${width + 74}&files=${files}&theme=${theme}`);
  await page.locator(".oc-turn-footer").waitFor();
  const measured = await page.locator(".oc-turn-footer").evaluate((el) => el.getBoundingClientRect().width);
  assert.equal(measured, width, "test exercises the footer container width, not viewport width");
}

try {
  await open(479, 2);
  assert.equal(await first.isVisible(), false, "compact footer starts with inline file chips hidden");
  assert.equal((await more.innerText()).trim(), "2", "compact button counts every changed file");
  assert.equal(await more.getAttribute("aria-label"), "Show changed files");
  await more.click();
  assert.equal(await first.isVisible(), true, "compact button reveals first chips even when no overflow files exist");
  assert.equal(await more.count(), 0, "button leaves once all files are revealed");

  await open(479, 8);
  assert.equal((await more.innerText()).trim(), "8");
  assert.equal(await counts.isVisible(), false);
  await more.click();
  assert.equal(await first.isVisible(), true);
  assert.equal(await page.locator(".chat-turn-changes-more .chat-turn-chip:not(.more)").count(), 3);
  assert.equal((await more.innerText()).trim(), "3");
  await more.click();
  assert.equal(await more.count(), 0);
  assert.equal(await page.locator(".chat-turn-chip").count(), 8);

  for (const theme of ["dark", "light"]) {
    await open(480, 8, theme);
    assert.equal(await first.isVisible(), true);
    assert.equal((await more.innerText()).trim(), "+6 more");
    assert.equal(await counts.isVisible(), false);
    await open(559, 8, theme);
    assert.equal(await counts.isVisible(), false);
    await open(560, 8, theme);
    assert.equal(await counts.isVisible(), true);
    await open(560, 2, theme);
    assert.equal(await first.isVisible(), true);
    assert.equal(await more.isVisible(), false, "wide footer with no overflow does not show the compact button");
  }
  console.log("PASS compact reveal, progressive reveal, 479/480/559/560px boundaries, dark/light");
} finally {
  await browser.close();
}
