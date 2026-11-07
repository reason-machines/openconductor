import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.ORIGIN ?? "http://localhost:4427";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-composer-check-"));
const checks = [];
const editor = page.locator(".composer [contenteditable=true]");
const result = () => page.locator("[data-testid=composer-result]").textContent();
const open = (query = "") => page.goto(`${origin}/tools/composer/demo.html?agent=claude${query}`);
try {
  await open();
  assert.equal(await page.locator(".oc-send").isEnabled(), false);
  await editor.fill("@README");
  await page.getByRole("option", { name: "README.md" }).waitFor();
  await editor.press("Enter");
  assert.equal(await page.locator(".oc-file-chip").textContent(), "README.md");
  assert.equal(await result(), "");
  await editor.press("Enter");
  assert.equal(JSON.parse(await result()).text, "@README.md");
  checks.push("Enter picks an atomic chip before a second Enter submits its readable path");
  await editor.press("Control+z");
  assert.equal(await page.locator(".oc-file-chip").count(), 0);
  assert.equal(await editor.textContent(), "");
  checks.push("Undo after Send cannot resurrect a sent draft");

  await editor.fill("@README");
  await page.getByRole("option", { name: "README.md" }).waitFor();
  await editor.press("Enter");
  await editor.press("Control+z");
  assert.equal(await page.locator(".oc-file-chip").count(), 0);
  assert.equal(await editor.innerText(), "@README");
  await editor.press("Control+Shift+z");
  assert.equal(await page.locator(".oc-file-chip").count(), 1);
  await editor.press("Backspace");
  await editor.press("Backspace");
  if (await page.locator(".oc-file-chip.ProseMirror-selectednode").count()) await editor.press("Backspace");
  assert.equal(await page.locator(".oc-file-chip").count(), 0);
  await editor.press("Control+z");
  assert.equal(await page.locator(".oc-file-chip").count(), 1);
  checks.push("Picking, undo/redo and whole-chip backspace are atomic");

  await page.evaluate(() => {
    window.__composerClipboardTest = [];
    for (const type of ["copy", "paste"]) document.addEventListener(type, (event) => window.__composerClipboardTest.push({ type, types: [...event.clipboardData.types], text: event.clipboardData.getData("text/plain"), custom: event.clipboardData.getData("application/x-openconductor-composer+json") }));
  });
  await editor.press("Control+a");
  assert.match(await editor.evaluate(() => getSelection()?.toString() ?? ""), /README/);
  await editor.press("Control+c");
  await editor.press("ArrowRight");
  await editor.press("Control+v");
  await page.waitForFunction(() => document.querySelectorAll(".oc-file-chip").length === 2);
  await editor.press("Control+a");
  await editor.press("Control+x");
  assert.equal(await page.locator(".oc-file-chip").count(), 0);
  await editor.press("Control+v");
  await page.waitForFunction(() => document.querySelectorAll(".oc-file-chip").length === 2);
  await editor.press("Enter");
  assert.equal(JSON.parse(await result()).text, "@README.md @README.md");
  checks.push("Same-app copy/paste and cut preserve atoms");

  await page.evaluate(async () => navigator.clipboard.write([new ClipboardItem({
    "text/plain": new Blob(["<b>literal</b>\nsecond"], { type: "text/plain" }),
    "text/html": new Blob(["<b>formatted</b>"], { type: "text/html" }),
  })]));
  await editor.press("Control+v");
  assert.equal(await editor.locator("b, strong").count(), 0);
  await editor.press("Enter");
  assert.equal(JSON.parse(await result()).text, "<b>literal</b>\nsecond");
  checks.push("External rich clipboard input uses literal plain text and preserves newlines");

  await editor.fill("composition");
  const beforeComposition = await result();
  await editor.dispatchEvent("compositionstart", { data: "" });
  await editor.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
  assert.equal(await result(), beforeComposition);
  await editor.dispatchEvent("compositionend", { data: "composition" });
  assert.equal(await editor.textContent(), "composition");
  checks.push("Synthetic composition Enter is not submitted (not a real IME test)");

  await editor.fill("@src");
  const options = page.getByRole("option");
  await options.first().waitFor();
  const second = (await options.nth(1).textContent()).trim();
  await editor.press("ArrowDown");
  assert.equal(await options.nth(1).getAttribute("aria-selected"), "true");
  await editor.press("Tab");
  assert.ok((await page.locator(".oc-file-chip").getAttribute("data-mention-path")).startsWith("src/"));
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
  assert.match(await editor.innerText(), /Line 30/);
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

  await open("&editing-checks=1");
  await editor.fill("@README");
  await page.getByRole("option", { name: "README.md" }).waitFor();
  await editor.press("Enter");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await editor.fill("discarded draft");
  await page.getByRole("button", { name: "Restore draft", exact: true }).click();
  assert.equal(await page.locator(".oc-file-chip").count(), 1);
  await editor.press("Control+z");
  assert.equal(await page.locator(".oc-file-chip").count(), 1);
  await page.getByRole("button", { name: "Insert review note", exact: true }).click();
  assert.equal(await page.locator(".oc-file-chip").count(), 1);
  await editor.press("Enter");
  assert.equal(JSON.parse(await result()).text, "@README.md\n\nReview note");
  checks.push("Draft restoration resets editor history and external review-note insertion preserves the chip");

  const report = { passed: checks.length, checks };
  const output = process.env.OUTPUT ?? "evidence/chat/composer/current";
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("composer DOM at failure:", await editor.innerHTML());
  console.error("selection at failure:", await editor.evaluate(() => getSelection()?.toString()));
  console.error("clipboard trace:", await page.evaluate(() => window.__composerClipboardTest));
  await page.screenshot({ path: "evidence/chat/composer/mentions/check-failure.png" });
  throw error;
} finally {
  await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
