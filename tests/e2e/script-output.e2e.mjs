import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createOutputServer } from "../../tools/terminal/output-server.mjs";

let browser;
let server;
let base = process.env.E2E_BASE;
before(async () => {
  if (!base) {
    server = createOutputServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://localhost:${server.address().port}`;
  }
  const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("Setup tab shows its working indicator before the label only while running", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    await page.goto(`${base}/?kind=setup&setupState=idle`);
    const tab = page.getByRole("tab", { name: /^Setup/ });
    await tab.click();
    const indicators = tab.locator("svg, .setup-dot");
    await page.getByRole("button", { name: "Run setup", exact: true }).waitFor();
    assert.equal(await indicators.count(), 0);
    await page.getByRole("button", { name: "Run setup", exact: true }).click();
    await page.getByRole("button", { name: "Stop setup", exact: true }).waitFor();
    assert.equal(await indicators.locator("circle").count(), 3);
    assert.equal(await tab.evaluate((el) => el.firstElementChild?.tagName.toLowerCase()), "svg");
    assert.equal(await indicators.getAttribute("width"), "10");
    assert.deepEqual(await indicators.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.width, border: style.borderTopWidth };
    }), { width: "10px", border: "0px" });
    if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/setup-running.png` });
    await page.getByRole("button", { name: "Stop setup", exact: true }).click();
    await page.getByRole("button", { name: "Rerun setup", exact: true }).waitFor();
    await indicators.waitFor({ state: "detached" });
    assert.equal(await indicators.count(), 0);
    for (const state of ["completed", "failed", "cancelled"]) {
      await page.getByRole("button", { name: "Rerun setup", exact: true }).click();
      await page.getByRole("button", { name: "Stop setup", exact: true }).waitFor();
      await page.evaluate((value) => window.__scriptOutputTest.finish(value), state);
      await page.getByRole("button", { name: "Rerun setup", exact: true }).waitFor();
      await indicators.waitFor({ state: "detached" });
      assert.equal(await indicators.count(), 0, `${state} has no indicator`);
    }
    if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/setup-finished.png` });
  } finally {
    await page.close();
  }
});

test("terminal tab labels follow visible order after closing siblings", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    await page.goto(`${base}/?kind=setup`);
    const add = page.getByRole("button", { name: "New terminal", exact: true });
    const tabs = page.locator(".term-tab");
    const labels = () => tabs.locator("span:not(.term-dot)").allTextContents();
    await add.click();
    await page.waitForFunction(() => window.__fake.spawns === 1 && document.querySelector(".term-mount .xterm-rows")?.textContent.includes("ada@mac lisbon"));
    assert.deepEqual(await labels(), ["Terminal"]);
    assert.equal(await page.getByRole("button", { name: "Clear terminal scrollback", exact: true }).count(), 0, "scrollback clearing stays a terminal shortcut, not an extra toolbar control");
    assert.equal(await tabs.locator(".term-dot.running").count(), 0);
    await add.click();
    await add.click();
    assert.deepEqual(await labels(), ["Terminal 1", "Terminal 2", "Terminal 3"]);
    await tabs.nth(1).getByRole("button", { name: "Close terminal" }).click();
    assert.deepEqual(await labels(), ["Terminal 1", "Terminal 2"]);
    await tabs.first().getByRole("button", { name: "Close terminal" }).click();
    assert.deepEqual(await labels(), ["Terminal"]);
    assert.equal(await page.evaluate(() => window.__fake.spawns), 3);
    if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/terminal-single.png` });
  } finally {
    await page.close();
  }
});

test("terminal lifecycle indicates starting and a muted normal exit with its code", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    await page.goto(`${base}/?kind=setup`);
    await page.evaluate(() => window.__scriptOutputTest.holdTerminal());
    await page.getByRole("button", { name: "New terminal", exact: true }).click();
    const tab = page.locator(".term-tab");
    const starting = tab.getByRole("img", { name: "Starting", exact: true });
    await starting.waitFor({ timeout: 3000 });
    assert.equal(await starting.locator("circle").count(), 3);
    await page.evaluate(() => window.__scriptOutputTest.terminalReady());
    await page.waitForFunction(() => !document.querySelector(".term-tab .term-starting"));
    assert.equal(await tab.getByRole("img").count(), 0);
    for (const code of [0, 7]) {
      await page.evaluate((value) => window.__scriptOutputTest.terminalExit(value), code);
      const exited = tab.getByRole("img", { name: `Exited (code ${code})`, exact: true });
      await exited.waitFor({ timeout: 3000 });
      assert.equal(await exited.locator("title").textContent(), `Exited (code ${code})`);
      const actual = await exited.evaluate((el) => getComputedStyle(el).color);
      const expected = await exited.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--muted)";
        el.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      assert.equal(actual, expected);
    }
    if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/terminal-exited.png` });
  } finally {
    await page.close();
  }
});

test("interactive terminal retains Find after sharing the controller with script output", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    await page.goto(`${base}/?kind=setup`);
    await page.getByRole("button", { name: "New terminal", exact: true }).click();
    const terminal = page.getByRole("region", { name: "Terminal", exact: true });
    await page.waitForFunction(() => document.querySelector(".term-mount .xterm-rows")?.textContent.includes("ada@mac lisbon"));
    await terminal.locator(".xterm-helper-textarea").focus();
    await page.keyboard.press("Meta+f");
    const search = terminal.getByRole("search", { name: "Find in terminal" });
    const input = search.getByPlaceholder("Find");
    await input.fill("LISBON");
    await search.locator(".term-find-count").filter({ hasText: "1 of 1" }).waitFor();
    await input.press("Escape");
    assert.equal(await search.count(), 0);
    assert.equal(await terminal.locator(".xterm-helper-textarea").evaluate((el) => document.activeElement === el), true);
    assert.equal(await page.evaluate(() => window.__fake.spawns), 1);
  } finally {
    await page.close();
  }
});

