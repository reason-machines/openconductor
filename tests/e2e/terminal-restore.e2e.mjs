// End-to-end check of restoring terminals after a relaunch, in a real browser.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__): a toy PTY
// that echoes input, and `pty_persist_terminal_history` /
// `pty_load_terminal_history` over a store kept in localStorage, so it
// survives a reload the way the real backend's disk does. A reload stands in
// for quitting and relaunching the app. Run after `npm run build`:
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
  // The desktop app keeps the selection in its prefs key; repos come from conductor.db.
  if (!localStorage.getItem("openconductor.shell.prefs.v1")) localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: shellState.selection, collapsed: [] }));
  const DISK = "__fake_backend_disk";
  const disk = () => JSON.parse(localStorage.getItem(DISK) ?? '{"history":{},"spawns":[],"mirrorWrites":[]}');
  const save = (d) => localStorage.setItem(DISK, JSON.stringify(d));
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const ptys = new Map(); // id -> { screen, cwd, cols, rows, line }
  let handler;
  let cb = 0;
  const cbs = {};
  const emit = (payload) => cbs[handler]?.({ event: "pty-event", id: 1, payload });
  const out = (id, s) => {
    ptys.get(id).screen += s;
    emit({ kind: "data", id, data: b64(s) });
  };
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
        case "db_list_repos":
          return shellState.repos.map((r, i) => ({ id: r.id, name: r.name, rootPath: r.path, remoteUrl: null, defaultBranch: r.defaultBranch, displayOrder: i, hidden: false, icon: null, createdAt: "2026-01-01T00:00:00Z" }));
        case "db_list_workspaces":
          return shellState.repos.flatMap((r) => r.workspaces.map((w) => ({ id: w.id, repositoryId: r.id, directoryName: w.name, workspaceName: w.name, branch: w.branch, placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: w.path ?? null, pinnedAt: null, unread: false, createdAt: "2026-01-01T00:00:00Z" })));
        case "db_archive_workspace":
          return null;
        case "pty_spawn": {
          const a = args.args;
          const d = disk();
          d.spawns.push({ id: a.id, cwd: a.cwd });
          save(d);
          if (a.cwd === "/gone") throw new Error("No such file or directory");
          ptys.set(a.id, { screen: "", cwd: a.cwd, cols: a.cols, rows: a.rows, line: "" });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            out(a.id, `${a.cwd}$ `);
          }, 0);
          return a.id;
        }
        case "pty_write": {
          const p = ptys.get(args.id);
          for (const ch of args.data) {
            if (ch === "\r") {
              const cmdline = p.line;
              p.line = "";
              const m = /^cd (.+)$/.exec(cmdline);
              if (m) p.cwd = m[1];
              out(args.id, `\r\n${m ? "" : `ran: ${cmdline}\r\n`}${p.cwd}$ `);
            } else {
              p.line += ch;
              out(args.id, ch);
            }
          }
          return;
        }
        case "pty_resize": {
          const p = ptys.get(args.id);
          if (p) Object.assign(p, { cols: args.cols, rows: args.rows });
          return;
        }
        case "pty_write_mirror": {
          const d = disk();
          d.mirrorWrites.push(args.args);
          save(d);
          if (args.args.data.includes("\x1b[3J")) ptys.get(args.args.id).screen = "";
          return;
        }
        case "pty_persist_terminal_history": {
          const a = args.args;
          const p = ptys.get(a.id);
          const d = disk();
          d.history[a.sessionId] = {
            localWorkspaceId: a.localWorkspaceId,
            sessionId: a.sessionId,
            startedAt: a.startedAt,
            endedAt: a.endedAt,
            hasReceivedUserInput: a.hasReceivedUserInput,
            snapshotAnsi: p.screen.replace(/\r?\n/g, "\r\n"),
            rehydrateSequences: "",
            cwd: p.cwd,
            cols: p.cols,
            rows: p.rows,
            alternateScreen: false,
            bracketedPaste: false,
          };
          save(d);
          return;
        }
        case "pty_load_terminal_history":
          return disk().history[args.args.sessionId] ?? null;
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

