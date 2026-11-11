#!/usr/bin/env node
// End-to-end test of Claude Code chats through the built desktop app, under
// each Claude Code auth mode of Settings › Agents › Claude Code.
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) against tools/e2e/fake_claude.py standing in for `claude`, so it
// needs no Anthropic account. The fake replies "turn N: <prompt> (auth: X)",
// X being the credential Claude Code would use, and logs a fingerprint of each
// credential variable its launch got (never the value).
//
// The app starts with a fresh HOME that already holds a Claude Code login
// (~/.claude/.credentials.json and ~/.claude.json's oauthAccount), no
// OpenConductor settings, and a stale ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL
// "left in the shell":
//
//   1. import    a Claude Code chat runs a turn on that login with no sign-in
//                step; its launch has no key and no base URL (the shell's are
//                cleared, as Conductor 0.87.6 deletes them); Settings › Agents ›
//                Claude Code shows CLI, Connected, the account's email, and no
//                "claude /login" button
//   2. API key   the API key card, a key typed and saved: stored as
//                [providers.claude] kind = "anthropic_api", the key not in
//                settings.toml; a new chat's launch has ANTHROPIC_API_KEY =
//                the stored key and the reply says auth apikey
//   3. CLI       (Claude subscription login) the CLI card: stored as
//                kind = "claude_login"; a new chat's launch has no key and the
//                reply says auth login
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/claude-chat.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";
import { finishStartup } from "../../tests/e2e/startup.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: claude-chat.e2e.mjs <app binary>");
  process.exit(2);
}

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-claude-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// An existing Claude Code login, as `claude /login` leaves it on Linux: the
// credentials file and the account in ~/.claude.json. Fake values only.
mkdirSync(join(home, ".claude"), { recursive: true });
writeFileSync(
  join(home, ".claude", ".credentials.json"),
  JSON.stringify({ claudeAiOauth: { accessToken: "e2e-fake-access", refreshToken: "e2e-fake-refresh", expiresAt: 4102444800000, scopes: ["user:inference"] } }),
  { mode: 0o600 },
);
const EMAIL = "e2e@example.com";
writeFileSync(join(home, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, oauthAccount: { emailAddress: EMAIL, organizationName: "E2E Org" } }));

// `claude` in ~/.local/bin is the fake; find_claude_cli looks there even when PATH does not list it.
const bin = join(home, ".local", "bin");
mkdirSync(bin, { recursive: true });
const fake = join(repoRoot, "tools/e2e/fake_claude.py");
writeFileSync(join(bin, "claude"), `#!/bin/sh\nexec python3 "${fake}" "$@"\n`);
chmodSync(join(bin, "claude"), 0o755);

const env = { ...process.env, HOME: home, OPENCONDUCTOR_HOME: join(home, ".openconductor"), SHELL: "/bin/bash" };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]) delete env[k];
// Left in the user's shell: only the API key mode may hand Claude Code a key, and it must be the stored one.
env.ANTHROPIC_API_KEY = "sk-ant-e2e-left-in-the-shell";
env.ANTHROPIC_BASE_URL = "https://stale.example";
env.BROWSER = "true";
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
const startup = new WebDriver(base);
let sessionUrl = null;

async function wd(method, path, body, timeoutMs = 45000) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => {
    throw new Error(`${method} ${path}: ${e.message}`);
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}

async function find(css) {
  const el = await wd("POST", "/element", { using: "css selector", value: css });
  const id = el?.[W3C_ELEMENT] ?? el?.ELEMENT;
  if (!id) throw new Error(`no element id for ${css}: ${JSON.stringify(el)}`);
  return id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (script, ...args) => wd("POST", "/execute/sync", { script, args });
const runAsync = (script, ...args) => wd("POST", "/execute/async", { script, args });

async function waitFor(what, fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}; last: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function screenshot(name, timeoutMs) {
  const png = await wd("GET", "/screenshot", undefined, timeoutMs);
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(png, "base64"));
  console.log(`screenshot: ${file}`);
}

