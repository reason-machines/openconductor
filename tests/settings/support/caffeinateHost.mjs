import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { startViteFixture } from "../../e2e/vite-fixture-server.mjs";

export const SWITCH_NAME = "Caffeinate while agents are running";
export const BATTERY = {
  ten: "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123)\t10%; discharging; 1:00 remaining present: true\n",
  eleven: "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123)\t11%; discharging; 1:00 remaining present: true\n",
  acTen: "Now drawing from 'AC Power'\n -InternalBattery-0 (id=123)\t10%; charging; 1:00 remaining present: true\n",
  unknown: "Battery status unavailable\n",
};

export function session(chatId, status = "idle", extra = {}) {
  return { chatId, workspaceId: "synthetic-workspace", status, isHidden: false, ...extra };
}

function nativeBoundary({ rows, battery, enabled, delayedRegistration }) {
  const copy = value => structuredClone(value);
  const callbacks = new Map();
  const listeners = new Map();
  const sessions = new Map(rows.map(row => [row.chatId, copy(row)]));
  const calls = [];
  const unexpected = [];
  const runs = new Map();
  const polls = new Map();
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  let nextCallback = 1;
  let nextListener = 1;
  let nextTimer = -1;
  let now = 0;
  let rawBattery = battery;
  let settings;
  let prefs;
  let defaultsReady;
  const defaults = new Promise(resolve => { defaultsReady = resolve; });
  const shellOutput = stdout => ({ stdout, stderr: "", exitCode: 0, signal: null, cancelled: false, truncated: false });
  const localEntries = new Map();
  window.isTauri = true;
  addEventListener("unhandledrejection", event => unexpected.push({ command: "unhandledrejection", args: String(event.reason?.stack ?? event.reason) }));
  const emit = (event, payload) => {
    for (const [id, listener] of [...listeners]) {
      if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload: copy(payload) });
    }
  };
  const forbidden = (command, args) => {
    unexpected.push({ command, args: copy(args) });
    throw new Error(`Unexpected native IPC: ${command}`);
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback(callback, once = false) {
      const id = nextCallback++;
      callbacks.set(id, payload => { if (once) callbacks.delete(id); callback(payload); });
      return id;
    },
    unregisterCallback(id) { callbacks.delete(id); },
    convertFileSrc(path) { return `asset://localhost/${encodeURIComponent(path)}`; },
    async invoke(command, args = {}) {
      calls.push({ command, args: copy(args), at: now });
      switch (command) {
        case "plugin:event|listen": {
          const id = nextListener++;
          listeners.set(id, { event: args.event, handler: args.handler });
          return id;
        }
        case "plugin:event|unlisten": listeners.delete(args.eventId); return;
        case "plugin:deep-link|get_current": return null;
        case "plugin:webview|set_webview_zoom":
        case "update_window_vibrancy":
        case "set_quit_handler_ready": return;
        case "get_settings": await defaults; return copy(settings);
        case "update_settings": await defaults; settings = copy(args.settings); return copy(settings);
        case "get_app_prefs": await defaults; return copy(prefs);
        case "db_first_run_onboarding_step": return "999";
        case "db_list_repos":
        case "db_list_workspaces": return [];
        case "db_read_navigation_sections": return null;
        case "local_storage_get_entry": return localEntries.get(JSON.stringify([args.args.subsystem, args.args.id])) ?? null;
        case "local_storage_set_entry": localEntries.set(JSON.stringify([args.args.subsystem, args.args.id]), args.args.content); return { success: true };
        case "reason_cli_ensure_current": return { path: "/synthetic/bin/reason", version: "fixture" };
        case "get_agent_binary_state": return [];
        case "cli_login_status": return { installed: false, authenticated: false };
        case "local_account": return { name: "", email: null };
        case "reason_account_status": return null;
        case "reason_cloud_setup": return {
          signedIn: false, identity: null, funding: null, agentsAvailable: null, repositories: null,
          error: { code: "authentication_required", message: "Synthetic signed-out boundary" },
        };
        case "check_full_disk_access": return true;
        case "app_info": return { name: "OpenConductor", version: "0.1.0", platform: "macos" };
        case "session_statuses": return [...sessions.values()]
          .filter(row => row.status !== "idle" && (args.includeHidden === true || !row.isHidden))
          .map(({ chatId, workspaceId, status }) => ({ chatId, workspaceId, status }));
        case "session_set_status": {
          const row = sessions.get(args.chatId);
          if (!row) return forbidden(command, args);
          row.status = args.status;
          emit("session-status", { chatId: row.chatId, workspaceId: row.workspaceId, status: row.status });
          return;
        }
        case "execute_shell_command": {
          if (args.request?.command === "xcodebuild -license check 2>&1") return shellOutput("");
          if (args.request?.command === "pmset -g batt") return shellOutput(rawBattery);
          return forbidden(command, args);
        }
        case "execute_shell_command_cancellable": {
          if (args.request?.command !== "exec caffeinate -i" || typeof args.id !== "string" || runs.has(args.id)) return forbidden(command, args);
          return new Promise(resolve => {
            runs.set(args.id, { registered: !delayedRegistration, exited: false, resolve });
          });
        }
        case "cancel_shell_command": {
          const run = runs.get(args.id);
          const stopped = !!run?.registered && !run.exited;
          calls.at(-1).result = stopped;
          return stopped;
        }
        default: return forbidden(command, args);
      }
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(_event, id) { listeners.delete(id); },
  };
  window.setInterval = (callback, delay, ...args) => {
    if (delay !== 60000) return nativeSetInterval(callback, delay, ...args);
    const id = nextTimer--;
    polls.set(id, { callback: () => callback(...args), due: now + delay, delay });
    return id;
  };
  window.clearInterval = id => {
    if (polls.delete(id)) return;
    nativeClearInterval(id);
  };
  window.__caffeinateHost = {
    initialize(defaultSettings, defaultPrefs) {
      settings = copy(defaultSettings);
      settings.general.caffeinate_while_agents_running = enabled;
      prefs = copy(defaultPrefs);
      defaultsReady();
    },
    snapshot() {
      return {
        calls: copy(calls), unexpected: copy(unexpected), settings: copy(settings),
        sessions: copy([...sessions.values()]), polls: polls.size,
        runs: [...runs].map(([id, run]) => ({ id, registered: run.registered, exited: run.exited })),
      };
    },
    status(chatId, status) {
      const row = sessions.get(chatId);
      if (!row) throw new Error(`No stored session row ${chatId}`);
      row.status = status;
      emit("session-status", { chatId, workspaceId: row.workspaceId, status });
    },
    battery(value) { rawBattery = value; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...polls.values()].filter(timer => timer.due <= end).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        now = next.due;
        next.due += next.delay;
        next.callback();
      }
      now = end;
    },
    register(id) {
      const run = runs.get(id);
      if (!run) throw new Error(`No pending shell invocation ${id}`);
      run.registered = true;
    },
    exit(id) {
      const run = runs.get(id);
      if (!run || run.exited) throw new Error(`No running shell invocation ${id}`);
      run.exited = true;
      run.resolve(shellOutput(""));
    },
  };
}

