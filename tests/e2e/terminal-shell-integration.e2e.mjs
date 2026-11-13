// End-to-end check of the shell integration marks in a real browser.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__) whose toy
// shell prints the marks Conductor's zsh hooks print
// (src-tauri/src/terminal/shell_integration.rs): `Prompt` before each prompt,
// `ProgramStart;<id>;<program>;<command>` when a command starts and
// `CommandDone;<id>` when it ends. `watch …` keeps running until Ctrl+C.
// Run after `npm run build`:
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
  localStorage.setItem("openconductor.shell.v1", JSON.stringify(shellState));
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: shellState.selection, collapsed: [] }));
  const mark = (body) => `\x1b]633;Conductor;${body}\x07`;
  const enc = new TextEncoder();
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const ptys = new Map(); // id -> { line, running }
  const stats = (window.__shellIntegration = { emitted: 0, acked: 0 });
  let handler;
  let cb = 0;
  let marker = 0;
  const cbs = {};
  const emit = (payload) => cbs[handler]?.({ event: "pty-event", id: 1, payload });
  const raw = (id, bytes) => {
    stats.emitted += bytes.length;
    emit({ kind: "data", id, data: b64(bytes) });
  };
  const out = (id, s) => raw(id, enc.encode(s));
  const prompt = (id) => out(id, `${mark("Prompt")}/repo$ `);
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
        case "pty_spawn": {
          const a = args.args;
          ptys.set(a.id, { line: "", running: null });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            prompt(a.id);
          }, 0);
          return a.id;
        }
        case "pty_write": {
          const p = ptys.get(args.id);
          for (const ch of args.data) {
            if (p.running !== null) {
              if (ch === "\x03") {
                out(args.id, `^C\r\n${mark(`CommandDone;${p.running}`)}`);
                p.running = null;
                prompt(args.id);
              }
              continue;
            }
            if (ch !== "\r") {
              p.line += ch;
              out(args.id, ch);
              continue;
            }
            const line = p.line;
            p.line = "";
            const id = ++marker;
            out(args.id, `\r\n${mark(`ProgramStart;${id};${line.split(" ")[0]};${line}`)}`);
            if (line.startsWith("watch")) {
              p.running = id;
              out(args.id, "Every 2s\r\n");
            } else if (line === "accent") {
              // "café", with the é's two bytes in separate chunks.
              const bytes = enc.encode("café\r\n");
              raw(args.id, bytes.slice(0, 4));
              raw(args.id, bytes.slice(4));
              out(args.id, mark(`CommandDone;${id}`));
              prompt(args.id);
            } else {
              out(args.id, `ran: ${line}\r\n${mark(`CommandDone;${id}`)}`);
              prompt(args.id);
            }
          }
          return;
        }
        case "pty_ack_bytes":
          stats.acked += args.bytes;
          return;
        case "pty_resize":
        case "pty_kill":
        case "pty_clear_history":
        case "pty_persist_terminal_history":
        case "pty_delete_terminal_history":
        case "pty_delete_workspace_terminal_history":
          return;
        case "pty_load_terminal_history":
          return null;
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}

const activeLabel = (page) => page.locator(".term-tab.active span:not(.term-dot)").innerText();
const screenText = (page) => page.locator(".term-mount .xterm-rows").innerText();

async function waitForLabel(page, label) {
  await page.waitForFunction((l) => document.querySelector(".term-tab.active span:not(.term-dot)")?.textContent === l, label, { timeout: 5000 });
}

async function waitForScreen(page, text) {
  await page.waitForFunction((t) => document.querySelector(".term-mount .xterm-rows")?.textContent?.includes(t), text, { timeout: 5000 });
}

async function type(page, s) {
  await page.locator(".term-mount .xterm-helper-textarea").focus();
  await page.keyboard.type(s);
  await page.keyboard.press("Enter");
}

test("the tab shows the running program from the shell's marks, and the marks never reach the screen", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, SHELL_STATE);
  await page.goto(base + "/");
  await showTerminalPanel(page);

  await page.locator(".term-tab").first().waitFor();
  await waitForScreen(page, "/repo$");
  assert.equal(await activeLabel(page), "Terminal");

  // A command that finishes: the label is back once the next prompt arrives.
  await type(page, "echo hi");
  await waitForScreen(page, "ran: echo hi");
  await waitForLabel(page, "Terminal");

  // A command that keeps running shows its program.
  await type(page, "watch ls");
  await waitForScreen(page, "Every 2s");
  await waitForLabel(page, "Terminal (watch)");

  // Ctrl+C ends it; the prompt mark clears the program.
  await page.keyboard.press("Control+c");
  await waitForScreen(page, "^C");
  await waitForLabel(page, "Terminal");

  // A UTF-8 character split across two chunks still draws whole.
  await type(page, "accent");
  await waitForScreen(page, "café");

  const screen = await screenText(page);
  assert.ok(!screen.includes("633") && !screen.includes("Conductor;"), `no mark text on screen: ${JSON.stringify(screen)}`);
  // Every byte is acked, marks included, so flow control never stalls.
  await page.waitForFunction(() => window.__shellIntegration.acked === window.__shellIntegration.emitted, null, { timeout: 5000 });

  assert.deepEqual(errors, []);
  await context.close();
});
