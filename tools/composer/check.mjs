import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.ORIGIN ?? "http://localhost:4427";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-composer-check-"));
const checks = [];
const editor = page.locator(".composer textarea");
const result = () => page.locator("[data-testid=composer-result]").textContent();
const open = (query = "") => page.goto(`${origin}/tools/composer/demo.html?agent=claude${query}`);
try {
  await open();
  assert.equal(await page.locator(".oc-send").isEnabled(), false);
  await editor.fill("@README");
  await page.getByRole("option", { name: "README.md" }).waitFor();
  await editor.press("Enter");
  assert.equal(await editor.inputValue(), "@README.md ");
  assert.equal(await result(), "");
  await editor.press("Enter");
  assert.equal(JSON.parse(await result()).text, "@README.md");
  checks.push("Enter picks a file before a second Enter submits its path");

  await editor.fill("@src");
  const options = page.getByRole("option");
  await options.first().waitFor();
  const second = (await options.nth(1).textContent()).trim();
  await editor.press("ArrowDown");
  assert.equal(await options.nth(1).getAttribute("aria-selected"), "true");
  await editor.press("Tab");
  assert.ok((await editor.inputValue()).startsWith("@src/"));
  assert.ok(second.length > 0);
  checks.push("ArrowDown and Tab pick a ranked result");

  await editor.fill("ada@example.com");
  assert.equal(await page.getByRole("listbox", { name: "Mention files" }).count(), 0);
  await editor.fill("@README");
  await page.getByRole("option").first().waitFor();
  await editor.press("Escape");
  assert.equal(await page.getByRole("listbox", { name: "Mention files" }).count(), 0);
  await editor.fill("/");
  await page.getByRole("listbox", { name: "Slash commands" }).waitFor();
  checks.push("Email text does not open mentions, Escape dismisses, slash menu still works");

  await editor.fill(Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join("\n"));
  const height = await page.locator(".oc-composer-input").evaluate((element) => element.getBoundingClientRect().height);
  assert.equal(height, 188);
  await editor.fill("single line");
  assert.equal(await page.locator(".composer").evaluate((element) => element.getBoundingClientRect().height), 152);
  checks.push("Multiline input scrolls at 188px and shrinks back to the 152px box");

  await editor.fill("");
  const file = path.join(temp, "notes.txt");
  fs.writeFileSync(file, "Disposable composer attachment test\n");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByLabel("Attachments", { exact: true }).waitFor();
  assert.equal(await page.locator(".oc-send").isEnabled(), true);
  await page.locator(".oc-send").click();
  assert.deepEqual(JSON.parse(await result()), { text: "", mode: "queue", files: ["notes.txt"] });
  assert.equal(await page.getByLabel("Attachments", { exact: true }).count(), 0);
  checks.push("An attachment with empty text enables Send and is delivered, then cleared");

  await open("&working=1&queued=1");
  await page.getByRole("button", { name: /Stop the agent/ }).waitFor();
  assert.equal(await page.locator(".oc-send").count(), 0);
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.locator(".oc-send").waitFor();
  assert.equal(await page.locator(".oc-send").getAttribute("data-mode"), "queue");
  await page.locator(".oc-send").click();
  assert.equal(JSON.parse(await result()).mode, "queue");
  await page.getByRole("button", { name: /Stop the agent/ }).click();
  assert.equal(await page.getByRole("button", { name: /Stop the agent/ }).count(), 0);
  checks.push("Working state shows Stop, attachment-only queued follow-up shows Queue, Stop returns idle");

  const report = { passed: checks.length, checks };
  fs.mkdirSync("evidence/chat/composer/current", { recursive: true });
  fs.writeFileSync("evidence/chat/composer/current/checks.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