const disk = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__fake_backend_disk") ?? "null"));
const screenText = (page) => page.locator(".term-mount .xterm-rows").innerText();
const tabTitles = (page) => page.locator(".term-tab span:not(.term-dot)").allInnerTexts();

async function waitForScreen(page, text) {
  await page.waitForFunction((t) => document.querySelector(".term-mount .xterm-rows")?.textContent?.includes(t), text);
}

async function type(page, s) {
  await page.locator(".term-mount .xterm-helper-textarea").focus();
  await page.keyboard.type(s);
  await page.keyboard.press("Enter");
}

test("terminal tabs and their screens come back after a relaunch, in a new shell", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, SHELL_STATE);
  await page.goto(base + "/");

  // First launch: one tab; run a command and cd, open a second tab, go back to the first.
  await page.locator(".term-tab").first().waitFor();
  await waitForScreen(page, "/repo$");
  await type(page, "echo hello");
  await waitForScreen(page, "ran: echo hello");
  await type(page, "cd /repo/sub");
  await waitForScreen(page, "/repo/sub$");
  await page.getByRole("button", { name: "New terminal tab" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".term-tab").length === 2);
  await waitForScreen(page, "/repo$");
  await type(page, "cd /gone");
  await waitForScreen(page, "/gone$");
  await page.locator(".term-tab").first().click();
  assert.deepEqual(await tabTitles(page), ["Terminal 1", "Terminal 2"]);

  // Saves land within about a second of the last output.
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("__fake_backend_disk")).history).length === 2, null, { timeout: 5000 });
  const before = await disk(page);
  const [first, second] = before.spawns.map((s) => s.id);
  assert.equal(before.history[first].localWorkspaceId, "w1");
  assert.equal(before.history[first].hasReceivedUserInput, true);
  assert.equal(before.history[first].endedAt, null);

  // Relaunch.
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll(".term-tab").length === 2);
  assert.deepEqual(await tabTitles(page), ["Terminal 1", "Terminal 2"]);
  assert.equal(await page.locator(".term-tab.active span:not(.term-dot)").innerText(), "Terminal 1", "the saved active tab is selected");

  // The first tab shows its old screen, the divider, then a new shell in its saved cwd.
  await waitForScreen(page, "Previous terminal session restored. Starting new shell...");
  await waitForScreen(page, "ran: echo hello");
  const text = await screenText(page);
  assert.ok(text.indexOf("ran: echo hello") < text.indexOf("Previous terminal session restored"), "old output sits above the divider");
  assert.match(text.slice(text.indexOf("Previous terminal session restored")), /\/repo\/sub\$/);

  const after = await disk(page);
  const respawns = after.spawns.slice(before.spawns.length);
  assert.deepEqual(respawns, [
    { id: first, cwd: "/repo/sub" },
    // The second tab's saved cwd is gone, so it falls back to the workspace's.
    { id: second, cwd: "/gone" },
    { id: second, cwd: "/repo" },
  ]);
  assert.equal(after.history[first].startedAt, before.history[first].startedAt, "a restored session keeps its start time");

  // Closing a tab keeps it closed after the next relaunch; new tabs keep counting.
  await page.locator(".term-tab").nth(1).click();
  await waitForScreen(page, "Previous terminal session restored");
  await page.locator(".term-tab").nth(1).getByRole("button", { name: "Close terminal" }).click();
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll(".term-tab").length === 1);
  await waitForScreen(page, "Previous terminal session restored");
  await page.getByRole("button", { name: "New terminal tab" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".term-tab").length === 2);
  assert.deepEqual(await tabTitles(page), ["Terminal 1", "Terminal 3"]);

  // Clear scrollback clears the backend screen too, so the next save has no old output.
  await page.locator(".term-tab").first().click();
  await page.getByRole("button", { name: "Clear terminal scrollback" }).click();
  await page.waitForFunction(
    (id) => {
      const d = JSON.parse(localStorage.getItem("__fake_backend_disk"));
      return d.mirrorWrites.some((w) => w.id === id && w.data === "\x1b[H\x1b[2J\x1b[3J") && !d.history[id].snapshotAnsi.includes("echo hello");
    },
    first,
    { timeout: 5000 },
  );

  assert.deepEqual(errors, []);
  await context.close();
});
