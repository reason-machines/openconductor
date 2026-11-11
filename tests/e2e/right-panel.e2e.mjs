// The workspace's right panel as Conductor draws it (REA reference capture
// evidence/screens/chat--transcript-collapsed-tools--dark.png): All files /
// Changes N / Checks with the tab's icons at the right end, the All files tree,
// and under it the Setup / Run / Terminal strip with its chevron and +.
// Run after `npm run build`:
//
//   node --test tests/e2e/right-panel.e2e.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, WT, fakeBackend } from "./right-panel-fixture.mjs";

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
  if (process.env.OC_E2E_BASE) base = process.env.OC_E2E_BASE;
  else {
    server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
});

async function open({ spotlight = false, shell = SHELL } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, { shell, files: FILES, spotlight });
  await page.goto(base + "/");
  await page.locator(".rp-tabs").waitFor();
  return { context, page, errors };
}

const calls = (page, cmd) => page.evaluate((c) => window.__fake.calls.filter((x) => x.cmd === c), cmd);
const rowNames = (page) => page.locator(".oc-files [role=treeitem] .name").allInnerTexts();

test("tabs: All files, Changes with its count, Checks; each tab brings its own icons", async () => {
  const { context, page, errors } = await open();
  const tabs = page.locator(".rp-tabs [role=tab]");
  await page.waitForFunction(() => document.querySelector(".rp-tabs .tab-count")?.textContent === "2");
  assert.deepEqual(await tabs.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim())), ["All files", "Changes 2", "Checks"]);
  assert.equal(await page.getByRole("tab", { name: "Changes 2" }).getAttribute("aria-selected"), "true");
  // The tree's icons show only on All files.
  assert.equal(await page.getByRole("button", { name: "Collapse folders" }).count(), 0);
  await page.getByRole("tab", { name: "All files" }).click();
  for (const name of ["Collapse folders", "Filter files", "New file"]) await page.getByRole("button", { name, exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("Changes: sorted flat rows, compressed hierarchy, collapsing counts, filtering and scope options", async () => {
  const { context, page, errors } = await open();
  const changed = page.locator('nav[aria-label="Changed files"]');
  await changed.locator(".oc-change").first().waitFor();
  assert.deepEqual(await changed.locator(".oc-change .name").allTextContents(), ["src/lib/auth.test.ts", "src/lib/auth.ts"]);
  assert.equal(await page.getByRole("button", { name: "Refresh", exact: true }).count(), 0);
  assert.equal(await changed.getByRole("img", { name: "untracked", exact: true }).count(), 2);
  await page.getByRole("button", { name: "Show folder hierarchy", exact: true }).click();
  const folder = changed.getByRole("button", { name: "src / lib", exact: true });
  assert.equal(await folder.getAttribute("aria-expanded"), "true");
  await folder.click();
  assert.equal(await folder.getAttribute("aria-expanded"), "false");
  assert.equal(await changed.locator(".oc-change").count(), 0);
  assert.match(await folder.innerText(), /\+15/);
  assert.match(await folder.innerText(), /-1/);
  await page.getByRole("button", { name: "Filter files", exact: true }).click();
  const filter = page.getByRole("textbox", { name: "Filter changed files" });
  await filter.fill("test");
  assert.equal(await folder.getAttribute("aria-expanded"), "false");
  assert.equal(await changed.locator(".oc-change").count(), 0);
  assert.equal(await page.locator(".oc-changes-filter-count").textContent(), "1 of 2");
  await folder.click();
  assert.equal(await folder.getAttribute("aria-expanded"), "true");
  assert.equal(await changed.locator(".oc-change").count(), 1);
  await changed.locator(".oc-change").click();
  await page.locator(".oc-path-chip").filter({ hasText: "auth.test.ts" }).waitFor();
  assert.equal(await changed.locator(".oc-change").getAttribute("aria-current"), "true");
  await folder.click();
  assert.equal(await folder.getAttribute("aria-expanded"), "false");
  assert.equal(await changed.locator(".oc-change").count(), 0);
  await filter.press("Escape");
  assert.equal(await filter.count(), 0);
  assert.equal(await changed.locator(".oc-change").count(), 0);
  await page.getByRole("button", { name: "Show flat list", exact: true }).click();
  assert.equal(await changed.locator(".oc-change").count(), 2);
  const options = page.getByRole("button", { name: "Changes options", exact: true });
  await options.click();
  const popup = page.getByRole("menu", { name: "Changes options", exact: true });
  await popup.waitFor();
  const popupBounds = await popup.boundingBox();
  const triggerBounds = await options.boundingBox();
  assert.ok(popupBounds && triggerBounds);
  assert.ok(Math.abs(popupBounds.x + popupBounds.width - triggerBounds.x - triggerBounds.width) < 1);
  await page.getByRole("menuitem", { name: /Uncommitted changes/ }).click();
  await page.getByRole("button", { name: "Back to all changes", exact: true }).waitFor();
  await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === "diff_workspace" && c.request.scope.kind === "uncommitted"));
  await page.getByRole("button", { name: "Back to all changes", exact: true }).click();
  await page.getByRole("button", { name: "Changes options", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test("Changes: each workspace retains its hierarchy, collapsed folders and filter after leaving and reloading", async () => {
  const shell = structuredClone(SHELL);
  shell.repos[0].workspaces.push({ id: "w2", name: "porto", branch: "ada/porto", path: WT + "-porto" });
  const { context, page, errors } = await open({ shell });
  try {
    const changed = page.locator('nav[aria-label="Changed files"]');
    await changed.locator(".oc-change").first().waitFor();
    await page.getByRole("button", { name: "Show folder hierarchy", exact: true }).click();
    const folder = changed.getByRole("button", { name: "src / lib", exact: true });
    await folder.click();
    await page.getByRole("tab", { name: "All files", exact: true }).click();
    await page.getByRole("tab", { name: "Changes 2", exact: true }).click();
    assert.equal(await folder.getAttribute("aria-expanded"), "false", "collapsed folders survive a panel-tab switch");
    await page.getByRole("button", { name: "Filter files", exact: true }).click();
    await page.getByRole("textbox", { name: "Filter changed files" }).fill("test");
    const workspace = (name) => page.locator('[data-testid="left-sidebar-workspace-item"]').filter({ has: page.locator(".sb-ws-name", { hasText: name }) });
    await workspace("porto").click();
    await page.getByRole("button", { name: "Show folder hierarchy", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Filter changed files" }).count(), 0);
    await workspace("lisbon").click();
    await page.getByRole("button", { name: "Show flat list", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Filter changed files" }).inputValue(), "test");
    assert.equal(await folder.getAttribute("aria-expanded"), "false", "filtering retains the collapsed directory");
    assert.equal(await changed.locator(".oc-change").count(), 0);
    assert.equal(await page.locator(".oc-changes-filter-count").textContent(), "1 of 2");
    await page.reload();
    await page.getByRole("button", { name: "Show flat list", exact: true }).waitFor();
    const filter = page.getByRole("textbox", { name: "Filter changed files" });
    assert.equal(await filter.inputValue(), "test", "the filter survives a reload");
    assert.equal(await folder.getAttribute("aria-expanded"), "false", "the filtered directory stays collapsed after reload");
    assert.equal(await changed.locator(".oc-change").count(), 0);
    assert.equal(await page.locator(".oc-changes-filter-count").textContent(), "1 of 2");
    await folder.click();
    assert.equal(await folder.getAttribute("aria-expanded"), "true");
    assert.equal(await changed.locator(".oc-change").count(), 1);
    await folder.click();
    assert.equal(await folder.getAttribute("aria-expanded"), "false");
    assert.equal(await changed.locator(".oc-change").count(), 0);
    await filter.press("Escape");
    assert.equal(await folder.getAttribute("aria-expanded"), "false", "filtering does not overwrite collapsed folders");
    await page.reload();
    await folder.waitFor();
    assert.equal(await folder.getAttribute("aria-expanded"), "false");
    assert.equal(await page.getByRole("textbox", { name: "Filter changed files" }).count(), 0, "clearing the filter is persisted");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("Changes: discard confirmation matches the alert layout and Cancel never discards", async () => {
  const { context, page, errors } = await open();
  try {
    await page.locator('.oc-change[title="Open src/lib/auth.test.ts"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Discard changes", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Discard file changes?" });
    await dialog.waitFor({ timeout: 2000 });
    const metrics = await dialog.evaluate((el) => ({
      width: el.offsetWidth,
      padding: getComputedStyle(el).padding,
      titleSize: getComputedStyle(el.querySelector("h2")).fontSize,
    }));
    assert.deepEqual(metrics, { width: 512, padding: "24px", titleSize: "18px" });
    assert.equal(await dialog.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby"))?.textContent), "Discard all changes to src/lib/auth.test.ts? This action cannot be undone.");
    assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).count(), 0);
    await page.waitForFunction(() => document.activeElement?.textContent === "Cancel");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await calls(page, "diff_discard_file"), []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("Changes: discard shortcut sends the selected file once, blocks dismissal while pending and retries an error", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
    await page.addInitScript(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (cmd, args) => {
        if (cmd !== "diff_discard_file") return invoke(cmd, args);
        window.__fake.calls.push({ cmd, ...args });
        return new Promise((resolve, reject) => { window.__finishDiscard = { resolve, reject }; });
      };
    });
    await page.goto(base + "/");
    await page.locator('.oc-change[title="Open src/lib/auth.test.ts"]').hover();
    await page.getByRole("button", { name: "Discard changes to src/lib/auth.test.ts", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Discard file changes?" });
    await dialog.waitFor({ timeout: 2000 });
    await dialog.press("Meta+Enter");
    await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === "diff_discard_file"));
    assert.equal(await dialog.getByRole("button", { name: "Discarding…", exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
    await dialog.press("Meta+Enter");
    await dialog.press("Escape");
    assert.equal(await dialog.isVisible(), true);
    const requests = await calls(page, "diff_discard_file");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].repo, WT);
    assert.equal(requests[0].request.path, "src/lib/auth.test.ts");
    assert.equal(requests[0].request.scope.kind, "all");
    await page.evaluate(() => window.__finishDiscard.reject(new Error("fixture refused discard")));
    await dialog.getByText("Couldn't discard: Error: fixture refused discard", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: /^Discard / }).click();
    await page.waitForFunction(() => window.__fake.calls.filter((c) => c.cmd === "diff_discard_file").length === 2);
    await page.evaluate(() => window.__finishDiscard.resolve());
    await dialog.waitFor({ state: "detached" });
  } finally {
    await context.close();
  }
});

test("Changes: external edits refresh without a Reload button", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
    await page.addInitScript(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__diffFiles = [];
      window.__TAURI_INTERNALS__.invoke = (cmd, args) => cmd === "diff_workspace"
        ? Promise.resolve({ files: window.__diffFiles })
        : invoke(cmd, args);
    });
    await page.goto(base + "/");
    await page.getByText("No changes on this branch yet.", { exact: true }).waitFor();
    assert.equal(await page.locator('.oc-diff-toolbar button[title="Reload changes"]').count(), 0);
    await page.evaluate(() => {
      window.__diffFiles = [{ path: "e2e-diff.txt", old_path: null, status: "untracked", binary: false, additions: 3, deletions: 0, hunks: [] }];
    });
    const row = page.locator('.oc-change[title="Open e2e-diff.txt"]');
    await row.waitFor({ timeout: 6000 });
    assert.equal(await row.locator(".name").textContent(), "e2e-diff.txt");
    assert.equal(await row.locator(".oc-count .a").textContent(), "+3");
    if (process.env.OC_DIFF_REFRESH_SCREENSHOT) await page.screenshot({ path: process.env.OC_DIFF_REFRESH_SCREENSHOT });
  } finally {
    await context.close();
  }
});

test("All files: folders and type icons, chevron on hover, collapse, filter, and files open through Open in", async () => {
  const { context, page, errors } = await open();
  await page.getByRole("tab", { name: "All files" }).click();
  await page.getByRole("treeitem", { name: "src" }).waitFor();
  // Folders and files sorted together by name, folders closed.
  assert.deepEqual((await rowNames(page)).slice(0, 4), [".github", ".gitignore", "Cargo.toml", "package.json"]);
  const src = page.getByRole("treeitem", { name: "src" });
  assert.equal(await src.getAttribute("aria-expanded"), "false");
  // A file row carries its type glyph; a folder its folder icon, swapped for the chevron on hover.
  assert.equal(await page.getByRole("treeitem", { name: "package.json" }).locator(".oc-file-icon").getAttribute("data-icon"), "nodejs");
  assert.equal(await page.getByRole("treeitem", { name: ".gitignore" }).locator(".oc-file-icon").getAttribute("data-icon"), "git");
  assert.equal(await src.locator(".oc-file-icon").getAttribute("data-icon"), "folder");
  const chevronShown = () => src.locator(".oc-files-chevron").evaluate((e) => getComputedStyle(e).display !== "none");
  assert.equal(await chevronShown(), false);
  await src.hover();
  assert.equal(await chevronShown(), true);
  // Monospace names.
  assert.match(await src.locator(".name").evaluate((e) => getComputedStyle(e).fontFamily), /mono/i);

  await src.click();
  await page.getByRole("treeitem", { name: "lib" }).click();
  await page.getByRole("treeitem", { name: "auth.ts" }).waitFor();
  assert.equal(await src.getAttribute("aria-expanded"), "true");

  // Picking a file opens it in the default Open in app, not in the app.
  await page.getByRole("treeitem", { name: "auth.ts" }).click();
  await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === "open_in_app"));
  const [opened] = await calls(page, "open_in_app");
  assert.equal(opened.path, `${WT}/src/lib/auth.ts`);

  // Collapse folders closes every folder.
  await page.getByRole("button", { name: "Collapse folders" }).click();
  await page.waitForFunction(() => !document.querySelector('.oc-files [aria-expanded="true"]'));
  assert.equal(await page.getByRole("treeitem", { name: "auth.ts" }).count(), 0);

  // Filter: matching files under their opened folders; Esc closes the field and clears it.
  await page.getByRole("button", { name: "Filter files" }).click();
  await page.getByRole("textbox", { name: "Filter files" }).fill("auth");
  await page.waitForFunction(() => document.querySelectorAll(".oc-files [role=treeitem]").length === 4);
  assert.deepEqual(await rowNames(page), ["src", "lib", "auth.test.ts", "auth.ts"]);
  await page.getByRole("textbox", { name: "Filter files" }).fill("nothing-like-this");
  await page.getByText("No files match this filter").waitFor();
  await page.getByRole("textbox", { name: "Filter files" }).press("Escape");
  await page.getByRole("treeitem", { name: "src" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Filter files" }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("New file: named in the folder last opened, written empty, then opened through Open in", async () => {
  const { context, page, errors } = await open();
  await page.getByRole("tab", { name: "All files" }).click();
  await page.getByRole("treeitem", { name: "src" }).click();
  await page.getByRole("button", { name: "New file", exact: true }).click();
  const name = page.getByRole("textbox", { name: "New file name" });
  // An existing name is refused in place.
  await name.fill("main.tsx");
  await name.press("Enter");
  await page.getByRole("alert").filter({ hasText: "src/main.tsx already exists" }).waitFor();
  assert.deepEqual(await calls(page, "diff_write_file"), []);
  await name.fill("token.ts");
  await name.press("Enter");
  await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === "open_in_app"));
  assert.deepEqual(await calls(page, "diff_write_file"), [{ cmd: "diff_write_file", repo: WT, path: "src/token.ts", contents: "" }]);
  assert.equal((await calls(page, "open_in_app"))[0].path, `${WT}/src/token.ts`);
  await page.getByRole("treeitem", { name: "token.ts" }).waitFor();
  assert.equal(await name.count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("strip: Setup and Run under the list, Run's dashed empty state, chevron and ⌘J collapse it, + opens a terminal tab", async () => {
  const { context, page, errors } = await open();
  const strip = page.locator(".ws-right .ws-strip");
  await strip.waitFor();
  assert.deepEqual(await strip.locator(".ws-strip-tabs [role=tab]").allInnerTexts(), ["Setup", "Run"]);
  assert.equal(await strip.getByRole("tab", { name: "Run" }).getAttribute("aria-selected"), "true");
  // No terminal anywhere until one is asked for, and none under the workspace.
  assert.equal(await page.locator(".terminal-panel").count(), 0);

  // Run with no run script: Conductor's dashed box.
  const box = strip.locator(".scripts-empty-box");
  await box.getByText("Run tests or a development server to test changes in this workspace").waitFor();
  assert.equal(await box.evaluate((e) => getComputedStyle(e).borderTopStyle), "dashed");

  // Setup with no setup script: Conductor's dashed "Add setup script" card (Ask agent / Add manually).
  await strip.getByRole("tab", { name: "Setup" }).click();
  const addSetup = strip.locator(".scripts-setup-add-box");
  await addSetup.getByRole("heading", { name: "Add setup script" }).waitFor();
  assert.equal(await addSetup.evaluate((e) => getComputedStyle(e).borderTopStyle), "dashed");
  assert.deepEqual(await addSetup.getByRole("button").allInnerTexts(), ["Ask agent", "Add manually"]);
  await addSetup.getByText("Run commands when a workspace is created to install dependencies or set up the environment").waitFor();
  await strip.getByRole("tab", { name: "Run" }).click();

  // The chevron hides the body (tabs stay), and shows it again.
  await strip.getByRole("button", { name: "Hide terminal panel" }).click();
  await strip.getByRole("button", { name: "Show terminal panel" }).waitFor();
  assert.equal(await box.isVisible(), false);
  await strip.getByRole("button", { name: "Show terminal panel" }).click();
  await box.waitFor();
  // ⌘J does the same (view.toggleTerminalPanel).
  await page.locator(".ws-header").click();
  await page.keyboard.press("Meta+j");
  await strip.getByRole("button", { name: "Show terminal panel" }).waitFor();
  await page.keyboard.press("Meta+j");
  await box.waitFor();

  // + opens a terminal as a tab of the strip.
  await strip.getByRole("button", { name: "New terminal" }).click();
  await strip.locator(".terminal-panel .xterm-rows").waitFor();
  await page.waitForFunction(() => document.querySelector(".ws-strip .terminal-panel .xterm-rows")?.textContent?.includes("lisbon %"));
  assert.deepEqual(await strip.locator(".ws-strip-tabs [role=tab]").allInnerTexts(), ["Setup", "Run", "Terminal"]);
  assert.equal(await page.locator(".workspace > .terminal-panel").count(), 0);
  // Run is still one click away; closing the terminal goes back to it.
  await strip.getByRole("tab", { name: "Run" }).click();
  await box.waitFor();
  await strip.locator(".term-tab").click();
  await strip.getByRole("button", { name: "Close terminal" }).click();
  await box.waitFor();
  assert.equal(await strip.locator(".term-tab").count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("Add run script opens the repository's Scripts settings", async () => {
  const { context, page } = await open();
  await page.getByRole("button", { name: "Add run script" }).click();
  await page.waitForFunction(() => document.querySelector(".settings .settings-header h1")?.textContent === "Scripts");
  assert.match(new URL(page.url()).pathname, /scripts/);
  await context.close();
});

test("Run with spotlight testing on and no run script offers Run Spotlight, which starts it", async () => {
  // The switch lives in Settings › Actions, so the strip only reads the setting:
  // Spotlight is then the Run tab's only task (tests/e2e/flows.mjs `checkpoint` drives it for real).
  const { context, page, errors } = await open({ spotlight: true });
  const strip = page.locator(".ws-right .ws-strip");
  await strip.waitFor();
  assert.equal(await strip.getByRole("tab", { name: "Run" }).getAttribute("aria-selected"), "true");
  // Conductor's run split button names the task: "Start spotlight" (header), and the idle body offers the same.
  const start = strip.getByRole("button", { name: "Start spotlight", exact: true });
  await start.waitFor();
  await strip.getByText("Sync your changes to the repository root.").waitFor();
  assert.equal(await strip.locator(".scripts-empty-box").count(), 0);
  await start.click();
  await page.waitForFunction(() => window.__fake.calls.some((c) => c.cmd === "spotlight_start"));
  assert.deepEqual(errors, []);
  await context.close();
});
