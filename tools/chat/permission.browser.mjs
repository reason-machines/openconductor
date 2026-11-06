import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.BASE_URL ?? "http://localhost:4537";
const out = process.env.OUT ?? ".rea-work/permission-proof/workspace";
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
const report = { checks: [], themes: {} };
let failed = false;
try {
  await page.goto(`${origin}/?demo=1`);
  const editor = page.locator(".composer [contenteditable=true]");
  const approval = page.getByTestId("chat-permission-request").filter({ has: page.getByText("Do you want to run this command?", { exact: true }) });
  const ask = async () => {
    await editor.fill("permission");
    await editor.press("Enter");
    await approval.waitFor();
  };
  await ask();
  assert.equal(await editor.isVisible(), false, "an approval replaces the editor");
  assert.equal(await approval.evaluate((el) => el.closest(".transcript") === null), true, "exercise the real composer, outside transcript token scope");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `${theme}.png`) });
    const style = await approval.locator(".oc-code-chip").evaluate((el) => {
      const s = getComputedStyle(el);
      return { muted: s.getPropertyValue("--oc-muted").trim(), foreground: s.getPropertyValue("--oc-muted-fg").trim(), color: s.color, background: s.backgroundColor };
    });
    report.themes[theme] = style;
    fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(report, null, 2));
    assert.notEqual(style.muted, "", `${theme}: approval tool chip has a muted surface token`);
    assert.notEqual(style.foreground, "", `${theme}: approval tool chip has a muted foreground token`);
    assert.notEqual(style.background, "rgba(0, 0, 0, 0)", `${theme}: command chip keeps its reference-style background`);
    report.checks.push(`${theme}: permission tool colors resolve outside the transcript`);
  }
  await approval.getByRole("button", { name: /^No/ }).click();
  await approval.waitFor({ state: "detached" });
  await page.getByText("Browser preview: you answered with option deny.", { exact: true }).waitFor();
  report.checks.push("No returns the reject option and clears approval");
  for (const [key, option] of [["Enter", "allow"], ["Backspace", "deny"]]) {
    await ask();
    await page.locator("body").click({ position: { x: 640, y: 100 } });
    await page.keyboard.press(key);
    await approval.waitFor({ state: "detached" });
    assert.match(await page.locator(".chat-text").last().innerText(), new RegExp(`option ${option}\\.`));
    report.checks.push(`${key} returns ${option} and clears approval`);
  }
  assert.deepEqual(errors, []);
  report.checks.push("No page errors");
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(report, null, 2));
  for (const check of report.checks) console.log(`PASS ${check}`);
} catch (error) {
  failed = true;
  fs.writeFileSync(path.join(out, "failure.txt"), String(error));
  throw error;
} finally {
  await browser.close();
  if (failed) await server?.close();
}