for (const kind of ["setup", "run"]) {
  test(`${kind} output supports Find without sending terminal input`, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    try {
      await page.goto(`${base}/?kind=${kind}`);
      await page.getByRole("tab", { name: kind === "setup" ? /^Setup/ : "Run", exact: kind !== "setup" }).click();
      const output = page.getByRole("region", { name: "Script output", exact: true });
      await output.locator(".xterm-helper-textarea").waitFor();
      await page.evaluate(() => window.__scriptOutputTest.emit("Find Target one\r\nFind Target two\r\n"));
      await page.waitForFunction(() => document.querySelector(".script-output .xterm-rows")?.textContent.includes("Find Target two"));
      await output.locator(".xterm-helper-textarea").focus();
      await page.keyboard.press("Meta+f");
      const search = output.getByRole("search", { name: "Find in terminal" });
      const input = search.getByPlaceholder("Find");
      await input.waitFor({ timeout: 3000 });
      assert.equal(await input.evaluate((el) => document.activeElement === el), true);
      await input.fill("find target");
      const counter = search.locator(".term-find-count");
      await counter.filter({ hasText: "1 of 2" }).waitFor();
      await input.press("Enter");
      assert.equal(await counter.innerText(), "2 of 2");
      await input.press("Enter");
      assert.equal(await counter.innerText(), "1 of 2");
      await input.press("Shift+Enter");
      assert.equal(await counter.innerText(), "2 of 2");
      await search.getByRole("button", { name: "Previous match", exact: true }).click();
      assert.equal(await counter.innerText(), "1 of 2");
      assert.equal(await input.evaluate((el) => document.activeElement === el), true);
      await page.evaluate(() => window.__scriptOutputTest.emit("Find Target three\r\n"));
      await counter.filter({ hasText: "1 of 3" }).waitFor();
      await page.keyboard.press("Meta+f");
      assert.equal(await input.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length), true);
      await input.fill("not present in output");
      await counter.filter({ hasText: "0 of 0" }).waitFor();
      assert.equal(await search.getByRole("button", { name: "Next match", exact: true }).isDisabled(), true);
      await input.press("Escape");
      assert.equal(await search.count(), 0);
      assert.equal(await output.locator(".xterm-helper-textarea").evaluate((el) => document.activeElement === el), true);
      const calls = await page.evaluate(() => window.__fake.calls);
      assert.deepEqual(calls.filter((c) => c.cmd.startsWith("pty_")), []);
      if (process.env.OC_SHOT_DIR) {
        await page.keyboard.press("Meta+f");
        await input.fill("find target");
        await counter.filter({ hasText: "1 of 3" }).waitFor();
        await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/${kind}-find.png` });
      }
    } finally {
      await page.close();
    }
  });

  test(`${kind} output renders terminal colors and carriage-return updates without a shell`, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    try {
      await page.goto(`${base}/?kind=${kind}`);
      const tab = (which) => page.getByRole("tab", { name: which === "setup" ? /^Setup/ : "Run", exact: which !== "setup" });
      await tab(kind).click();
      const output = page.getByRole("region", { name: "Script output", exact: true });
      await output.locator(".xterm-rows").waitFor({ timeout: 4000 });
      await page.waitForFunction(() => document.querySelector(".script-output .xterm-rows")?.textContent.includes("Ready on localhost:55000"));
      const text = await output.locator(".xterm-rows").innerText();
      assert.match(text, /Dependencies installed/);
      assert.match(text, /Progress 100%/);
      assert.doesNotMatch(text, /Progress 10%/);
      const green = await output.locator(".xterm-rows span").filter({ hasText: "Dependencies installed" }).first().evaluate((el) => getComputedStyle(el).color);
      assert.equal(green, "rgb(74, 222, 128)");
      const calls = await page.evaluate(() => window.__fake.calls);
      assert.equal(calls.filter((c) => c.cmd === "pty_spawn" || c.cmd === "pty_write").length, 0);
      await page.evaluate(() => window.__scriptOutputTest.emit("Live update\r\n"));
      await page.waitForFunction(() => document.querySelector(".script-output .xterm-rows")?.textContent.includes("Live update"));
      await tab(kind === "setup" ? "run" : "setup").click();
      await tab(kind).click();
      await page.waitForFunction(() => document.querySelector(".script-output .xterm-rows")?.textContent.includes("Live update"));
      await page.setViewportSize({ width: 1000, height: 760 });
      await page.waitForFunction(() => {
        const element = document.querySelector(".script-output");
        return element && element.scrollWidth <= element.clientWidth;
      }, null, { timeout: 3000 });
      assert.equal(await output.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      if (kind === "setup") {
        await page.evaluate(() => window.__scriptOutputTest.finish());
        await page.getByRole("button", { name: "Rerun setup", exact: true }).click();
        await page.evaluate(() => window.__scriptOutputTest.emit("Fresh setup\r\n"));
        await page.waitForFunction(() => document.querySelector(".script-output .xterm-rows")?.textContent.includes("Fresh setup"));
        assert.doesNotMatch(await output.innerText(), /Dependencies installed|Live update/);
      }
    } finally {
      await page.close();
    }
  });
}
