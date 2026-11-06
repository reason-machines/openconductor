import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
  await page.goto(process.env.OC_URL ?? "http://localhost:4682/?oc_scenario=populated&oc_theme=dark");
  const trigger = page.getByRole("button", { name: "tide-web actions", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu");
  const actions = menu.getByRole("menuitem");
  await actions.first().waitFor();
  assert.equal(await actions.count(), 5, "all repository actions are present");
  assert.equal(await actions.locator("svg").count(), 5, "each repository action has its Conductor icon");
  assert.equal(await menu.locator("kbd").count(), 0, "dropdown omits context-only shortcuts");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  assert.equal(await page.locator(":focus").innerText(), "Remove repository", "End reaches the final action");
  await page.keyboard.press("Home");
  assert.equal(await page.locator(":focus").innerText(), "Create workspace", "Home reaches the first action");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "Escape closes the menu");
  assert.equal(await trigger.evaluate((e) => e === document.activeElement), true, "closing restores trigger focus");
  await trigger.press("ArrowDown");
  await actions.first().waitFor();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator(":focus").innerText(), "Hide repository", "keyboard selects the intended action");
  await page.keyboard.press("Enter");
  await menu.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Show hidden repositories", exact: true }).waitFor();
  assert.equal(await page.locator('.sb-repo-name').filter({ hasText: /^tide-web$/ }).count(), 0, "keyboard action hides only the selected repository");
  console.log("PASS repository action icons, context-only shortcuts, Home/End, Escape/focus return, keyboard hide action");
} finally {
  await browser.close();
}
