// End-to-end check of Big terminal mode (Settings › More › Experimental and
// the Big terminal tab) and ⌘⇧T, in a real browser.
//
// The page gets a fake Tauri backend (window.__TAURI_INTERNALS__): a toy PTY
// that records every pty_spawn and prints a prompt, and get_settings /
// update_settings over an in-page store. Run after `npm run build`:
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
      workspaces: [{ id: "w1", name: "lisbon", branch: "lisbon", path: "/repo/.worktrees/lisbon", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0 }],
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
  window.__fake = { spawns: [], saves: [], kills: [] };
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
          settings = structuredClone(args.settings);
          window.__fake.saves.push(structuredClone({ experimental: settings.experimental, terminal: settings.terminal }));
          return structuredClone(settings);
        }
        case "pty_spawn": {
          const a = args.args;
          window.__fake.spawns.push({ id: a.id, cwd: a.cwd, initialCommand: a.initialCommand ?? null });
          setTimeout(() => {
            emit({ kind: "ready", id: a.id, pid: 42 });
            emit({ kind: "data", id: a.id, data: b64("/repo$ ") });
          }, 0);
          return a.id;
        }
        case "pty_resize":
          return;
        case "pty_load_terminal_history":
          return null;
        case "pty_write":
        case "pty_write_mirror":
        case "pty_persist_terminal_history":
        case "pty_ack_bytes":
        case "pty_clear_history":
          return;
        case "pty_kill":
          window.__fake.kills.push(args.id);
          return;
        case "app_info":
          return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        default:
          throw new Error(`fake backend: ${cmd} is not mocked`);
      }
    },
  };
}


const spawns = (page) => page.evaluate(() => window.__fake.spawns.map((s) => s.initialCommand));
const lastSave = (page) => page.evaluate(() => window.__fake.saves.at(-1));

async function bigTab(page) {
  const center = page.locator(".center-terminal .xterm-helper-textarea");
  await (await center.count() ? center : page.locator(".ws-strip .xterm-helper-textarea")).focus();
  await page.keyboard.press("Meta+Shift+t");
}

