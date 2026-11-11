import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startViteFixture } from "./vite-fixture-server.mjs";

const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find((path) => existsSync(path));

const tabs = (page) => page.getByRole("tablist", { name: "Workspace tabs" });
async function send(page, text) {
  const composer = page.locator(".chat [contenteditable=true]").first();
  await composer.fill(text);
  await composer.press("Enter");
  await page.locator(".chat-scroll", { hasText: `“${text}” was not sent` }).waitFor();
}

test("a fork never commits another chat's transcript and stays unsent until Send", async () => {
  assert.ok(executablePath, "Chrome or Chromium is required");
  const server = process.env.FORK_FIXTURE_BASE ? null : await startViteFixture();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
      localStorage.setItem("openconductor.settings.preview", JSON.stringify({ experimental: { experimental_fork_to_new_tab: true } }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${process.env.FORK_FIXTURE_BASE ?? server.base}/tools/chat/fork-lifecycle-fixture.html?demo=1`);
    await page.locator(".ws-strip").waitFor();
    await send(page, "Explain the router");
    await send(page, "Now add a test");
    const sourceTurns = await page.locator(".chat-scroll .oc-turn").evaluateAll((els) => els.map((el) => el.dataset.turnId));
    assert.equal(sourceTurns.length, 2);
    await page.evaluate(() => {
      window.forkLifecycle.commits.length = 0;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.keyboard.press("Meta+Alt+Enter");
    const fork = tabs(page).getByRole("tab", { name: "Fork of amber-falcon" });
    await fork.waitFor();
    assert.equal(await fork.getAttribute("aria-selected"), "true");
    await page.locator(".composer-attachment", { hasText: "Transcript of amber-falcon.md" }).waitFor();
    const opened = await page.evaluate(() => ({
      commits: [...window.forkLifecycle.commits],
      submits: [...window.forkLifecycle.submits],
      runtime: window.forkLifecycle.runtime(),
    }));
    await tabs(page).getByRole("tab", { name: "amber-falcon", exact: true }).click();
    await page.locator(".chat-scroll", { hasText: "Now add a test" }).waitFor();
    await fork.click();
    await page.locator(".composer-attachment", { hasText: "Transcript of amber-falcon.md" }).waitFor();
    const switched = await page.evaluate(() => [...window.forkLifecycle.commits]);
    await send(page, "Fork positive control");
    const sent = await page.evaluate(() => ({ submits: window.forkLifecycle.submits, runtime: window.forkLifecycle.runtime() }));
    if (process.env.FORK_TRACE_PATH) writeFileSync(process.env.FORK_TRACE_PATH, JSON.stringify({ sourceTurns, opened, switched, sent }, null, 2));
    if (process.env.FORK_SCREENSHOT_PATH) await page.screenshot({ path: process.env.FORK_SCREENSHOT_PATH });

    assert.equal(opened.runtime.length, 2);
    const [source, forkRuntime] = opened.runtime;
    assert.equal(source.messageIds.length, 4, "the source keeps both turns");
    assert.deepEqual(forkRuntime.messageIds, [], "the fork runtime has no messages");
    assert.equal(opened.submits.filter((s) => s.chatId === forkRuntime.chatId).length, 0, "opening a fork never submits it");
    assert.equal(sent.submits.filter((s) => s.chatId === forkRuntime.chatId).length, 1, "the explicit Send targets only the fork");
    assert.equal(sent.runtime[0].messageIds.length, 4, "sending in the fork leaves the source unchanged");
    assert.equal(sent.runtime[1].messageIds.length, 2, "the fork receives only its explicit turn");
    const forkCommits = switched.filter((c) => c.selected === "Fork of amber-falcon");
    assert.ok(forkCommits.length > 0, "the profiler observed fork commits");
    const stale = forkCommits.filter((c) => c.turns.some((id) => sourceTurns.includes(id)));
    assert.deepEqual(stale, [], "no selected fork commit may display source turns, including before passive effects");
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await server?.close();
  }
});
