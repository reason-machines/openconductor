// End-to-end check that terminals never take the keyboard from the chat box
// unless the user opens one, in a real browser. Terminals are tabs of the right
// panel's Setup / Run / Terminal strip, which opens on Run with no terminal.
//
// The Reason chat e2e (tools/e2e/reason-chat.e2e.mjs) sometimes timed out on
// its first message: the workspace's first terminal attached after the
// composer had focus and called `term.focus()`, so the typed text went to the
// shell, the composer stayed empty and Send stayed disabled.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__) with a toy
// PTY. Its `pty-event` listener answers only when the test releases it, so the
// terminal always arrives after the chat box has focus. Run after
// `npm run build`:
//
//   node --test tests/e2e/terminal-focus.e2e.mjs
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

const REPO = { id: "r1", name: "demo", path: "/repo", defaultBranch: "main" };
const WORKSPACE = { id: "w1", name: "lisbon", branch: "lisbon", path: "/repo" };

// Runs in the page before the app. Everything it needs is inside it.
function fakeBackend({ repo, workspace }) {
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: { kind: "workspace", repoId: repo.id, workspaceId: workspace.id }, collapsed: [] }));
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  let handler;
  let cb = 0;
  const cbs = {};
  const emit = (payload) => cbs[handler]?.({ event: "pty-event", id: 1, payload });
  // The terminal waits on this listener before it opens a tab; the test releases it.
  let release;
  const gate = new Promise((r) => (release = r));
  window.__releasePty = () => release();
  window.__ptyInput = "";
  window.__ptySpawns = [];
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
          if (args.event !== "pty-event") return 1;
          await gate;
          handler = args.handler;
          return 1;
        case "plugin:event|unlisten":
          return;
        case "db_list_repos":
          return [{ id: repo.id, name: repo.name, rootPath: repo.path, remoteUrl: null, defaultBranch: repo.defaultBranch, displayOrder: 0, hidden: false, icon: null, createdAt: "2026-01-01T00:00:00Z" }];
        case "db_list_workspaces":
          return [{ id: workspace.id, repositoryId: repo.id, directoryName: workspace.name, workspaceName: workspace.name, branch: workspace.branch, placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: workspace.path, pinnedAt: null, unread: false, createdAt: "2026-01-01T00:00:00Z" }];
        case "pty_spawn": {
          const a = args.args;
          window.__ptySpawns.push({ id: a.id, cwd: a.cwd });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            emit({ kind: "data", id: a.id, data: b64(`${a.cwd}$ `) });
          }, 0);
          return a.id;
        }
        case "pty_write":
          window.__ptyInput += args.data;
          return;
        case "local_storage_get_entry":
          return null;
        case "local_storage_set_entry":
          return { success: true };
        case "chat_messages_load":
          return { messages: [], agentSessionId: null };
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          // Everything else (PR lookup, diff, settings) is not needed here.
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}

const focusedIn = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (a?.closest(".composer")) return "composer";
    if (a?.closest(".terminal-panel")) return "terminal";
    return a ? a.tagName.toLowerCase() : "none";
  });

async function open(page, workspace = WORKSPACE) {
  await page.addInitScript(fakeBackend, { repo: REPO, workspace });
  await page.goto(base + "/");
  await page.locator(".composer [contenteditable=true]").waitFor();
}

for (const path of ["/worktrees/lisbon", "/repo", null]) {
  test(`new terminal tabs use selected workspace cwd (${path ?? "repository fallback"})`, async () => {
    const page = await browser.newPage();
    try {
      await open(page, { ...WORKSPACE, path });
      await page.locator(".ws-strip[data-terminals-ready]").waitFor();
      await page.evaluate(() => window.__releasePty());
      for (let count = 1; count <= 2; count++) {
        await page.getByRole("button", { name: "New terminal" }).click();
        await page.waitForFunction((n) => window.__ptySpawns.length === n, count);
        assert.deepEqual(await page.evaluate(() => window.__ptySpawns.map((s) => s.cwd)), Array(count).fill(path ?? REPO.path));
      }
    } finally {
      await page.close();
    }
  });
}

test("no terminal opens with the workspace, so the chat box keeps every key", async () => {
  const page = await browser.newPage();
  await open(page);
  const box = page.locator(".composer [contenteditable=true]");
  await box.click();
  await page.keyboard.type("lo");
  // Terminals live in the right panel's strip, which opens on Run; nothing spawns a shell by itself.
  await page.locator(".ws-strip[data-terminals-ready]").waitFor();
  await page.evaluate(() => window.__releasePty());
  await page.waitForTimeout(300);
  await page.keyboard.type("cal");
  assert.equal(await page.locator(".terminal-panel").count(), 0, "no terminal is shown");
  assert.equal(await focusedIn(page), "composer", "focus stays in the chat box");
  assert.equal(await box.textContent(), "local", "every key went to the chat box");
  assert.equal(await page.evaluate(() => window.__ptyInput), "", "no key reached a shell");
  assert.equal(await page.locator('.composer button[type="submit"]').isEnabled(), true, "Send is enabled");
  await page.close();
});

test("a terminal opened with + takes the keyboard, even when its shell answers late", async () => {
  const page = await browser.newPage();
  await open(page);
  await page.locator(".ws-strip[data-terminals-ready]").waitFor();
  await page.getByRole("button", { name: "New terminal" }).click();
  await page.evaluate(() => window.__releasePty());
  await page.locator(".terminal-panel .xterm").waitFor();
  await page.waitForFunction(() => document.activeElement?.closest(".terminal-panel"));
  assert.equal(await focusedIn(page), "terminal");
  await page.close();
});

test("a tab the user opens takes the keyboard", async () => {
  const page = await browser.newPage();
  await open(page);
  await page.evaluate(() => window.__releasePty());
  await showTerminalPanel(page);
  await page.locator(".term-tab").first().waitFor();
  await page.locator(".composer [contenteditable=true]").click();
  await page.getByRole("button", { name: "New terminal" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".term-tab").length === 2);
  await page.waitForFunction(() => document.activeElement?.closest(".terminal-panel .term-mount"));
  await page.keyboard.type("ls");
  assert.equal(await page.evaluate(() => window.__ptyInput), "ls", "the new tab's shell got the keys");
  await page.close();
});
