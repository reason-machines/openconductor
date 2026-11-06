import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url = `http://localhost:${process.env.PORT ?? "4437"}/tools/linked-directory/demo.html`;
const results = [];
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log("PASS", name); }
try {
  await check("search groups, keyboard selection, validated callback and close", async () => {
    await page.goto(url);
    const input = page.getByRole("combobox");
    await input.waitFor();
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.getByRole("option").count(), 4);
    assert.equal(await page.getByRole("group", { name: "tide-web", exact: true }).count(), 0);
    await input.fill("TIDE-API");
    assert.equal(await page.getByRole("option").count(), 3);
    await input.fill("pagination");
    assert.equal(await page.getByRole("option").count(), 2);
    await input.press("ArrowDown");
    await input.press("Enter");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("chosen").textContent(), "/isolated/linked-directory/accra");
    assert.deepEqual(JSON.parse(await page.getByTestId("inspections").textContent()), ["/isolated/linked-directory/accra"]);
  });
  await check("no matches retains Browse; browsing returns a checked selection", async () => {
    await page.goto(url);
    await page.getByRole("combobox").fill("no-such-workspace");
    assert.equal(await page.getByRole("option").count(), 1);
    assert.equal(await page.getByRole("group").count(), 1);
    await page.getByRole("option", { name: "Browse...", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("chosen").textContent(), "/isolated/browsed-directory");
  });
  await check("canceled browse leaves picker open without checking or choosing", async () => {
    await page.goto(`${url}?browse=cancel`);
    await page.getByRole("option", { name: "Browse...", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute("aria-busy") === "false");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(await page.getByTestId("chosen").textContent(), "");
    assert.equal(await page.getByTestId("inspections").textContent(), "[]");
  });
  await check("invalid, missing and unreadable directories show errors without callbacks", async () => {
    for (const [mode, error] of [["invalid", "absolute local"], ["gone", "no longer exists"], ["error", "Permission denied"]]) {
      await page.goto(`${url}?browse=${mode}`);
      await page.getByRole("option", { name: "Browse...", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: error }).waitFor();
      assert.equal(await page.getByTestId("chosen").textContent(), "");
      assert.equal(await page.getByRole("dialog").count(), 1);
    }
  });
  await check("closing during validation suppresses late callbacks; repeated picks inspect once", async () => {
    await page.goto(`${url}?browse=slow`);
    const input = page.getByRole("combobox");
    await input.press("Enter");
    await page.getByRole("status").waitFor();
    await input.press("Enter");
    await input.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForTimeout(650);
    assert.equal(await page.getByTestId("chosen").textContent(), "");
    assert.deepEqual(JSON.parse(await page.getByTestId("inspections").textContent()), ["/isolated/browsed-directory"]);
  });
  await check("focus stays trapped, Escape and backdrop close, and trigger focus returns", async () => {
    await page.goto(`${url}?closed=1`);
    const trigger = page.getByRole("button", { name: "Open picker" });
    await trigger.click();
    const input = page.getByRole("combobox");
    await input.press("Tab");
    await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'));
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent === "Open picker");
    await trigger.click();
    await page.locator(".linked-directory-backdrop").click({ position: { x: 10, y: 10 } });
    await page.getByRole("dialog").waitFor({ state: "detached" });
  });
  await check("long lists scroll within a small viewport and keyboard wrap stays visible", async () => {
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto(`${url}?many=1&theme=light`);
    const input = page.getByRole("combobox");
    await input.press("ArrowUp");
    await page.waitForFunction(() => {
      const selected = document.querySelector('[role="option"][aria-selected="true"]');
      const list = document.querySelector('[role="listbox"]');
      if (!selected || !list) return false;
      const a = selected.getBoundingClientRect(), b = list.getBoundingClientRect();
      return a.top >= b.top && a.bottom <= b.bottom;
    });
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 400);
  });
  assert.deepEqual(failures, []);
  fs.mkdirSync("evidence/chat/linked-directory", { recursive: true });
  fs.writeFileSync("evidence/chat/linked-directory/browser-checks.json", JSON.stringify({ results, pageErrors: failures, limitation: "Isolated component fixture with injected browse/inspection services; not a native file dialog or filesystem check." }, null, 2) + "\n");
} finally { await browser.close(); }