const fakeLog = join(home, "claude-fake.jsonl");
const requests = () =>
  existsSync(fakeLog)
    ? readFileSync(fakeLog, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
    : [];
const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[aria-label^=\"Stop the agent\"]');");
const signInNotice = () => run("const n = document.querySelector('[data-testid=\"chat-sign-in\"]'); return n ? n.textContent : null;");
const chip = () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.textContent ?? null;");

async function send(text) {
  await wd("POST", `/element/${await find(".composer [contenteditable=true]")}/value`, { text });
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
}

/** Picks Claude Code in the composer's model picker (Conductor's picker picks the agent too). */
async function pickClaude(shot) {
  await waitFor("the model picker chip", () => chip());
  await run("document.querySelector(\"[data-testid='composer-model-button']\").click();");
  await waitFor("Claude Code in the model picker", () =>
    run("return [...document.querySelectorAll('.oc-model-menu .oc-model-item')].some((b) => b.textContent.trim() === 'Claude Code') || null;"),
  );
  if (shot) await screenshot(shot);
  await run("[...document.querySelectorAll('.oc-model-menu .oc-model-item')].find((b) => b.textContent.trim() === 'Claude Code').click();");
  await waitFor("Claude Code on the picker chip", () => chip().then((c) => (c && c.includes("Claude Code")) || null));
}

/** Sends `prompt` and returns the launch line of the `claude` process that answered it. */
async function turn(prompt, auth) {
  await send(prompt);
  const reply = `turn 1: ${prompt} (auth: ${auth})`;
  await waitFor(`"${reply}"`, () => chatText().then((t) => t && t.includes(reply)), 45000).catch(async (e) => {
    throw new Error(`${e.message}; chat: ${JSON.stringify(await chatText())}`);
  });
  await waitFor("the turn to finish", async () => !(await running()));
  const all = requests();
  const user = all.find((r) => r.stdin?.type === "user" && JSON.stringify(r.stdin).includes(prompt));
  assert.ok(user, `claude got "${prompt}"`);
  const launch = all.find((r) => r.launch && r.pid === user.pid)?.launch;
  assert.ok(launch, `a launch line for pid ${user.pid}`);
  assert.ok(launch.args.includes("stream-json"), `a chat launch: ${JSON.stringify(launch.args)}`);
  assert.equal(await signInNotice(), null, "no sign-in notice under the turn");
  return launch;
}

const steps = [];
const pass = (s) => {
  steps.push(s);
  console.log(`ok - ${s}`);
};

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const session = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } },
  });
  sessionUrl = `${base}/session/${session.sessionId}`;
  startup.sessionId = session.sessionId;

  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const seeded = await runAsync(
    `const done = arguments[arguments.length - 1];
     const invoke = window.__TAURI_INTERNALS__.invoke;
     invoke("add_repository", { path: arguments[0] })
       .then((repo) => invoke("create_workspace", { repositoryId: repo.id, branchName: "e2e", directoryName: "e2e", baseBranch: null, existingBranch: false, prNumber: null }))
       .then((created) => done({ workspace: created.workspace }), (err) => done({ error: String(err) }));`,
    project,
  );
  assert.ok(seeded?.workspace, `seeding failed: ${JSON.stringify(seeded)}`);
  const workspace = seeded.workspace;
  const prefs = { selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] };
  await run("localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); location.reload();", JSON.stringify(prefs));
  await finishStartup(startup);
  await waitFor("the chat panel", () => chatText().then((t) => t && t.includes("You’re in a new copy of")));

  const claudeSettings = () =>
    runAsync("const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('get_settings').then((s) => done({ stored: s.providers?.claude ?? null }), (e) => done({ error: String(e) }));");
  const settingsFile = () => {
    const f = join(home, ".openconductor", "settings.toml");
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  };
  const fingerprint = (v) => createHash("sha256").update(v).digest("hex").slice(0, 16);
  const NO_KEYS = { ANTHROPIC_API_KEY: null, ANTHROPIC_AUTH_TOKEN: null, CLAUDE_CODE_OAUTH_TOKEN: null };

  // 1. Import: the existing login works with no setup.
  assert.deepEqual(await claudeSettings(), { stored: null }, "fresh: no Claude Code provider stored");
  await pickClaude("claude-0-model-picker");
  const imported = await turn("import: hello", "login");
  assert.deepEqual(imported.keys, NO_KEYS, "the shell's ANTHROPIC_API_KEY is cleared");
  assert.equal(imported.base_url, null, "the shell's ANTHROPIC_BASE_URL is cleared");
  assert.equal(imported.login_file, true, "Claude Code sees its own login in the fresh HOME");
  await screenshot("claude-1-import-turn", 10000).catch((e) => console.log(`# no screenshot: ${e.message}`));
  pass('import: a fresh HOME with a Claude Code login runs a turn with no sign-in step: "turn 1: import: hello (auth: login)", no key or base URL from the shell');

  const tab = 'section[aria-label="Claude Code"]';
  const openClaudeTab = async () => {
    await run("window.dispatchEvent(new CustomEvent('openconductor:open-settings', { detail: { page: 'providers', providerTab: 'claude' } }));");
    await waitFor("the Claude Code tab", () => run(`return !!document.querySelector('${tab} button[aria-pressed]') || null;`));
  };
  const pressedCard = () => run(`return [...document.querySelectorAll('${tab} button[aria-pressed="true"]')].map((b) => b.textContent);`);
  const authStatus = () => run(`const s = document.querySelector('${tab} [data-testid="agent-auth-status"]'); return s ? s.innerText : '';`);
  const settled = (text) =>
    waitFor(`the status line to settle on "${text}"`, () =>
      run(`const s = document.querySelector('${tab} [data-testid="agent-auth-status"]'); return !!s && s.innerText.includes(arguments[0]) && !s.querySelector('button:disabled');`, text),
      20000,
    ).catch(async (e) => {
      throw new Error(`${e.message}; status: ${JSON.stringify(await authStatus())}`);
    });
  const tabText = () => run(`return document.querySelector('${tab}')?.innerText ?? '';`);
  const clickIn = (css, text) =>
    run("const b = [...document.querySelectorAll(arguments[0])].find((b) => b.textContent === arguments[1]); if (!b) return false; b.click(); return true;", css, text);

  await openClaudeTab();
  assert.deepEqual(await pressedCard(), ["CLI"], "no [providers.claude] reads as CLI");
  await settled("Connected");
  const shown = await tabText();
  assert.ok(shown.includes(EMAIL), `the account's email on the tab: ${shown}`);
  assert.ok(shown.includes("2.1.319"), `the CLI version on the tab: ${shown}`);
  assert.ok(!shown.includes("claude /login"), "no login prompt");
  await screenshot("claude-2-import-settings");
  pass(`import: Settings › Agents › Claude Code shows CLI, Connected, ${EMAIL}, version 2.1.319, and no "claude /login" button`);

  // 2 and 3: each auth mode, set on the tab as a user does, then a turn in a new chat (its own claude process).
  const API_KEY = "sk-ant-e2e-0123456789-mode";
  const modes = [
    {
      id: "apikey",
      card: "API key",
      stored: (s) => s.stored?.kind === "anthropic_api",
      async connect() {
        await settled("No Anthropic API key configured");
        await wd("POST", `/element/${await find(`${tab} input[aria-label="Anthropic API key"]`)}/value`, { text: API_KEY });
        assert.ok(await clickIn(`${tab} button`, "Save"));
        await waitFor("the masked key", () => run(`return document.querySelector('${tab} [data-testid="secret-value"]')?.textContent.endsWith('mode') || null;`));
        await settled("Connected");
        assert.ok(!settingsFile().includes(API_KEY), "the key stays out of settings.toml");
      },
      auth: "apikey",
      keys: { ...NO_KEYS, ANTHROPIC_API_KEY: fingerprint(API_KEY) },
    },
    {
      id: "subscription",
      card: "CLI",
      stored: (s) => s.stored?.kind === "claude_login",
      async connect() {
        await settled("Connected");
        assert.ok(!(await tabText()).includes("claude /login"), "no login prompt");
      },
      auth: "login",
      keys: NO_KEYS,
    },
  ];
  for (const mode of modes) {
    await openClaudeTab();
    assert.ok(await clickIn(`${tab} button[aria-pressed]`, mode.card), `the ${mode.card} card`);
    await waitFor(`the ${mode.card} card selected`, async () => (await pressedCard())[0] === mode.card);
    const stored = await waitFor(`${mode.id} stored in settings.toml`, () => claudeSettings().then((s) => (mode.stored(s) ? s.stored : null)), 15000).catch(async (e) => {
      throw new Error(`${e.message}; settings: ${JSON.stringify(await claudeSettings())}`);
    });
    await mode.connect();
    await screenshot(`claude-3-${mode.id}-settings`);
    pass(`${mode.id}: the ${mode.card} card stores ${JSON.stringify(stored)}`);

    console.log(`# ${mode.id}: back to the workspace, new chat`);
    await run("document.querySelector('.settings-back').click();");
    await waitFor("the workspace", () => run("return !!document.querySelector('.main-tab-new-button') || null;"));
    await run("document.querySelector('.main-tab-new-button').click();");
    await waitFor("the new, empty chat", () => chatText().then((t) => t !== null && !/turn \d+:/.test(t)));
    await pickClaude();
    const prompt = `mode ${mode.id}`;
    const launch = await turn(prompt, mode.auth);
    assert.deepEqual(launch.keys, mode.keys, `${mode.id}: the credential variables Claude Code got`);
    assert.equal(launch.base_url, null, `${mode.id}: no base URL from the shell`);
    await screenshot(`claude-4-${mode.id}-turn`, 10000).catch((e) => console.log(`# no screenshot: ${e.message}`));
    pass(`${mode.id}: a new chat's turn renders "turn 1: ${prompt} (auth: ${mode.auth})"; its claude got ${mode.keys.ANTHROPIC_API_KEY ? "the stored key" : "no key"}`);
  }

  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("claude-failure", 10000).catch(() => {});
    await chatText().then((t) => console.error(`chat text:\n${t}`)).catch(() => {});
  }
  console.error(`fake claude log:\n${requests().map((r) => JSON.stringify(r)).join("\n")}`);
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
