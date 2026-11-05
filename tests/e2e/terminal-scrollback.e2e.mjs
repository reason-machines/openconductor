// End-to-end check of Settings › Advanced › Scrollback limit, in a real browser.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__): a toy PTY
// that prints 7000 numbered rows when it starts, and get_settings /
// update_settings over an in-page store. Find in terminal searches xterm's
// whole buffer, so it shows whether the oldest row is still kept. Run after
// `npm run build`:
//
//   node --test tests/e2e/
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
        case "plugin:event|listen":
          if (args.event === "pty-event") handler = args.handler;
          return 1;
        case "plugin:event|unlisten":
          return;
        case "get_settings":
          return structuredClone(settings);
        case "update_settings": {
          settings = structuredClone(args.settings);
          window.__fake.saves.push(structuredClone(settings.advanced ?? {}));
          return structuredClone(settings);
        }
        case "pty_spawn": {
          const a = args.args;
          window.__fake.sizes.push({ cols: a.cols, rows: a.rows });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            let out = "";
            for (let i = 1; i <= 7000; i++) out += `row ${String(i).padStart(5, "0")}\r\n`;
            emit({ kind: "data", id: a.id, data: b64(out + "/repo$ ") });
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


/** Opens Find in terminal on the focused terminal, searches `term`, and returns the counter text. */
async function findCount(page, term) {
  await page.locator(".term-mount .xterm-helper-textarea").focus();
  await page.keyboard.press("Meta+f");
  const input = page.getByRole("search", { name: "Find in terminal" }).getByPlaceholder("Find");
  await input.fill(term);
  const counter = page.locator(".term-find-count");
  await page.waitForFunction(() => /\d+ of \d+/.test(document.querySelector(".term-find-count")?.textContent ?? ""));
  const text = (await counter.textContent()).trim();
  await page.keyboard.press("Escape");
  return text;
}

test("Scrollback limit is set in MB and an open terminal keeps only that much output", async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, SHELL_STATE);
  await page.goto(base + "/");
  await page.waitForFunction(() => document.querySelector(".term-mount .xterm-rows")?.textContent?.includes("/repo$"));

  // 10 MB by default keeps 62,500 rows, so the first of 7000 is still there.
  assert.equal(await findCount(page, "row 00001"), "1 of 1");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Advanced" }).click();
  const field = page.getByLabel("Scrollback limit", { exact: true });
  assert.equal(await field.inputValue(), "10");
  await page.getByText("Approximate terminal output to keep.").waitFor();
  await page.getByText("MB", { exact: true }).waitFor();

  // Conductor's parsing: below 1 becomes 1, fractions round, empty goes back to 10.
  await field.fill("0");
  await field.press("Enter");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal_scrollback_limit_bytes === 1_000_000);
  assert.equal(await field.inputValue(), "1");
  await field.fill("2.6");
  await field.press("Tab");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal_scrollback_limit_bytes === 3_000_000);
  assert.equal(await field.inputValue(), "3");
  await field.fill("");
  await field.press("Enter");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal_scrollback_limit_bytes === 10_000_000);
  assert.equal(await field.inputValue(), "10");
  await field.fill("1");
  await field.press("Enter");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal_scrollback_limit_bytes === 1_000_000);
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/scrollback-setting.png` });

  // Back in the workspace, the same terminal now keeps 6,250 rows of
  // scrollback plus its screen: of the 7001 lines (7000 rows and the prompt)
  // the oldest are gone and the newest kept.
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator(".term-mount .xterm-rows").waitFor();
  const { rows } = await page.evaluate(() => window.__fake.sizes.at(-1));
  const firstKept = 7001 - (6250 + rows) + 1;
  const label = (n) => `row ${String(n).padStart(5, "0")}`;
  assert.equal(await findCount(page, label(1)), "0 of 0");
  assert.equal(await findCount(page, label(firstKept - 1)), "0 of 0");
  assert.equal(await findCount(page, label(firstKept)), "1 of 1");
  assert.equal(await findCount(page, label(7000)), "1 of 1");
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/scrollback-applied.png` });

  assert.deepEqual(errors, []);
  await context.close();
});
