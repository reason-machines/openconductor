#!/usr/bin/env node
// Screenshots of Conductor's reference transcript turn in the built desktop app.
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) against tools/reason-acp/fake_reason_acp.py standing in for
// `reason acp`. The fake's "lisbon" command (sent here as its alias, the
// fixture's own user message) replays tools/screens/seed-data.js 'lisbon':
// text, Grep, Read, text, Edit, Bash, text, each tool with its provider name
// and raw input. The screenshots are compared with Conductor's by eye; only
// stable facts are asserted: this ACP turn is one message, so its commentary,
// four tools and final reply stay inline below the three-message threshold.
// Distinct-message summary coverage lives in toolGroups.test.ts.
//
// Writes to E2E_OUT:
//   transcript-inline.png     the finished single-message ACP turn
//   transcript-rects.json     getBoundingClientRect of the first user bubble
//                             (.chat-msg.chat-user) and of .transcript
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/transcript-parity.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for the output (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: transcript-parity.e2e.mjs <app binary>");
  process.exit(2);
}

/** The fixture's user message; the fake treats it as the "lisbon" command. */
const PROMPT = "After signing in, users with an expired session get bounced between /login and /dashboard forever. Can you find out why and fix it?";

// A fresh HOME: the app starts `reason acp` there, and the fake keeps its
// Sessions in HOME/state.json. The workspace folder is a git repo inside it.
const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-home-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// `reason` on PATH is the fake; the app finds it with find_reason_cli.
const bin = join(home, "bin");
mkdirSync(bin);
const fake = join(repoRoot, "tools/reason-acp/fake_reason_acp.py");
writeFileSync(join(bin, "reason"), `#!/bin/sh\nexec python3 "${fake}" "$@"\n`);
chmodSync(join(bin, "reason"), 0o755);

const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
delete env.REASON_CLI;
// The app data folder (conductor.db, worktrees) must be under the fresh HOME too.
delete env.XDG_DATA_HOME;
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
let sessionUrl = null;

async function wd(method, path, body) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}

/** Finds one element and returns its WebDriver id (W3C key, or the legacy JSON Wire "ELEMENT"). */
async function find(css) {
  const el = await wd("POST", "/element", { using: "css selector", value: css });
  const id = el?.[W3C_ELEMENT] ?? el?.ELEMENT;
  if (!id) throw new Error(`no element id for ${css}: ${JSON.stringify(el)}`);
  return id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (script, ...args) => wd("POST", "/execute/sync", { script, args });
/** Runs `script` in the page; it calls the last argument with its result. */
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

async function screenshot(name) {
  const png = await wd("GET", "/screenshot");
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(png, "base64"));
  console.log(`screenshot: ${file}`);
}

const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[aria-label^=\"Stop the agent\"]');");

/**
 * Sets the composer's text through a normal contenteditable insertText edit, then clicks Send. Typing with WebDriver's element/value loses keys
 * when the workspace's auto-opened terminal takes focus mid-typing (see #402).
 */
async function send(text) {
  await run(
    `const ta = document.querySelector('.composer [contenteditable=true]');
     ta.focus(); const selection = getSelection(); selection.selectAllChildren(ta);
     document.execCommand('insertText', false, arguments[0]);
     return true;`,
    text,
  );
  await waitFor("the composer to hold the prompt", () => run("return document.querySelector('.composer [contenteditable=true]').textContent === arguments[0];", text));
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
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
  // Conductor's reference screenshots are 1440x900; not every driver can resize.
  await wd("POST", "/window/rect", { width: 1440, height: 900 }).then(
    () => pass("window set to 1440x900"),
    (e) => console.log(`# window size unchanged: ${e.message}`),
  );

  // Seed one repo with one workspace through the real backend, as reason-chat.e2e.mjs does.
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const seeded = await runAsync(
    `const done = arguments[arguments.length - 1];
     const invoke = window.__TAURI_INTERNALS__.invoke;
     // The same explicit Reason workspace and default model as reason-chat.e2e.mjs.
     invoke("get_settings")
       .then((s) => invoke("update_settings", { settings: { ...s, reason: { ...s.reason, workspace: "ws-a" }, models: { ...s.models, default: "opus-5-5-1m" } } }))
       .then(() => invoke("add_repository", { path: arguments[0] }))
       .then((repo) => invoke("create_workspace", { repositoryId: repo.id, branchName: "lisbon", directoryName: "lisbon", baseBranch: null, existingBranch: false, prNumber: null }))
       .then((created) => done({ workspace: created.workspace }), (err) => done({ error: String(err) }));`,
    project,
  );
  assert.ok(seeded?.workspace, `seeding failed: ${JSON.stringify(seeded)}`);
  const workspace = seeded.workspace;
  const prefs = { selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] };
  await run("localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); location.reload();", JSON.stringify(prefs));
  await waitFor("the workspace chat composer", () => run("return !!document.querySelector('.composer [contenteditable=true]');"));
  pass("the workspace chat is open");

  await send(PROMPT);
  await waitFor("the final reply", () => chatText().then((t) => t && t.includes("Expired sessions now go straight to")), 60000);
  await waitFor("the turn to end", async () => !(await running()), 30000);
  pass("the lisbon turn ended with its final reply");
  await sleep(500); // let the end-of-turn layout settle before the screenshot
  await screenshot("transcript-inline");

  const rects = await run(`
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return {
      window: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      userBubble: rect(document.querySelector('.chat-msg.chat-user')),
      transcript: rect(document.querySelector('.transcript')),
    };`);
  writeFileSync(join(out, "transcript-rects.json"), JSON.stringify(rects, null, 2) + "\n");
  console.log(`rects: ${JSON.stringify(rects)}`);

  const inline = await run(`
    const chat = document.querySelector('.chat-scroll');
    return {
      summaries: chat.querySelectorAll('.chat-tool-summary-row').length,
      grouped: chat.querySelectorAll('[data-tool-group]').length,
      texts: [...chat.querySelectorAll('.chat-assistant .chat-text')].map((e) => e.innerText.trim().replace(/\\s+/g, ' ')),
      code: [...chat.querySelectorAll('.chat-assistant .chat-text code')].map((e) => e.textContent),
      tools: [...chat.querySelectorAll('.chat-tool[data-tool-input]')].map((e) => JSON.parse(e.getAttribute('data-tool-input')).toolName),
    };`);
  assert.equal(inline.summaries, 0, "one ACP assistant message is below the three-message threshold");
  assert.equal(inline.grouped, 0, "commentary and tools remain outside summary groups");
  assert.deepEqual(inline.texts, [
    "I’ll look at how the login route decides where to send a signed-in user.",
    "Found it. redirectTo treats any session object as signed in, including an expired one, while the dashboard loader rejects expired sessions and sends the user back to /login. I’ll check expiresAt before redirecting.",
    "Fixed. Expired sessions now go straight to /login instead of looping. src/lib/auth.ts: only redirect to the dashboard when the session has not expired. Tests: pnpm test src/lib/auth.test.ts passes (4 tests).",
  ], "exact commentary and final reply remain visible in order");
  assert.deepEqual(inline.code, ["redirectTo", "/login", "expiresAt", "/login", "src/lib/auth.ts", "pnpm test src/lib/auth.test.ts"], "commentary and final reply retain Markdown code spans");
  assert.deepEqual(inline.tools, ["Grep", "Read", "Edit", "Bash"], "all four provider tool calls remain visible in order");
  pass("the one-message ACP turn keeps exact Markdown commentary, four tools and final reply inline");

  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("failure").catch(() => {});
    await chatText().then((t) => console.error(`chat text:\n${t}`)).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
