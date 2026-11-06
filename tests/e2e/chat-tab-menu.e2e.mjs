// A chat tab's right-click menu (Conductor 0.87.6 `u8i`, src/features/chat/ChatTabMenu.tsx)
// on the demo state (`?demo=1`, whose stand-in agent answers each message): item order,
// separators, hints and disabled states, and what each enabled item does: both transcript
// copies, Copy link, Fork to new tab (Experimental setting), Close tab and Close others.
// Run after `npm run build`:
//
//   node --test tests/e2e/chat-tab-menu.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

async function openDemo({ forkSetting = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"], reducedMotion: "reduce" });
  await context.addInitScript((fork) => {
    localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
    if (fork) localStorage.setItem("openconductor.settings.preview", JSON.stringify({ experimental: { experimental_fork_to_new_tab: true } }));
  }, forkSetting);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`${base}/?demo=1`);
  await page.locator(".ws-strip").waitFor();
  return { context, page, errors };
}

async function send(page, text) {
  const composer = page.locator(".chat textarea").first();
  await composer.fill(text);
  await composer.press("Enter");
  await page.locator(".chat-scroll", { hasText: `“${text}” was not sent` }).waitFor();
}

const tabs = (page) => page.getByRole("tablist", { name: "Workspace tabs" });
const menu = (page) => page.getByRole("menu", { name: "Chat actions" });

/** Right-click the tab named `name`; resolves to the menu's rows as [label, hint, disabled] or "──". */
async function openMenu(page, name) {
  await tabs(page).getByRole("tab", { name, exact: true }).click({ button: "right" });
  await menu(page).waitFor();
  return menu(page).evaluate((el) =>
    [...el.children].map((c) =>
      c.getAttribute("role") === "separator"
        ? "──"
        : [c.childNodes[0]?.textContent ?? "", c.querySelector(".cm-shortcut")?.textContent ?? "", c.hasAttribute("data-disabled")],
    ),
  );
}

async function pick(page, item) {
  // A hint is part of the item's accessible name ("Copy concise transcript⌘⌥C").
  await menu(page).getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
  await menu(page).waitFor({ state: "detached" });
}

test("order, hints and disabled states follow Conductor's u8i", async () => {
  const { context, page, errors } = await openDemo();
  // The workspace's only chat, empty: no Close section (Conductor's showClose).
  assert.deepEqual(await openMenu(page, "amber-falcon"), [
    ["Mark as unread", "", false],
    ["Rename chat", "", true],
    "──",
    ["Copy concise transcript", "⌘⌥C", false],
    ["Copy full transcript", "", false],
    ["Copy link", "", false],
  ]);
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });

  // With a message the Close section shows; the workspace chat cannot close yet (#524) and is alone.
  await send(page, "Explain the router");
  assert.deepEqual((await openMenu(page, "amber-falcon")).slice(-3), ["──", ["Close tab", "⌘W", true], ["Close others", "", true]]);
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  await context.close();
});

test("copy items put the transcripts and the chat link on the clipboard", async () => {
  const { context, page, errors } = await openDemo();
  const clip = () => page.evaluate(() => navigator.clipboard.readText());

  await openMenu(page, "amber-falcon");
  await pick(page, "Copy full transcript");
  await page.locator(".toast", { hasText: "No chat content to copy" }).waitFor();

  await send(page, "Explain the router");
  await openMenu(page, "amber-falcon");
  await pick(page, "Copy concise transcript");
  await page.locator(".toast", { hasText: 'Copied concise transcript of "amber-falcon"' }).waitFor();
  assert.match(await clip(), /^## User\n\nExplain the router\n\n## Assistant\n\nBrowser preview: /);

  await openMenu(page, "amber-falcon");
  await pick(page, "Copy full transcript");
  await page.locator(".toast", { hasText: 'Copied complete transcript of "amber-falcon"' }).waitFor();
  assert.match(await clip(), /^## User\n\nExplain the router\n\n## Assistant\n\n/);

  await openMenu(page, "amber-falcon");
  await pick(page, "Copy link");
  await page.locator(".toast", { hasText: "Copied link" }).waitFor();
  assert.match(await clip(), /^openconductor:\/\/workspace\?id=[^&]+&session=[^&]+$/);

  assert.deepEqual(errors, []);
  await context.close();
});

test("Fork to new tab (setting on), Close others and Close tab", async () => {
  const { context, page, errors } = await openDemo({ forkSetting: true });
  await send(page, "Explain the router");
  const rows = await openMenu(page, "amber-falcon");
  assert.deepEqual(rows[2], ["Fork to new tab", "⌘⌥", false], "Fork sits under Rename chat with the ⌘⌥ + Enter glyph hint");
  assert.equal(await menu(page).getByRole("img", { name: "Enter" }).count(), 1);
  await pick(page, "Fork to new tab");
  const fork = tabs(page).getByRole("tab", { name: "Fork of amber-falcon" });
  await fork.waitFor();
  assert.equal(await fork.getAttribute("aria-selected"), "true");
  await page.locator(".chat").getByText("Transcript of amber-falcon.md").waitFor();

  // A second chat: Close others on the fork closes every other closable chat and shows the fork.
  await page.locator(".main-tab-new-button").click();
  await tabs(page).getByRole("tab", { name: "Untitled" }).waitFor();
  await openMenu(page, "Fork of amber-falcon");
  await pick(page, "Close others");
  await page.waitForTimeout(100);
  assert.equal(await tabs(page).getByRole("tab", { name: "Untitled" }).count(), 0);
  assert.equal(await fork.getAttribute("aria-selected"), "true");

  // Close tab on the fork closes it.
  const forkRows = await openMenu(page, "Fork of amber-falcon");
  assert.deepEqual(forkRows.at(-2), ["Close tab", "⌘W", false]);
  await pick(page, "Close tab");
  await page.waitForTimeout(100);
  assert.equal(await fork.count(), 0);

  assert.deepEqual(errors, []);
  await context.close();
});
