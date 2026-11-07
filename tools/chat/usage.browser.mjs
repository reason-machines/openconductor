import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const origin = process.env.BASE_URL ?? "http://localhost:4667";
const out = process.env.OUT ?? ".rea-work/usage/after";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, locale: "en-US" });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
async function open(query = "", index = 0) {
  await page.goto(`${origin}/tools/chat/usage-fixture.html?${query}`);
  await page.locator(".oc-turn-time").nth(index).click({ timeout: 10000 });
  const dialog = page.getByRole("dialog", { name: "Turn details" });
  await dialog.waitFor();
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  return dialog;
}
try {
  for (const theme of ["dark", "light"]) {
    const dialog = await open(`theme=${theme}&replay=1&multiple=1`);
    assert.deepEqual(await dialog.locator("dd").allTextContents(), ["18,200", "2,400"]);
    assert.match(await dialog.innerText(), /Input/);
    assert.match(await dialog.innerText(), /Output/);
    await page.screenshot({ path: `${out}/${theme}.png` });
    checks.push(`${theme}: real Transcript renders exact SDK-result counts after duplicated streaming metadata and persisted replay`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.locator(".oc-turn-time").nth(1).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("dialog").locator(".chat-turn-details-usage").count(), 0);
    checks.push(`${theme}: next turn does not inherit usage`);
    for (const mode of ["unknown", "zero"]) {
      const hidden = await open(`theme=${theme}&case=${mode}`);
      assert.equal(await hidden.locator(".chat-turn-details-usage").count(), 0);
      checks.push(`${theme}: ${mode} usage rows hidden`);
    }
    const partial = await open(`theme=${theme}&case=partial`);
    assert.deepEqual(await partial.locator("dd").allTextContents(), ["—", "2,400"]);
    checks.push(`${theme}: partial count keeps missing input unknown, not zero`);
    await page.goto(`${origin}/tools/chat/usage-fixture.html?theme=${theme}&streaming=1`);
    await page.locator(".transcript").waitFor();
    assert.equal(await page.locator(".oc-turn-time").count(), 0);
    checks.push(`${theme}: streaming turn has no completed-turn details`);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`PASS ${checks.length} browser checks; no page errors`);
} catch (error) {
  fs.writeFileSync(`${out}/failure.json`, JSON.stringify({ message: String(error), errors }, null, 2));
  await page.screenshot({ path: `${out}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
