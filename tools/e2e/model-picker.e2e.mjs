#!/usr/bin/env node
// The composer's model picker in a Reason chat, through the built desktop app.
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) against tools/reason-acp/fake_reason_acp.py standing in for
// `reason acp`, with Settings' default model left at its stored default
// (`opus`, a Claude alias Reason has no fixed model for):
//
//   1. a new chat: the chip shows what its first Session will run ("Auto")
//   2. the picker lists Reason's models by Reason's names ("Claude Opus 5.5")
//   3. after a turn: the chip shows the model and effort the Session ran on,
//      as `reason session get` reports it (the fake: Claude Opus 5.5, High)
//   4. a pick on a chat that has a Session reaches that Session: the next
//      turn runs it (the fake's "config" reply names the Session's options)
//
// Screenshots of each step go to E2E_OUT. With E2E_CAPTURE_ONLY=1 the steps
// are captured without assertions, to record an older build for comparison.
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/model-picker.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: model-picker.e2e.mjs <app binary>");
  process.exit(2);
}
const captureOnly = process.env.E2E_CAPTURE_ONLY === "1";
const check = (fn) => (captureOnly ? undefined : fn());

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-picker-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

const bin = join(home, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "reason"), `#!/bin/sh\nexec python3 "${join(repoRoot, "tools/reason-acp/fake_reason_acp.py")}" "$@"\n`);
chmodSync(join(bin, "reason"), 0o755);

const env = { ...process.env, HOME: home, OPENCONDUCTOR_HOME: join(home, ".openconductor"), PATH: `${bin}:${process.env.PATH}` };
delete env.REASON_CLI;
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
    // A WebDriver call the page never answers fails the run instead of hanging it.
    signal: AbortSignal.timeout(60000),
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

// WebKitGTK answers /screenshot only after the page's next paint, so an idle
// page is kept repainting until it is taken (as tests/e2e/webdriver.mjs does).
const REPAINT = `let el = document.getElementById("__oc_e2e_repaint");
if (!el) { el = document.createElement("div"); el.id = "__oc_e2e_repaint"; el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none"; document.documentElement.appendChild(el); }
clearInterval(window.__ocE2eRepaint);
window.__ocE2eRepaint = setInterval(() => { el.style.outline = el.style.outline ? "" : "1px solid transparent"; }, 50);`;
const REPAINT_STOP = `clearInterval(window.__ocE2eRepaint); document.getElementById("__oc_e2e_repaint")?.remove();`;

async function screenshot(name) {
  await run(REPAINT);
  const png = await wd("GET", "/screenshot").finally(() => run(REPAINT_STOP).catch(() => undefined));
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(png, "base64"));
  console.log(`screenshot: ${file}`);
}

const CHIP = "[data-testid='composer-model-button']";
const chipTitle = () => run(`return document.querySelector("${CHIP}")?.title || null;`);
const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[aria-label^=\"Stop the agent\"]');");
const menuItems = () => run("return [...document.querySelectorAll('.oc-model-menu .oc-model-list .oc-model-item:not(.oc-model-add) .oc-model-item-name')].map((e) => e.textContent);");
const checkedItem = () => run("return document.querySelector('.oc-model-menu .oc-model-item[data-selected] .oc-model-item-name')?.textContent ?? null;");

async function openPicker() {
  await wd("POST", `/element/${await find(CHIP)}/click`, {});
  await waitFor("the model menu", () => run("return !!document.querySelector('.oc-model-menu');"));
  await sleep(300);
}
async function closePicker() {
  await run("document.querySelector('.oc-model-menu input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;");
  await waitFor("the model menu to close", () => run("return !document.querySelector('.oc-model-menu');"));
}

async function send(text) {
  await wd("POST", `/element/${await find(".composer textarea")}/value`, { text });
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
}
const turnDone = (n) => waitFor(`turn ${n} to finish`, async () => !(await running()));

