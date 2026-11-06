// The right-click menus on a chat tab, a changed file and the PR badge, as Conductor
// draws them (renderApp-D_fmY7hW.js, read with REA on sven m5 max as data): `u8i` on a
// chat tab, `Svs` on a Changes row and `w_i` on the header's PR badge. On the demo state
// (`?demo=1`, whose stand-in agent answers each message and whose PR scenario "ready"
// is PR #42). Run after `npm run build`:
//
//   node --test tests/e2e/shell-context-menus.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
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
const SHOTS = process.env.E2E_SHOTS_DIR;

let server;
let browser;
let base;

before(async () => {
  assert.ok(executablePath, `no Chrome or Chromium found; set CHROME_PATH (tried ${CANDIDATES.join(", ")})`);
  assert.ok(existsSync("dist/index.html"), "dist/ is missing; run `npm run build` first");
  server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.httpServer.close(resolve));
});

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(250); // past the menu's 100ms fade-in
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openDemo({ forkSetting = false, pr } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: "dark", permissions: ["clipboard-read", "clipboard-write"], reducedMotion: "reduce" });
  await context.addInitScript(
    ({ fork, pr }) => {
      localStorage.setItem("openconductor.firstRunOnboardingStep", "999");
      if (fork) localStorage.setItem("openconductor.settings.preview", JSON.stringify({ experimental: { experimental_fork_to_new_tab: true } }));
      if (pr) localStorage.setItem("openconductor.pr.demo", pr);
      window.__opened = [];
      window.open = (url) => void window.__opened.push(String(url));
    },
    { fork: forkSetting, pr },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`${base}/?demo=1`);
  await page.locator(".ws-strip").waitFor();
  return { context, page, errors };
}

async function send(page, text) {
  const composer = page.locator(".chat [contenteditable=true]").first();
  await composer.fill(text);
  await composer.press("Enter");
  await page.locator(".chat-scroll", { hasText: `“${text}” was not sent` }).waitFor();
}

const tabs = (page) => page.getByRole("tablist", { name: "Workspace tabs" });
const items = (menu) => menu.locator("[role=menuitem]").allInnerTexts();
const clean = (texts) => texts.map((t) => t.replace(/\s+/g, " ").trim());

test("a chat tab's menu: Conductor's items in order, copies, rename, fork, close others", async () => {
  const { context, page, errors } = await openDemo({ forkSetting: true });
  await send(page, "Explain the router");
  const main = tabs(page).getByRole("tab", { name: "amber-falcon" });
  const menu = page.getByRole("menu", { name: "Chat actions" });

  // Conductor's item order; the workspace's own chat cannot close here, and it is the only chat.
  await main.click({ button: "right" });
  await menu.waitFor();
  assert.deepEqual(clean(await items(menu)), ["Mark as unread", "Rename chat", "Fork to new tab ⌘⌥", "Copy concise transcript ⌘⌥C", "Copy full transcript", "Copy link", "Close tab ⌘W", "Close others"]);
  assert.equal(await menu.locator("[role=separator]").count(), 2);
  assert.deepEqual(clean(await menu.locator("[role=menuitem][aria-disabled=true]").allInnerTexts()), ["Close tab ⌘W", "Close others"]);
  await shot(page, "chat-tab-menu-main");

  await menu.getByRole("menuitem", { name: "Copy full transcript" }).click();
  await page.locator(".toast", { hasText: 'Copied complete transcript of "amber-falcon"' }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^## User\n\nExplain the router\n\n## Assistant\n\n/);

  await main.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Copy link" }).click();
  await page.locator(".toast", { hasText: "Copied link" }).last().waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^openconductor:\/\/workspace\?id=.+&session=/);

  // Rename chat: the dialog starts on the title; OK renames the tab.
  await main.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Rename chat" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename chat" });
  await dialog.waitFor();
  assert.equal(await dialog.locator("input").inputValue(), "amber-falcon");
  await shot(page, "rename-chat-dialog");
  await dialog.locator("input").fill("Router notes");
  await dialog.getByRole("button", { name: "OK" }).click();
  const renamed = tabs(page).getByRole("tab", { name: "Router notes" });
  await renamed.waitFor();

  // Fork to new tab opens "Fork of …"; that tab can close, so its menu ends with Close tab / Close others.
  await renamed.click({ button: "right" });
  await menu.getByRole("menuitem", { name: /Fork to new tab/ }).click();
  const fork = tabs(page).getByRole("tab", { name: "Fork of Router notes" });
  await fork.waitFor();
  await fork.click({ button: "right" });
  assert.deepEqual(clean(await items(menu)).slice(-2), ["Close tab ⌘W", "Close others"]);
  await shot(page, "chat-tab-menu-fork");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });

  // Close others on the fork closes every other closable chat and shows the fork.
  await page.locator(".main-tab-new-button").click();
  assert.equal(await tabs(page).getByRole("tab").count(), 3);
  await fork.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Close others" }).click();
  await page.waitForTimeout(150);
  assert.deepEqual(clean(await tabs(page).getByRole("tab").allInnerTexts()), ["Router notes", "Fork of Router notes"]);
  assert.equal(await fork.getAttribute("aria-selected"), "true");

  // Close tab.
  await fork.click({ button: "right" });
  await menu.getByRole("menuitem", { name: /Close tab/ }).click();
  await fork.waitFor({ state: "detached" });

  assert.deepEqual(errors, []);
  await context.close();
});

test("without the experimental setting the chat tab menu has no Fork to new tab", async () => {
  const { context, page, errors } = await openDemo();
  await tabs(page).getByRole("tab", { name: "amber-falcon" }).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Chat actions" });
  await menu.waitFor();
  assert.ok(!clean(await items(menu)).some((t) => t.startsWith("Fork")));
  assert.deepEqual(errors, []);
  await context.close();
});

test("a changed file's menu: View, Copy path, Copy relative path, Discard changes, with icons", async () => {
  const { context, page, errors } = await openDemo();
  const row = page.locator(".oc-change-row").first();
  await row.waitFor();
  const path = (await row.locator(".name").innerText()).trim();
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { name: `Actions for ${path}` });
  await menu.waitFor();
  const labels = clean(await items(menu));
  assert.equal(labels[0], "View");
  assert.deepEqual(labels.slice(-2), ["Copy relative path", "Discard changes"]);
  assert.equal(await menu.locator("[role=menuitem] > svg:first-child").count(), labels.length, "every item has its icon");
  await shot(page, "changes-file-menu");
  await menu.getByRole("menuitem", { name: "Copy relative path" }).click();
  await page.locator(".toast", { hasText: "Copied relative path to clipboard" }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), path);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the PR badge's menu opens the PR on each site and copies its link and number", async () => {
  const { context, page, errors } = await openDemo({ pr: "ready" });
  const badge = page.locator(".pr-chip", { hasText: "PR #42" });
  await badge.waitFor();
  await badge.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "PR #42 actions" });
  await menu.waitFor();
  assert.deepEqual(clean(await items(menu)), ["Open in GitHub ⌘⇧G", "Open in Linear", "Open in Graphite", "Copy link", "Copy number"]);
  await shot(page, "pr-badge-menu");
  await menu.getByRole("menuitem", { name: "Copy number" }).click();
  await page.locator(".toast", { hasText: "Copied PR number to clipboard" }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "42");
  await badge.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Open in Linear" }).click();
  await page.waitForFunction(() => window.__opened.length > 0);
  assert.deepEqual(await page.evaluate(() => window.__opened), ["https://linear.review/acme/web/pull/42"]);
  assert.deepEqual(errors, []);
  await context.close();
});
