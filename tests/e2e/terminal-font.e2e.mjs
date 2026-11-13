// End-to-end check of Settings › Appearance › Terminal font, in a real browser.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__): a toy PTY
// that records its size, and get_settings / update_settings over an in-page
// store that refuses sizes outside 10-20 as the Rust validation does. Run
// after `npm run build`:
//
//   node --test tests/e2e/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { showTerminalPanel } from "./terminal-panel.mjs";

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

const SHELL_STATE = {
  repos: [
    {
      id: "r1",
      name: "demo",
      path: "/repo",
      defaultBranch: "main",
      workspaces: [{ id: "w1", name: "lisbon", branch: "lisbon", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0 }],
    },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
};

// Runs in the page before the app. Everything it needs is inside it.
function fakeBackend(shellState) {
  if (!localStorage.getItem("openconductor.shell.v1")) localStorage.setItem("openconductor.shell.v1", JSON.stringify(shellState));
  if (!localStorage.getItem("openconductor.shell.prefs.v1")) localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: shellState.selection, collapsed: [] }));
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  let settings = {
    $schema: "https://openconductor.dev/schemas/settings.schema.json",
    general: { theme: "dark", send_native_notification: true, sound_type: "default" },
    appearance: { zoom_level_v2: 1, low_contrast_dark_mode: false, terminal_font_size: 12 },
    git: { branch_prefix_type: "github_username", delete_branch_on_archive: false, archive_on_merge: false, worktree_push_auto_setup_remote: true },
    models: { default: "opus", default_thinking_enabled: true, review_thinking_enabled: true, codex: { default_thinking_level: "high", review_thinking_level: "high" } },
    providers: {},
  };
  window.__fake = { sizes: [], saves: [] };
  let handler;
  let cb = 0;
  const cbs = {};
  const emit = (payload) => cbs[handler]?.({ event: "pty-event", id: 1, payload });
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: (f) => ((cbs[++cb] = f), cb),
    async invoke(cmd, args) {
      switch (cmd) {
        case "reason_cli_ensure_current":
          return { path: "/fixture/bin/reason", version: "fixture" };
        case "db_first_run_onboarding_step":
          return "999";
        case "plugin:event|listen":
          if (args.event === "pty-event") handler = args.handler;
          return 1;
        case "plugin:event|unlisten":
          return;
        case "db_list_repos":
          return shellState.repos.map((r, i) => ({ id: r.id, name: r.name, rootPath: r.path, remoteUrl: null, defaultBranch: r.defaultBranch, displayOrder: i, hidden: false, icon: null, createdAt: "2026-01-01T00:00:00Z" }));
        case "db_list_workspaces":
          return shellState.repos.flatMap((r) => r.workspaces.map((w) => ({ id: w.id, repositoryId: r.id, directoryName: w.name, workspaceName: w.name, branch: w.branch, placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: w.path ?? null, pinnedAt: null, unread: false, createdAt: "2026-01-01T00:00:00Z" })));
        case "archive_workspace":
          return { archived: true, branch: null, archiveCommit: null, notices: [] };
        case "get_settings":
          return structuredClone(settings);
        case "update_settings": {
          const size = args.settings.appearance.terminal_font_size;
          if (size < 10 || size > 20) throw new Error(`appearance.terminal_font_size ${size} must be 10 to 20`);
          settings = structuredClone(args.settings);
          window.__fake.saves.push(structuredClone(settings.appearance));
          return structuredClone(settings);
        }
        case "pty_spawn": {
          const a = args.args;
          window.__fake.sizes.push({ cols: a.cols, rows: a.rows });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            emit({ kind: "data", id: a.id, data: b64("/repo$ ") });
          }, 0);
          return a.id;
        }
        case "pty_resize":
          window.__fake.sizes.push({ cols: args.cols, rows: args.rows });
          return;
        case "pty_load_terminal_history":
          return null;
        case "pty_write":
        case "pty_write_mirror":
        case "pty_persist_terminal_history":
        case "pty_ack_bytes":
        case "pty_kill":
        case "pty_clear_history":
          return;
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}

const rowsStyle = (page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".term-mount .xterm-rows"));
    return { fontSize: s.fontSize, fontFamily: s.fontFamily };
  });
const lastSize = (page) => page.evaluate(() => window.__fake.sizes.at(-1));

/** Sets a range input the way a drag does: the native value setter, then an input event React hears. */
async function slide(page, label, value) {
  await page.getByLabel(label, { exact: true }).evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("Terminal font and size apply to an already open terminal, which refits its PTY", async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, SHELL_STATE);
  await page.goto(base + "/");
  await showTerminalPanel(page);

  await page.waitForFunction(() => document.querySelector(".term-mount .xterm-rows")?.textContent?.includes("/repo$"));
  const start = await rowsStyle(page);
  assert.equal(start.fontSize, "12px", "12 px by default");
  assert.match(start.fontFamily, /^Menlo, Monaco, "Courier New", "Symbols Nerd Font Mono", monospace$/);
  const before = await lastSize(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  const size = page.getByLabel("Terminal Font Size", { exact: true });
  assert.equal(await size.getAttribute("min"), "10");
  assert.equal(await size.getAttribute("max"), "20");
  await slide(page, "Terminal Font Size", 18);
  await page.getByText("18px", { exact: true }).waitFor();

  const family = page.getByLabel("Terminal Font", { exact: true });
  assert.equal(await family.getAttribute("placeholder"), "Leave empty for default");
  // A name that could end the CSS string is refused and not saved.
  await family.fill("Bad; Font");
  await family.press("Enter");
  await page.getByText("Font names cannot contain quotes").waitFor();
  await family.fill("Courier");
  await family.press("Enter");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal_font_family === "Courier");
  const saves = await page.evaluate(() => window.__fake.saves);
  assert.ok(!saves.some((a) => a.terminal_font_family === "Bad; Font"));
  assert.equal(saves.at(-1).terminal_font_size, 18);
  const preview = await page.getByLabel("Terminal font preview").evaluate((el) => ({ fontSize: el.style.fontSize, fontFamily: el.style.fontFamily }));
  assert.equal(preview.fontSize, "18px");
  assert.match(preview.fontFamily, /^Courier, Menlo/);
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/terminal-font-settings.png` });

  // Back to the workspace: the same terminal now draws at 18 px in Courier, and its PTY got fewer cols and rows.
  await page.getByRole("button", { name: "Back" }).click();
  await showTerminalPanel(page);
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".term-mount .xterm-rows")).fontSize === "18px");
  assert.match((await rowsStyle(page)).fontFamily, /^Courier, Menlo/);
  await page.waitForFunction((b) => {
    const s = window.__fake.sizes.at(-1);
    return s.cols < b.cols && s.rows <= b.rows;
  }, before);
  await page.waitForFunction(() => document.querySelector(".term-mount .xterm-rows")?.textContent?.includes("/repo$"));
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/terminal-font-applied.png` });

  assert.deepEqual(errors, []);
  await context.close();
});
