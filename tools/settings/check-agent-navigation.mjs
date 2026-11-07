// Run against the isolated tools/settings/fixture.mjs preview. No real agents or settings.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.OC_BASE_URL ?? "http://localhost:51749";
const out = process.env.NAVIGATION_OUT ?? ".oc-tmp/agent-navigation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  for (const scenario of ["canonical-url", "mounted-search"]) {
    await page.goto(`${base}/settings/user/providers?providerTab=codex`);
    await page.getByRole("tabpanel", { name: "Codex", exact: true }).waitFor();
    await page.waitForFunction(() => window.__settingsTest !== undefined && document.querySelector('input[type="search"]'));
    if (scenario === "mounted-search") {
      await page.getByPlaceholder("Search settings", { exact: true }).fill("Claude Code");
      await page.getByRole("option", { name: "Claude Code", exact: true }).click();
    }
    // Let startup preference resolution and React's external-store notification finish.
    await page.waitForTimeout(200);
    const observed = await page.evaluate(() => ({
      pathname: location.pathname,
      search: location.search,
      selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      panel: document.querySelector('[role="tabpanel"]')?.getAttribute("aria-label"),
    }));
    await page.screenshot({ path: `${out}/${scenario}.png` });
    try {
      const expectedTab = scenario === "mounted-search" ? "Claude Code" : "Codex";
      assert.equal(new URLSearchParams(observed.search).get("providerTab"), scenario === "mounted-search" ? "claude" : "codex", "canonical URL retains the selected provider");
      assert.equal(observed.selected, expectedTab, "visible tab follows navigation");
      assert.equal(observed.panel, expectedTab, "visible panel follows navigation");
      results.push({ scenario, status: "PASS", observed });
    } catch (error) {
      results.push({ scenario, status: "FAIL", error: error.message, observed });
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
assert.ok(results.every(r => r.status === "PASS"), "both provider navigation behaviors pass");
