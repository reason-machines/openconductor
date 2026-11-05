// Queue keys and drag reorder in the browser preview (stand-in agent).
// Usage: npx vite --host 127.0.0.1 --port 5391 --strictPort &
//        TMPDIR=/tmp node tools/e2e/chat-queue-keys.browser.mjs <screenshot folder> [chromium path]
// Short TMPDIR: Chromium refuses a singleton socket path over ~100 bytes.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const OUT = process.argv[2] ?? "/tmp";
const b = await chromium.launch({ executablePath: process.argv[3] ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("http://127.0.0.1:5391/?demo=1");
const box = p.locator(".composer textarea");
await box.waitFor();
const ok = (m) => console.log("ok -", m);
const active = () => p.evaluate(() => document.activeElement?.dataset?.id ? document.activeElement.textContent.trim().split("\n")[0] : document.activeElement?.tagName);
const rows = () => p.$$eval(".queue-list li .queue-text", (els) => els.map((e) => e.textContent.trim()));
await box.fill("one"); await box.press("Enter");
await p.locator('.composer button[title="Stop the agent"]').waitFor();
for (const t of ["two", "three", "four"]) { await box.fill(t); await box.press("Meta+Enter"); }
await p.getByRole("button", { name: "Pause" }).click();
assert.deepEqual(await rows(), ["two", "three", "four"]); ok("three follow-ups queued with ⌘↵, queue paused");
await box.focus(); await box.press("ArrowUp");
assert.match(await active(), /^four/); ok("↑ in the empty composer focuses the last queued row");
await p.keyboard.press("ArrowUp");
assert.match(await active(), /^three/); ok("↑ moves to the previous row");
await p.screenshot({ path: `${OUT}/5-queue-row-focused.png` });
await p.keyboard.press("Backspace");
assert.deepEqual(await rows(), ["two", "four"]); await p.waitForTimeout(100);
assert.match(await active(), /^four/); ok("⌫ deletes the focused row and focuses the next one");
await p.keyboard.press("Home");
assert.match(await active(), /^two/); ok("Home focuses the first row");
await p.keyboard.press("e");
const edit = p.locator('textarea[aria-label="Edit queued message"]');
await edit.waitFor(); ok("E opens the row for editing");
await edit.fill("two, edited"); await edit.press("Escape");
await edit.waitFor({ state: "detached" });
assert.deepEqual(await rows(), ["two", "four"]); ok("Esc (chat.queueEdit.cancel) drops the edit");
await p.locator('.queue-list li[data-id]').first().focus(); await p.keyboard.press("e");
await edit.fill("two, edited"); await edit.press("Enter");
await edit.waitFor({ state: "detached" });
assert.deepEqual(await rows(), ["two, edited", "four"]); ok("↵ (chat.queueEdit.save) saves the edit");
const src = p.locator('.queue-list li[data-id]').nth(1), dst = p.locator('.queue-list li[data-id]').nth(0);
await src.dragTo(dst);
assert.deepEqual(await rows(), ["four", "two, edited"]); ok("dragging the last row onto the first reorders the queue");
await p.screenshot({ path: `${OUT}/6-queue-reordered.png` });
await p.locator('.queue-list li[data-id]').first().focus(); await p.keyboard.press("Escape");
assert.equal(await active(), "TEXTAREA"); ok("Esc on a row goes back to the composer");
await p.locator('.queue-list li[data-id]').last().focus(); await p.keyboard.press("ArrowDown");
assert.equal(await active(), "TEXTAREA"); ok("↓ past the last row goes back to the composer");
assert.deepEqual(errors, []);
await b.close();