test("Big terminal mode: ⌘⇧T does nothing while off; on, it opens a tab running the chosen preset", async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(fakeBackend, SHELL_STATE);
  await page.goto(base + "/");
  // Conductor's default workspace layout has no terminal and no header Terminal button.
  await page.locator(".ws-header").waitFor();
  assert.equal(await page.locator(".terminal-panel").count(), 0);
  assert.equal(await page.locator(".ws-header").getByRole("button", { name: "Terminal", exact: true }).count(), 0);
  // Off (Conductor's default): ⌘⇧T outside a terminal opens nothing, not even the panel.
  await page.keyboard.press("Meta+Shift+t");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".terminal-panel").count(), 0);
  assert.deepEqual(await spawns(page), []);
  // ⌘J shows the panel with one plain shell.
  await showTerminalPanel(page);
  await page.waitForFunction(() => window.__fake.spawns.length === 1 && document.querySelector(".term-mount .xterm-rows")?.textContent?.includes("/repo$"));
  assert.deepEqual(await spawns(page), [null]);

  // Off: inside the terminal the key opens nothing either.
  await bigTab(page);
  await page.waitForTimeout(300);
  assert.deepEqual(await spawns(page), [null]);
  assert.equal(await page.locator(".term-tab").count(), 1);

  // The Big terminal tab is not listed until the mode is on.
  await page.getByRole("button", { name: "Settings" }).click();
  const nav = page.getByRole("navigation", { name: "Settings pages" });
  assert.equal(await nav.getByRole("button", { name: "Big terminal" }).count(), 0);
  await nav.getByRole("button", { name: "Experimental" }).click();
  await page.getByText("Create big terminals in the center pane with ⌘⇧T").waitFor();
  const toggle = page.getByRole("switch", { name: "Big terminal mode" });
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.experimental?.experimental_big_terminal_mode === true);
  await nav.getByRole("button", { name: "Big terminal" }).click();

  // Presets show the command each runs; Claude is selected by default.
  await page.getByText("Configure big terminal mode behavior (⌘⇧T).").waitFor();
  await page.getByText("Command to auto-run when creating a new terminal tab.").waitFor();
  const group = page.getByRole("radiogroup", { name: "New tab preset" });
  assert.equal(await group.getByRole("radio", { name: /Claude/ }).isChecked(), true);
  await group.getByText("claude --dangerously-skip-permissions").waitFor();
  await group.getByText('codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access').waitFor();
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/big-terminal-settings.png` });

  // Codex, then ⌘⇧T in the terminal runs Codex's command in a new tab.
  await group.getByText("Codex", { exact: true }).click();
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal?.big_terminal_preset === "codex");
  await page.getByRole("button", { name: "Back" }).click();
  await showTerminalPanel(page);
  await bigTab(page);
  await page.waitForFunction(() => window.__fake.spawns.length === 2);
  assert.deepEqual(await spawns(page), [null, 'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access']);
  assert.equal(await page.locator(".ws-strip .term-tab").count(), 1, "big terminals must not appear in the right panel");
  const centerTabs = page.getByRole("tablist", { name: "Workspace tabs" });
  await centerTabs.getByRole("tab", { name: "Terminal", exact: true }).waitFor();
  await page.getByRole("region", { name: "Center terminal" }).waitFor();
  assert.equal(await page.locator(".chat").isVisible(), false, "the chat and composer are hidden, not unmounted");
  const beforeSwitch = await spawns(page);
  await centerTabs.getByRole("tab", { name: "lisbon", exact: true }).click();
  assert.equal(await page.locator(".chat").isVisible(), true);
  assert.equal(await page.locator(".center-terminal").count(), 0);
  await centerTabs.getByRole("tab", { name: "Terminal", exact: true }).click();
  await page.getByRole("region", { name: "Center terminal" }).waitFor();
  assert.deepEqual(await spawns(page), beforeSwitch, "tab switching reuses the PTY");
  // ⌘T stays a plain panel shell.
  await page.locator(".center-terminal .xterm-helper-textarea").focus();
  await page.keyboard.press("Meta+t");
  await page.waitForFunction(() => window.__fake.spawns.length === 3);
  assert.equal((await spawns(page))[2], null);

  // Outside a terminal, ⌘⇧T opens the center while leaving the right strip hidden.
  await page.evaluate(() => document.activeElement?.blur());
  await page.getByRole("button", { name: "Hide terminal panel" }).click();
  await page.locator(".ws-strip.collapsed").waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => {
    window.__fake.focusEvents = [];
    document.addEventListener("focusin", (event) => {
      window.__fake.focusEvents.push({
        tag: event.target.tagName,
        className: event.target.className,
        center: Boolean(event.target.closest(".center-terminal")),
      });
      if (window.__fake.focusEvents.length > 10) window.__fake.focusEvents.shift();
    });
  });
  await page.keyboard.press("Meta+Shift+t");
  await page.waitForFunction(() => window.__fake.spawns.length === 4);
  assert.equal((await spawns(page))[3], 'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access');
  await page.getByRole("region", { name: "Center terminal" }).waitFor();
  assert.equal(await page.locator(".ws-strip .term-tab").count(), 2);
  assert.equal(await page.locator(".ws-strip.collapsed").count(), 1, "opening a center tab does not reopen the right strip");
  assert.equal(await centerTabs.getByRole("tab", { name: /^Terminal/ }).count(), 2);
  try {
    await page.waitForFunction(() => document.activeElement?.closest(".center-terminal .term-mount"));
  } catch (error) {
    const focus = await page.evaluate(() => ({
      active: document.activeElement?.outerHTML.slice(0, 500),
      events: window.__fake.focusEvents,
      terminals: [...document.querySelectorAll(".term-mount")].map((mount) => ({
        center: Boolean(mount.closest(".center-terminal")),
        textareas: [...mount.querySelectorAll("textarea")].map((textarea) => ({
          connected: textarea.isConnected,
          disabled: textarea.disabled,
          tabIndex: textarea.tabIndex,
          rect: textarea.getBoundingClientRect().toJSON(),
        })),
      })),
    }));
    throw new Error(`New center terminal did not take keyboard focus: ${JSON.stringify({ focus, errors })}`, { cause: error });
  }
  assert.ok(await page.evaluate(() => window.__fake.spawns.every((s) => s.cwd === "/repo/.worktrees/lisbon")));
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/big-terminal-shortcut.png` });
  // Close it again so the tabs below stay under the per-workspace tab limit.
  const closedId = await page.evaluate(() => window.__fake.spawns[3].id);
  await centerTabs.getByRole("button", { name: "Close Terminal 2 tab", exact: true }).click();
  await page.waitForFunction((id) => window.__fake.kills.includes(id), closedId);
  assert.equal(await centerTabs.getByRole("tab", { name: /^Terminal/ }).count(), 1);
  assert.equal(await page.locator(".ws-strip .term-tab").count(), 2);

  // A custom command: added selected with "No command set", saved on Enter.
  await page.getByRole("button", { name: "Settings" }).click();
  await nav.getByRole("button", { name: "Big terminal" }).click();
  await page.getByRole("button", { name: "Add custom command" }).click();
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal?.big_terminal_custom_commands?.length === 1);
  const added = (await lastSave(page)).terminal;
  assert.equal(added.big_terminal_preset, `custom:${added.big_terminal_custom_commands[0].id}`);
  await group.getByText("No command set").waitFor();
  const input = page.getByRole("textbox", { name: "Custom command" });
  assert.equal(await input.getAttribute("placeholder"), "my-agent --flag");
  await input.fill("  htop -d 5 ");
  await input.press("Enter");
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal?.big_terminal_custom_commands?.[0]?.command === "  htop -d 5 ");
  if (process.env.OC_SHOT_DIR) await page.screenshot({ path: `${process.env.OC_SHOT_DIR}/big-terminal-custom.png` });
  await page.getByRole("button", { name: "Back" }).click();
  await showTerminalPanel(page);
  await bigTab(page);
  await page.waitForFunction(() => window.__fake.spawns.length === 5);
  assert.equal((await spawns(page))[4], "htop -d 5");
  await page.getByRole("region", { name: "Center terminal" }).waitFor();
  assert.equal(await page.locator(".ws-strip .term-tab").count(), 2);

  // Deleting the selected custom command falls back to Claude.
  await page.getByRole("button", { name: "Settings" }).click();
  await nav.getByRole("button", { name: "Big terminal" }).click();
  await page.getByRole("button", { name: "Delete custom command" }).click();
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.terminal?.big_terminal_preset === "claude");
  assert.deepEqual((await lastSave(page)).terminal.big_terminal_custom_commands, []);
  assert.equal(await group.getByRole("radio", { name: /Claude/ }).isChecked(), true);

  // Off again: the tab leaves the list and ⌘⇧T opens nothing.
  await nav.getByRole("button", { name: "Experimental" }).click();
  await page.getByRole("switch", { name: "Big terminal mode" }).uncheck();
  await page.waitForFunction(() => window.__fake.saves.at(-1)?.experimental?.experimental_big_terminal_mode === false);
  assert.equal(await nav.getByRole("button", { name: "Big terminal" }).count(), 0);
  await page.getByRole("button", { name: "Back" }).click();
  await showTerminalPanel(page);
  await bigTab(page);
  await page.waitForTimeout(300);
  assert.equal((await spawns(page)).length, 5);

  assert.deepEqual(errors, []);
  await context.close();
});
