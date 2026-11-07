import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const out = process.env.PASSPORT_OUT ?? ".oc-tmp/passport";
fs.mkdirSync(out, { recursive: true });
const results = {};
try {
  for (const theme of ["dark", "light"]) {
    results[theme] = {};
    for (const side of ["ref", "oc"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      await page.goto(`http://${side === "ref" ? "conductor.localhost" : "localhost"}:4682/?oc_scenario=populated&oc_theme=${theme}`);
      await page.getByRole("button", { name: /cities visited/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const svg = dialog.locator("svg.rsm-svg, svg.passport-map");
      await svg.waitFor();
      await page.waitForTimeout(500);
      results[theme][side] = await dialog.evaluate((node) => {
        const map = node.querySelector("svg.rsm-svg, svg.passport-map");
        const rectangle = (element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        return {
          dialog: rectangle(node),
          header: rectangle(node.firstElementChild),
          back: rectangle(node.querySelector("button")),
          footer: rectangle(node.lastElementChild),
          map: rectangle(map),
          headerText: node.firstElementChild.textContent,
          circles: [...map.querySelectorAll("circle")].map((circle) => ({ ...rectangle(circle), radius: Number(circle.getAttribute("r")) })).sort((a, b) => a.x - b.x || a.y - b.y || a.radius - b.radius),
          countries: map.querySelectorAll(".rsm-geography, .passport-countries path").length,
        };
      });
      const buttons = dialog.getByRole("button").filter({ hasNot: page.locator("circle") });
      const zoomIn = buttons.nth(1);
      const zoomOut = buttons.nth(2);
      const reset = buttons.nth(3);
      const viewport = dialog.locator(".rsm-zoomable-group, [data-passport-viewport]");
      const zoom = async () => {
        const transform = await viewport.getAttribute("transform");
        return Number(transform.match(/scale\(([^)]+)\)/)[1]);
      };
      await zoomIn.click();
      assert.equal(await zoom(), 1.5, `${side} button zoom factor`);
      for (let i = 0; i < 8; i++) await zoomIn.click();
      assert.equal(await zoom(), 8, `${side} upper zoom bound`);
      for (let i = 0; i < 8; i++) await zoomOut.click();
      assert.equal(await zoom(), 1, `${side} lower zoom bound`);
      await zoomIn.click();
      await reset.click();
      await page.waitForFunction(() => /translate\(0[ ,]+0\) scale\(1\)/.test(document.querySelector(".rsm-zoomable-group, [data-passport-viewport]")?.getAttribute("transform") ?? ""));
      assert.match(await viewport.getAttribute("transform"), /translate\(0[ ,]+0\) scale\(1\)/, `${side} reset`);
      if (side === "oc") {
        const bounds = await svg.boundingBox();
        await page.mouse.move(bounds.x + 600, bounds.y + 350);
        await page.mouse.down();
        await page.mouse.move(bounds.x + 640, bounds.y + 370, { steps: 5 });
        await page.mouse.up();
        assert.notEqual(await viewport.getAttribute("transform"), "translate(0 0) scale(1)", "drag pans");
        await reset.click();
        const afterReset = await viewport.getAttribute("transform");
        await page.mouse.move(bounds.x + 680, bounds.y + 420);
        assert.equal(await viewport.getAttribute("transform"), afterReset, "pointer-up stops panning");
        await svg.hover();
        await page.mouse.wheel(0, -150);
        await page.waitForTimeout(200);
        assert.ok(await zoom() > 1, "wheel zooms");
        await reset.click();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /cities visited/, "close returns focus to Home trigger");
        await page.getByRole("button", { name: /cities visited/ }).click();
        await dialog.getByRole("button", { name: "BACK TO APP" }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: /cities visited/ }).click();
        await dialog.getByRole("button", { name: /open workspace/ }).first().click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await page.locator(".home").count(), 0, "city selection leaves Home for workspace");
      } else {
        await dialog.locator('circle[fill="var(--git-green)"]').first().click();
        await dialog.waitFor({ state: "hidden" });
        assert.match(page.url(), /\/repository\/.+\/workspace\//, "reference active city opens its workspace");
      }
      await page.close();
    }
    const { ref, oc } = results[theme];
    for (const key of ["dialog", "header", "back", "footer", "map"]) assert.deepEqual(oc[key], ref[key], `${theme} ${key} geometry`);
    assert.ok(oc.headerText.includes("5/385"), "visited count includes all fixture cities");
    assert.equal(oc.circles.length, ref.circles.length, `${theme} marker count`);
    for (let i = 0; i < ref.circles.length; i++) {
      for (const key of ["x", "y", "width", "height", "radius"]) assert.ok(Math.abs(oc.circles[i][key] - ref.circles[i][key]) < 0.01, `${theme} marker ${i} ${key}`);
    }
  }
  console.log("PASS dark/light Passport geometry, 385 projected markers, 1..8 zoom/reset, active city navigation; OpenConductor drag/release, wheel, Escape/back/focus restoration");
} finally {
  fs.writeFileSync(`${out}/checks.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
