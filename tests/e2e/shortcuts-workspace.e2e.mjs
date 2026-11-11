// One end-to-end check per app-wide shortcut in an open workspace, with real
// key presses (Conductor's registry: src/keybindings/registry.ts, generated
// from evidence/keybindings/keybindings.json). ⌘W / ⌘⇧T are in
// close-tab.e2e.mjs; ⌘B, ⌥⌘/ and the palette's dialog gating in
// shortcuts.e2e.mjs; ⌘J's strip collapse in right-panel.e2e.mjs.
// Run after `npm run build`:
//
//   node --test tests/e2e/shortcuts-workspace.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "./right-panel-fixture.mjs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

// Three workspaces, so ⌘1..⌘3 and back / forward have somewhere to go.
const shell = structuredClone(SHELL);
shell.repos[0].workspaces.push(
  { id: "w2", name: "porto", branch: "ada/two", path: "/Users/demo/code/tide-web/porto" },
  { id: "w3", name: "oslo", branch: "ada/three", path: "/Users/demo/code/tide-web/oslo" },
);

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

async function open() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, { shell, files: FILES });
  await page.goto(base + "/");
  await page.locator(".main-tabs").waitFor();
  return { context, page, errors };
}

/** Press `key` with nothing focused, as after clicking empty space. */
async function press(page, key) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press(key);
}

/** Wait for workspace `name` and the frame after it, once the back / forward history has recorded it. */
async function workspaceShown(page, name) {
  await page.waitForFunction((n) => document.querySelector(".ws-header")?.textContent?.includes(`tide-web/${n}`), name, { timeout: 3000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const dialog = (page, name) => page.getByRole("dialog", { name, exact: true });

test("⌘1..⌘9 switch to the nth workspace in the sidebar (workspace.switchTo1-9)", async () => {
  const { context, page, errors } = await open();
  await workspaceShown(page, "lisbon");
  await press(page, "Meta+2");
  await workspaceShown(page, "porto");
  await press(page, "Meta+3");
  await workspaceShown(page, "oslo");
  await press(page, "Meta+1");
  await workspaceShown(page, "lisbon");
  // No 9th workspace: nothing changes.
  await press(page, "Meta+9");
  await page.waitForTimeout(150);
  await workspaceShown(page, "lisbon");
  assert.deepEqual(errors, []);
  await context.close();
});

test("composer Cmd1 selects its loadout and an empty Cmd2 never switches workspace while typing", async () => {
  const { context, page, errors } = await open();
  await page.getByTestId("composer-model-button").waitFor();
  await page.locator(".composer [contenteditable=true]").first().focus();
  await page.keyboard.press("Meta+1");
  await page.waitForFunction(() => localStorage.getItem("openconductor.agent.w1") === "claude");
  const choice = await page.evaluate(() => JSON.parse(localStorage.getItem("openconductor.composer.model.w1") ?? "null"));
  assert.deepEqual(choice, { agent: "claude", model: "opus", effort: "high", fast: false });
  await page.locator(".composer [contenteditable=true]").first().focus();
  await page.keyboard.press("Meta+2");
  await workspaceShown(page, "lisbon");
  assert.equal(await page.evaluate(() => localStorage.getItem("openconductor.agent.w1")), "claude");
  await press(page, "Meta+2");
  await workspaceShown(page, "porto");
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘[ and ⌘] go back and forward through the workspaces shown (nav.back / nav.forward)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+2");
  await workspaceShown(page, "porto");
  await press(page, "Meta+3");
  await workspaceShown(page, "oslo");
  await press(page, "Meta+BracketLeft");
  await workspaceShown(page, "porto");
  await press(page, "Meta+BracketRight");
  await workspaceShown(page, "oslo");
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘T opens a new Untitled chat tab and shows it (nav.newTab)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+t");
  await page.getByRole("tab", { name: "Untitled", selected: true }).waitFor();
  assert.deepEqual(await page.locator(".main-tabs [role=tab]").allInnerTexts(), ["lisbon", "Untitled"]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘L focuses the chat composer (chat.focus)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+l");
  await page.waitForFunction(() => document.activeElement?.closest(".composer") !== null, null, { timeout: 3000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘P opens Quick open file, also from the composer (nav.quickOpen, global)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+l");
  await page.keyboard.press("Meta+p");
  const qo = dialog(page, "Quick open file");
  await qo.waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains("qo-input"));
  await page.keyboard.press("Escape");
  await qo.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘K opens the command palette with its search focused (toggleCommandPalette)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+k");
  await dialog(page, "Command palette").waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains("palette-input"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘J hides and shows the terminal panel (view.toggleTerminalPanel)", async () => {
  const { context, page, errors } = await open();
  await page.locator(".ws-strip").waitFor();
  await press(page, "Meta+j");
  await page.getByRole("button", { name: "Show terminal panel" }).waitFor();
  await press(page, "Meta+j");
  await page.getByRole("button", { name: "Show terminal panel" }).waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘N opens New workspace (workspace.create)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+n");
  await dialog(page, "New workspace").waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘, opens Settings and Escape returns to the workspace (openSettings, settings.close)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+Comma");
  await page.locator(".settings-nav").waitFor();
  assert.equal(new URL(page.url()).pathname, "/settings/user/general");
  await page.keyboard.press("Escape");
  await page.locator(".settings-nav").waitFor({ state: "detached" });
  await workspaceShown(page, "lisbon");
  assert.deepEqual(errors, []);
  await context.close();
});

test("⌘⇧H opens the Home workspace list (nav.home)", async () => {
  const { context, page, errors } = await open();
  await press(page, "Meta+Shift+h");
  await page.locator(".ws-header").waitFor({ state: "detached" });
  await page.getByRole("listbox", { name: "Workspaces", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Search workspaces", exact: true }).isVisible(), true);
  assert.equal(await page.locator('.sb-row[data-active="true"] .sb-row-label').innerText(), "Home");
  assert.equal(await page.locator(".home-wordmark").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
