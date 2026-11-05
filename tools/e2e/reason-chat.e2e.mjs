#!/usr/bin/env node
// End-to-end test of a Reason chat through the built desktop app.
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) against tools/reason-acp/fake_reason_acp.py standing in for
// `reason acp`, so it needs no Reason sign-in. One workspace chat:
//
//   1. "local"           a tool row whose path is in the workspace folder under
//                        HOME, marked local with relative path a.txt
//   2. "cloud"           a follow-up whose tool row is under a cloud Session's
//                        /repo checkout, marked cloud with the same a.txt
//   3. "echo: follow-up" the reply says "turn 3", so one Reason Session ran
//                        all three turns
//   4. "slow", then Stop the turn ends as "Stopped."
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/reason-chat.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: reason-chat.e2e.mjs <app binary>");
  process.exit(2);
}

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
const running = () => run("return !!document.querySelector('.composer button[title=\"Stop the agent\"]');");

async function send(text) {
  await wd("POST", `/element/${await find(".composer textarea")}/value`, { text });
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
}

/** Expands every tool row and returns each row's tool input. */
const toolInputs = () =>
  run(`
    for (const b of document.querySelectorAll('.chat-tool-head[aria-expanded="false"]')) b.click();
    return [...document.querySelectorAll('.chat-tool-body > pre:first-child')].map((p) => p.textContent);
  `).then((texts) => texts.map((t) => JSON.parse(t)));

/** A finished turn has no Stop button. */
const turnDone = (n) => waitFor(`turn ${n} to finish`, async () => !(await running()));

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

  // Seed one repo with one workspace whose folder is the git repo above.
  const state = {
    repos: [
      {
        id: "repo-e2e", name: "proj", path: project, defaultBranch: "main",
        workspaces: [{
          id: "ws-e2e", name: "e2e", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0,
          path: project, placeholderBranchName: null, userSetWorkspaceName: true, userSetBranchName: true,
        }],
      },
    ],
    selection: { kind: "workspace", repoId: "repo-e2e", workspaceId: "ws-e2e" },
  };
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  await run("localStorage.setItem('openconductor.shell.v1', arguments[0]); location.reload();", JSON.stringify(state));
  const placeholder = await waitFor("the Reason chat panel", () => chatText().then((t) => t && t.includes("Reason runs this chat") && t));
  pass(`the desktop chat panel runs Reason: "${placeholder.split("\n").find((l) => l.includes("Reason runs"))}"`);

  // 1. A local path: in the workspace folder under HOME.
  await send("local");
  const local = await waitFor("the local tool row", async () => {
    const rows = await toolInputs();
    return rows.length >= 1 && rows[0].paths?.length ? rows[0].paths[0] : null;
  });
  assert.equal(local.place, "local", JSON.stringify(local));
  assert.equal(local.relative, "a.txt");
  assert.equal(local.raw, join(project, "a.txt"));
  assert.ok(local.raw.startsWith(home + "/"), `${local.raw} is under HOME ${home}`);
  await turnDone(1);
  pass(`turn 1 tool row is local: ${local.raw} (relative ${local.relative})`);

  // 2. A follow-up in the same chat: a cloud Session's /repo checkout.
  await send("cloud");
  const cloud = await waitFor("the cloud tool row", async () => {
    const rows = await toolInputs();
    return rows.length >= 2 && rows[1].paths?.length ? rows[1].paths[0] : null;
  });
  assert.equal(cloud.place, "cloud", JSON.stringify(cloud));
  assert.equal(cloud.relative, "a.txt");
  assert.equal(cloud.sessionId, "child-1");
  assert.match(cloud.raw, /^\/home\/runner\/\.reason\/workspace\/sessions\/child-1\/repo\/a\.txt$/);
  await turnDone(2);
  pass(`turn 2 tool row is cloud: ${cloud.raw} (Session ${cloud.sessionId}, relative ${cloud.relative})`);

  // 3. Another follow-up: the reply counts turns in the one Reason Session.
  await send("echo: follow-up");
  await waitFor('"turn 3: follow-up"', () => chatText().then((t) => t.includes("turn 3: follow-up")));
  await turnDone(3);
  pass('turn 3 reply is "turn 3: follow-up": the same Reason Session ran all three turns');
  await screenshot("reason-chat-local-cloud-followup");

  // 4. Stop.
  await send("slow");
  await waitFor("the Stop button", running);
  await wd("POST", `/element/${await find('.composer button[title="Stop the agent"]')}/click`, {});
  await waitFor('"Stopped."', () => chatText().then((t) => t.includes("Stopped.")), 15000);
  await turnDone(4);
  pass('Stop ends the running turn: "Stopped."');
  await screenshot("reason-chat-stopped");

  const sessions = Object.keys(JSON.parse(readFileSync(join(home, "state.json"), "utf8")).sessions);
  assert.deepEqual(sessions, ["sess-1"], "one Reason Session for the workspace");
  pass(`the fake CLI saw one Session: ${sessions.join(", ")}`);

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
