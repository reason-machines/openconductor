import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((path) => path && existsSync(path));

let server;
let browser;
let base;
before(async () => {
  assert.ok(executablePath, "Chrome or Chromium is required; set CHROME_PATH");
  assert.ok(existsSync("dist/index.html"), "Build the app before running this test");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  try { await browser?.close(); }
  finally {
    await new Promise((resolve, reject) => {
      if (!server) return resolve();
      server.httpServer.close((error) => error ? reject(error) : resolve());
      server.httpServer.closeAllConnections();
    });
  }
});

async function composer(enabled, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  try {
    await context.addInitScript((value) => {
      localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
      localStorage.setItem("openconductor.settings.preview", JSON.stringify({ general: { auto_convert_long_text: value } }));
    }, enabled);
    const page = await context.newPage();
    await page.goto(`${base}?demo=1`);
    await page.locator(".ws-strip").waitFor();
    const input = page.locator(".chat [contenteditable=true]").first();
    await input.waitFor();
    const modifier = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control");
    const paste = async (text, html) => {
      await input.focus();
      await page.evaluate(async ({ text, html }) => {
        if (html === undefined) await navigator.clipboard.writeText(text);
        else await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
      }, { text, html });
      await page.keyboard.press(`${modifier}+v`);
    };
    await run({ page, input, paste, modifier });
  } finally { await context.close(); }
}

for (const [name, text] of [["5001 code units", "x".repeat(5001)], ["91 lines", Array(91).fill("row").join("\n")]]) {
  test(`enabled long paste converts ${name} to one attachment without replacing the draft`, { timeout: 30_000 }, async () => {
    await composer(true, async ({ page, input, paste }) => {
      await input.fill("keep this draft");
      await paste(text);
      const chip = page.locator(".chat .composer-attachment");
      console.log(JSON.stringify({ longPaste: name, editorLength: (await input.textContent()).length, attachments: await chip.count() }));
      await chip.waitFor({ timeout: 5000 });
      assert.equal(await chip.count(), 1);
      assert.match(await chip.textContent(), /^pasted_text_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt/);
      assert.equal(await input.textContent(), "keep this draft");
      await chip.getByRole("button", { name: /^Remove / }).click();
      assert.equal(await chip.count(), 0);
    });
  });
}

test("disabled conversion and exact lower boundaries retain ordinary editor paste", { timeout: 30_000 }, async () => {
  await composer(false, async ({ page, input, paste }) => {
    const text = "disabled ".repeat(650);
    await paste(text);
    assert.equal(await input.textContent(), text);
    assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
  });
  await composer(true, async ({ page, input, paste, modifier }) => {
    await input.evaluate((node) => {
      const phases = [];
      node.longPasteHistory = phases;
      const record = (event, stage) => {
        const selection = document.getSelection();
        phases.push({
          phase: event.type,
          stage,
          key: event.key,
          inputType: event.inputType,
          defaultPrevented: event.defaultPrevented,
          selectionLength: selection ? selection.toString().length : null,
          selectionCollapsed: selection?.isCollapsed ?? null,
          textLength: node.textContent.length,
          empty: node.dataset.empty,
          focused: node === document.activeElement,
        });
      };
      for (const type of ["beforeinput", "input", "paste", "keydown", "keyup"]) {
        node.addEventListener(type, (event) => record(event, "capture"), { capture: true, passive: true });
        node.addEventListener(type, (event) => record(event, "bubble"), { passive: true });
        document.addEventListener(type, (event) => {
          if (node.contains(event.target)) record(event, "document");
        }, { passive: true });
      }
      document.addEventListener("selectionchange", (event) => {
        const selection = document.getSelection();
        if (node === document.activeElement || node.contains(selection?.anchorNode) || node.contains(selection?.focusNode)) {
          record(event, "document");
        }
      }, { passive: true });
    });
    for (const text of ["x".repeat(5000), Array(90).fill("row").join("\n"), "ordinary paste"]) {
      await input.fill("");
      const afterFill = await input.evaluate((node) => {
        const selection = document.getSelection();
        return {
          textLength: node.textContent.length,
          selectionLength: selection ? selection.toString().length : null,
          selectionCollapsed: selection?.isCollapsed ?? null,
          empty: node.dataset.empty,
          focused: node === document.activeElement,
          events: node.longPasteHistory,
        };
      });
      const clearedLength = afterFill.textLength;
      console.log(JSON.stringify({ longPasteSharedHistory: "after-fill", nextPasteLength: text.length, ...afterFill }));
      assert.equal(clearedLength, 0, "the shared fixture must be empty before each paste");
      await paste(text);
      assert.equal(await input.innerText(), text);
      assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
    }
    await page.keyboard.press(`${modifier}+z`);
    console.log(JSON.stringify({ longPasteSharedHistory: await input.evaluate((node) => ({
      events: node.longPasteHistory,
      undoLength: node.textContent.length,
      empty: node.dataset.empty,
      focused: node === document.activeElement,
    })) }));
    assert.equal(await input.textContent(), "");
  });
});