export async function startHost() {
  const executablePath = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => p && existsSync(p));
  assert.ok(executablePath, "Chrome is required: set CHROME_PATH or install a system Chrome; browser tests cannot skip");
  const server = await startViteFixture();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch (error) {
    await server.close();
    throw error;
  }
  return {
    async fixture({ rows = [session("busy")], battery = BATTERY.eleven, enabled = false, delayedRegistration = false } = {}) {
      assert.equal(new Set(rows.map(row => row.chatId)).size, rows.length, "session table primary keys must be unique");
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const blocked = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(server.base).origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
        blocked.push(route.request().url());
        return route.abort("blockedbyclient");
      });
      await page.addInitScript(nativeBoundary, { rows, battery, enabled, delayedRegistration });
      try {
        await page.goto(`${server.base}/settings/user/general`, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
          const [{ DEFAULT_SETTINGS }, { DEFAULT_APP_PREFS }] = await Promise.all([
            import("/src/settings/types.ts"), import("/src/settings/appPrefs.ts"),
          ]);
          window.__caffeinateHost.initialize(DEFAULT_SETTINGS, DEFAULT_APP_PREFS);
        });
        const toggle = page.getByRole("switch", { name: SWITCH_NAME, exact: true });
        await toggle.waitFor();
        assert.equal(await toggle.isChecked(), enabled, "actual General setting must hydrate before product assertions");
        await page.waitForFunction(() => window.__caffeinateHost.snapshot().calls.some(call => call.command === "session_statuses"));
        await page.waitForFunction(() => window.__caffeinateHost.snapshot().calls.some(call => call.command === "check_full_disk_access"));
        const snapshot = () => page.evaluate(() => window.__caffeinateHost.snapshot());
        const tick = async () => {
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        };
        const clean = async () => {
          assert.deepEqual((await snapshot()).unexpected, [], "unexpected IPC is a harness failure, not product RED");
          assert.deepEqual(errors, [], "loader/page errors are not product RED");
          assert.deepEqual(blocked, [], "the test must not attempt external service requests");
        };
        await tick();
        await clean();
        assert.deepEqual((await snapshot()).sessions, rows, "seeded stored session rows must exist before assertions");
        return {
          page, snapshot, tick, clean,
          async setEnabled(value) { await toggle.setChecked(value); await tick(); },
          async status(chatId, status) { await page.evaluate(([id, value]) => window.__caffeinateHost.status(id, value), [chatId, status]); await tick(); },
          async battery(value) { await page.evaluate(value => window.__caffeinateHost.battery(value), value); },
          async advance(ms) { await page.evaluate(ms => window.__caffeinateHost.advance(ms), ms); await tick(); },
          async register(id) { await page.evaluate(id => window.__caffeinateHost.register(id), id); await tick(); },
          async exit(id) { await page.evaluate(id => window.__caffeinateHost.exit(id), id); await tick(); },
          async statuses() { return page.evaluate(async () => [...(await import("/src/features/chat/chatRuntime.ts")).chatStatuses()]); },
          async close() { try { await clean(); } finally { await context.close(); } },
        };
      } catch (error) {
        const state = await page.evaluate(() => window.__caffeinateHost?.snapshot()).catch(() => null);
        await context.close();
        throw new Error(`Whole-main host failed before product assertion: ${JSON.stringify({ errors, blocked, unexpected: state?.unexpected })}`, { cause: error });
      }
    },
    async close() { try { await browser.close(); } finally { await server.close(); } },
  };
}
