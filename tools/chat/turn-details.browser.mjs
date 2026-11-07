import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.BASE_URL ?? "http://localhost:4638";
const out = process.env.OUT ?? ".rea-work/turn-details/after";
const serve = process.argv.includes("--serve");
let server;
if (serve) {
  const { createServer } = await import("vite");
  server = await createServer({ server: { host: "0.0.0.0", port: Number(new URL(origin).port), strictPort: true } });
  await server.listen();
}
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
const record = (check) => { checks.push(check); console.log(`PASS ${check}`); };
const fixture = (query) => `${origin}/tools/chat/transcript-fixture.html?${query}`;
try {
  for (const theme of ["dark", "light"]) {
    await page.goto(fixture(`theme=${theme}`));
    const trigger = page.locator(".oc-turn-time");
    await trigger.waitFor();
    await page.screenshot({ path: path.join(out, `${theme}-closed.png`) });
    fs.writeFileSync(path.join(out, `${theme}-trigger.json`), JSON.stringify(await trigger.evaluate((el) => ({ tag: el.tagName, title: el.title, tabIndex: el.tabIndex, text: el.textContent })), null, 2));
    assert.equal(await trigger.evaluate((el) => el.tagName), "BUTTON", "finished-turn timestamp must be keyboard focusable, not a native-title span");
    assert.equal(await trigger.getAttribute("title"), null, "no competing native-title tooltip");
    const dialog = page.getByRole("dialog", { name: "Turn details" });
    await trigger.click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Opus 5\.5 via Reason/);
    assert.match(await dialog.innerText(), /Nov 5, 2026, 10:29 AM → Nov 5, 2026, 10:37 AM/);
    await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    assert.equal(await dialog.evaluate((el) => getComputedStyle(el).opacity), "1", "capture the settled popup, not its opening animation");
    await page.screenshot({ path: path.join(out, `${theme}-open.png`) });
    assert.equal(await dialog.locator(".chat-turn-details-usage").count(), 0, "unavailable usage is never invented");
    record(`${theme}: click exposes existing agent and exact time range`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    record(`${theme}: Escape closes and restores timestamp focus`);
    for (const key of ["Enter", "Space"]) {
      await trigger.focus();
      await trigger.press(key);
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      record(`${theme}: ${key} opens details from keyboard focus`);
    }
    await page.mouse.move(1200, 50);
    await trigger.hover();
    await dialog.waitFor();
    await dialog.hover();
    assert.equal(await dialog.isVisible(), true);
    await page.mouse.move(1200, 50);
    await dialog.waitFor({ state: "detached" });
    record(`${theme}: hover opens, allows popup inspection, and closes on leave`);
    await trigger.click();
    await dialog.waitFor();
    await page.mouse.click(1200, 50);
    await dialog.waitFor({ state: "detached" });
    record(`${theme}: outside click dismisses details`);
  }
  await page.goto(fixture("noAgent=1"));
  await page.locator(".oc-turn-time").click();
  const unknown = page.getByRole("dialog", { name: "Turn details" });
  await unknown.waitFor();
  assert.doesNotMatch(await unknown.innerText(), /undefined|Unknown|via Reason/);
  assert.match(await unknown.innerText(), /→/);
  record("missing agent still exposes time without a fabricated model");
  await page.goto(fixture("running=1"));
  await page.locator(".transcript").waitFor();
  assert.equal(await page.locator(".oc-turn-time").count(), 0);
  record("running turn has no completed-turn timestamp");
  await page.goto(fixture("cancelled=1"));
  await page.locator(".oc-turn-time").click();
  await page.getByRole("dialog", { name: "Turn details" }).waitFor();
  assert.equal(await page.getByText("Interrupted by user", { exact: true }).isVisible(), true);
  record("cancelled turn keeps both its timestamp details and interruption badge");
  assert.deepEqual(errors, []);
  record("no page errors");
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, "failure.txt"), String(error));
  await server?.close();
  throw error;
} finally {
  await browser.close();
}
