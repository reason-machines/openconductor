import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const base = process.env.REASON_MARK_BASE_URL;
const out = process.env.E2E_OUT;
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));

test("official Reason source remains byte-for-byte intact", () => {
  const bytes = readFileSync("src/assets/reason-agent-mark/reason-mark-mask.svg");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "165ebc1307e4f84bb69118d32d97d3a9e6ab82ddde1f2f0a63b2c62af7c176e1");
});

async function checkMarks(locator, minimum) {
  assert.ok(await locator.count() >= minimum);
  const marks = await locator.evaluateAll((els) => els.map((el) => ({
    id: el.querySelector("mask")?.id,
    reference: el.querySelector(":scope > path")?.getAttribute("mask"),
    eyes: el.querySelectorAll("mask g path").length,
    fill: el.getAttribute("fill"),
    color: getComputedStyle(el).color,
    stroke: el.getAttribute("stroke"),
    viewBox: el.getAttribute("viewBox"),
    box: el.getBoundingClientRect().width,
  })));
  assert.equal(new Set(marks.map((m) => m.id)).size, marks.length, "each instance owns its mask");
  for (const mark of marks) {
    assert.ok(mark.id);
    assert.equal(mark.reference, `url(#${mark.id})`);
    assert.equal(mark.eyes, 2);
    assert.equal(mark.fill, "currentColor");
    assert.equal(mark.stroke, "none");
    assert.equal(mark.viewBox, "0 0 100 100");
    assert.ok(mark.box > 0);
  }
}

test("built Settings and chat picker use neutral official Reason marks with unique masks", async () => {
  assert.ok(executablePath);
  const server = base ? null : await preview({ preview: { port: Number(process.env.E2E_PORT ?? 4288), host: "0.0.0.0", strictPort: true }, logLevel: "error" });
  const url = base ?? server.resolvedUrls.local[0].replace(/\/$/, "");
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    for (const colorScheme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme, reducedMotion: "reduce" });
      await context.addInitScript(() => localStorage.setItem("openconductor.firstRunOnboardingStep", "999"));
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.goto(`${url}/settings/user/providers?providerTab=reason`);
      await page.getByRole("tab", { name: "Reason", exact: true }).waitFor();
      await checkMarks(page.locator('.oc-ag svg[data-agent="reason"]'), 2);
      assert.equal(await page.getByRole("button", { name: /^Reason account/ }).locator('svg[data-agent="reason"]').count(), 1);
      if (out) { mkdirSync(out, { recursive: true }); await page.screenshot({ path: `${out}/settings-${colorScheme}.png` }); }
      await page.goto(`${url}/?demo=1`);
      await page.locator('[data-testid="left-sidebar-workspace-item"]').first().click();
      const picker = page.getByTestId("composer-model-button");
      await picker.waitFor();
      await picker.click();
      await page.getByRole("menu", { name: "Model", exact: true }).waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".oc-model-menu")).opacity) >= 0.99);
      await checkMarks(page.locator('.oc-model-menu svg[data-agent="reason"]'), 1);
      assert.equal(await page.locator('.oc-model-menu .oc-model-glyph[data-agent="claude"]').count(), 0, "Reason models are not Claude Code chats");
      if (out) await page.screenshot({ path: `${out}/picker-${colorScheme}.png` });
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  }
});