for (const [name, text] of [["5000 code units", "x".repeat(5000)], ["90 lines", Array(90).fill("row").join("\n")], ["short text", "ordinary paste"]]) {
  test(`isolated ${name} paste retains text, Undo and Redo without an attachment`, { timeout: 30_000 }, async () => {
    await composer(true, async ({ page, input, paste, modifier }) => {
      assert.equal(await input.textContent(), "");
      await paste(text);
      assert.equal(await input.innerText(), text);
      assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
      await page.keyboard.press(`${modifier}+z`);
      const undoLength = (await input.textContent()).length;
      console.log(JSON.stringify({ longPasteIsolatedHistory: name, phase: "undo", textLength: undoLength }));
      assert.equal(await input.textContent(), "");
      await page.keyboard.press(`${modifier}+Shift+z`);
      console.log(JSON.stringify({ longPasteIsolatedHistory: name, phase: "redo", textLength: (await input.textContent()).length }));
      assert.equal(await input.innerText(), text);
      assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
    });
  });
}

test("recognized reference clipboard metadata takes precedence over the long-text threshold", { timeout: 30_000 }, async () => {
  await composer(true, async ({ page, input, paste }) => {
    const text = "metadata ".repeat(650);
    const payload = encodeURIComponent(JSON.stringify({ schemaVersion: 1, kind: "file-contents", path: "/tmp/copied.txt" }));
    for (const html of [
      `<pre data-conductor-clipboard="${payload}">copied content</pre>`,
      '<span data-conductor-cloud-attachment="true" data-conductor-source-session-id="session" data-conductor-source-attachment-id="attachment">cloud content</span>',
    ]) {
      await input.fill("");
      await paste(text, html);
      assert.equal(await input.textContent(), text);
      assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
    }
  });
});

test("mounted paste capture preserves files and atoms, except the retained image/table long-text case", { timeout: 30_000 }, async () => {
  await composer(true, async ({ page, input }) => {
    const text = "x".repeat(5001);
    for (const [type, html, converted] of [
      ["text/plain", "", false],
      ["image/png", "", false],
      ["text/plain", "<table><tr><td>cell</td></tr></table>", false],
      ["image/png", "<table><tr><td>cell</td></tr></table>", true],
    ]) {
      await input.fill("keep");
      await input.evaluate((node, data) => {
        const clipboardData = new DataTransfer();
        clipboardData.items.add(new File(["fixture"], "clipboard-file.txt", { type: data.type }));
        clipboardData.setData("text/plain", data.text);
        if (data.html) clipboardData.setData("text/html", data.html);
        node.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
      }, { type, html, text });
      const chip = page.locator(".chat .composer-attachment");
      await chip.waitFor();
      assert.equal(await chip.count(), 1);
      assert.match(await chip.textContent(), converted ? /^pasted_text_/ : /^clipboard-file\.txt/);
      assert.equal(await input.textContent(), "keep");
      await chip.getByRole("button", { name: /^Remove / }).click();
    }
    await input.fill("");
    await input.evaluate((node, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      clipboardData.setData("application/x-openconductor-composer+json", JSON.stringify([{ kind: "text", text: "atomic content" }]));
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, text);
    assert.equal(await input.textContent(), "atomic content");
    assert.equal(await page.locator(".chat .composer-attachment").count(), 0);
  });
});