const report = [];
const note = (s) => {
  report.push(s);
  console.log(`ok - ${s}`);
};

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const session = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } } });
  sessionUrl = `${base}/session/${session.sessionId}`;
  if (process.env.E2E_WINDOW_RECT === "1") await wd("POST", "/window/rect", { width: 1280, height: 800 }).catch(() => undefined);

  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const seeded = await runAsync(
    `const done = arguments[arguments.length - 1];
     const invoke = window.__TAURI_INTERNALS__.invoke;
     invoke("get_settings")
       .then((s) => invoke("add_repository", { path: arguments[0] }).then((repo) => ({ s, repo })))
       .then(({ s, repo }) => invoke("create_workspace", { repositoryId: repo.id, branchName: "picker", directoryName: "picker", baseBranch: null, existingBranch: false, prNumber: null })
         .then((created) => done({ workspace: created.workspace, defaultModel: s.models.default })))
       .catch((err) => done({ error: String(err) }));`,
    project,
  );
  assert.ok(seeded?.workspace, `seeding failed: ${JSON.stringify(seeded)}`);
  const workspace = seeded.workspace;
  note(`Settings' default model is "${seeded.defaultModel}"`);
  assert.equal(workspace.branchName, "picker", "the seeded workspace has the requested branch");
  await run("location.reload(); return true;");
  const row = 'button[data-testid="left-sidebar-workspace-item"][title*=" · picker · "]';
  const rowId = await waitFor("the picker workspace row", async () => {
    const el = await run("return document.querySelector(arguments[0]);", row);
    if (el) return el[W3C_ELEMENT] ?? el.ELEMENT;
    const header = await run(`return [...document.querySelectorAll('.sb-repo-header[role="button"][aria-expanded="false"]')]
      .find((h) => h.querySelector('.sb-repo-name')?.textContent === 'proj') || null;`);
    if (header) await wd("POST", `/element/${header[W3C_ELEMENT] ?? header.ELEMENT}/click`, {});
    return null;
  });
  await wd("POST", `/element/${rowId}/click`, {});
  await waitFor("picker to be the open workspace", () => run("return document.querySelector(arguments[0])?.getAttribute('aria-current') === 'page';", row));
  await waitFor("the empty chat", () => chatText().then((t) => t && t.includes("You’re in a new copy of")));

  // 1. A new chat: what its first Session will run.
  const before = await waitFor("the model on the chip", chipTitle);
  await sleep(1500); // Reason's model list arrives from `reason_models`.
  const chip1 = await chipTitle();
  await screenshot("picker-1-new-chat");
  note(`new chat chip: "${chip1}"`);
  check(() => assert.equal(chip1, "Auto", `the default \`opus\` runs Reason's Auto (was "${before}")`));

  // 2. The list.
  await openPicker();
  const items1 = await menuItems();
  await screenshot("picker-2-list-new-chat");
  note(`picker lists: ${JSON.stringify(items1)}`);
  check(() => {
    for (const name of ["Auto", "Claude Opus 5.5", "GPT-5.6-Sol", "Claude Sonnet 5.5"]) assert.ok(items1.includes(name), `${name} is listed: ${JSON.stringify(items1)}`);
    assert.ok(!items1.includes("Opus 4.8"), "no Conductor-only name");
  });
  await closePicker();

  // 3. A turn on Auto: the chip shows what the Session ran on.
  await send("echo: hello");
  await waitFor('"turn 1: hello"', () => chatText().then((t) => t.includes("turn 1: hello")));
  await turnDone(1);
  const chip3 = captureOnly ? (await sleep(3000), await chipTitle()) : await waitFor("the Session's model on the chip", () => chipTitle().then((t) => (t !== "Auto" ? t : null)), 15000);
  await screenshot("picker-3-after-turn");
  note(`after a turn on Auto: "${chip3}"`);
  check(() => assert.equal(chip3, "Claude Opus 5.5 · High", "the model `reason session get` reports"));
  await openPicker();
  const checked = await checkedItem();
  await screenshot("picker-4-list-after-turn");
  note(`checked in the list: "${checked}"`);
  check(() => assert.equal(checked, "Claude Opus 5.5"));

  // 4. A pick on a chat that has a Session: the next turn runs it.
  if (!captureOnly) {
    await run(
      "const b = [...document.querySelectorAll('.oc-model-menu .oc-model-item')].find((e) => e.querySelector('.oc-model-item-name')?.textContent === arguments[0]); b.click(); return true;",
      "Claude Sonnet 5.5",
    );
    await waitFor("the menu to close", () => run("return !document.querySelector('.oc-model-menu');"));
    assert.equal(await chipTitle(), "Claude Sonnet 5.5");
    await send("config");
    const reply = await waitFor("the config reply", () => chatText().then((t) => /model=\S+ effort=\S+/.exec(t)?.[0]));
    await turnDone(2);
    assert.equal(reply, "model=byok:anthropic:claude-sonnet-5-5 effort=default", "the pick reached the chat's existing Session");
    const chip5 = await waitFor("the Session's model after the pick", () => chipTitle().then((t) => (t?.startsWith("Claude Sonnet 5.5 ·") ? t : null)), 15000);
    await screenshot("picker-5-after-pick");
    note(`picked Claude Sonnet 5.5 on the existing Session: reply "${reply}", chip "${chip5}"`);
  } else await closePicker();

  writeFileSync(join(out, "report.json"), JSON.stringify({ app, captureOnly, report }, null, 2));
  console.log(`\n${captureOnly ? "captured" : "passed"}: ${report.length} steps`);
} catch (e) {
  await screenshot("picker-failed").catch(() => undefined);
  throw e;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => undefined);
  driver.kill();
  await driverExited;
}
