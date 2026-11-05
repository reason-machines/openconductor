#!/usr/bin/env node
// End-to-end test of a Codex chat through the built desktop app.
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) against tools/e2e/fake_codex_app_server.py standing in for
// `codex app-server`, so it needs no OpenAI sign-in. The fake replays the turn
// recorded from Codex 0.166.0 on macOS. One workspace chat, agent set to Codex:
//
//   1. "hello"           an approval card for the command; Allow runs it: the
//                        command writes hello.txt in the workspace folder, a
//                        second command cats it, the reply is "hello from codex"
//   2. "follow-up"       the reply says "turn 2", so one Codex thread ran both
//   3. "hello" + Deny    "Deny and stop" ends the turn as "Interrupted by user"
//   4. "slow" + Stop     Stop interrupts the running turn: "Interrupted by user"
//   5. "elicit"          an MCP server asks for a form: the card, Needs input on
//                        the sidebar row; Continue sends the form's content
//   6. "perm" + Deny     Codex asks for network access: the card, Needs input;
//                        Deny grants nothing
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/codex-chat.e2e.mjs <path to the built app binary>
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
  console.error("usage: codex-chat.e2e.mjs <app binary>");
  process.exit(2);
}

// A fresh HOME: the fake logs every request to HOME/codex-fake.jsonl. The
// workspace folder is a git repo inside it.
const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-codex-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// `codex` in ~/.local/bin is the fake; the app finds it with find_codex_cli
// even when the login shell's PATH does not list that folder.
const bin = join(home, ".local", "bin");
mkdirSync(bin, { recursive: true });
const fake = join(repoRoot, "tools/e2e/fake_codex_app_server.py");
writeFileSync(join(bin, "codex"), `#!/bin/sh\nexec python3 "${fake}" "$@"\n`);
chmodSync(join(bin, "codex"), 0o755);

const env = { ...process.env, HOME: home, SHELL: "/bin/bash" };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME"]) delete env[k];
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

async function screenshot(name) {
  const png = await wd("GET", "/screenshot");
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(png, "base64"));
  console.log(`screenshot: ${file}`);
}

const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[title=\"Stop the agent\"]');");
const approvalButtons = () => run("return [...document.querySelectorAll('.codex-approval button')].map((b) => b.textContent);");
const clickApproval = (label) =>
  run("const b = [...document.querySelectorAll('.codex-approval button')].find((b) => b.textContent === arguments[0]); if (!b) return false; b.click(); return true;", label);
/** Opens every collapsed "N tool calls" summary (tool rows fold into it once a turn ends), then reads each row's tool name. */
const toolNames = () =>
  run(`for (const b of document.querySelectorAll('.chat-tool-summary-row[aria-expanded="false"]')) b.click(); return true;`).then(() =>
    run("return [...document.querySelectorAll('.chat-tool-name')].map((n) => n.textContent);"),
  );
const requests = () =>
  readFileSync(join(home, "codex-fake.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

async function send(text) {
  await wd("POST", `/element/${await find(".composer textarea")}/value`, { text });
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
}

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

  // Seed one repo with one workspace through the real backend, as the UI does.
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
  await waitFor("the chat panel", () => chatText().then((t) => t && t.includes("Reason runs this chat")));

  const cliPath = await runAsync("const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('codex_cli_path').then(done, (e) => done('error: ' + e));");
  assert.equal(cliPath, join(bin, "codex"));
  pass(`codex_cli_path finds the CLI in ~/.local/bin: ${cliPath}`);

  // Pick Codex in the composer's agent menu.
  await run(
    `const s = document.querySelector('.agent-select');
     Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'codex');
     s.dispatchEvent(new Event('change', { bubbles: true }));`,
  );
  const placeholder = await waitFor("the Codex chat panel", () => chatText().then((t) => t && t.includes("Codex runs this chat") && t));
  pass(`agent menu switches the chat to Codex: "${placeholder.split("\n").find((l) => l.includes("Codex runs"))}"`);
  const access = await run("const s = document.querySelector('.codex-access'); return s && [s.value, [...s.options].map((o) => o.textContent)];");
  assert.deepEqual(access, ["full", ["Full access", "Ask first", "Read only"]], "Conductor's default: full access");
  // Ask first, so Codex asks before running the command.
  await run(
    `const s = document.querySelector('.codex-access');
     Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'ask');
     s.dispatchEvent(new Event('change', { bubbles: true }));`,
  );
  pass("access menu defaults to Full access (Conductor's default) and is set to Ask first");

  // 1. The recorded turn: approval, Allow, two commands, the reply.
  await send("hello: create hello.txt with 'hello from codex', then cat it");
  const buttons = await waitFor("the approval card", async () => {
    const b = await approvalButtons();
    return b.length ? b : null;
  });
  assert.deepEqual(buttons, ["Allow", "Deny and stop"], "the decisions Codex offered");
  const card = await run("return document.querySelector('.codex-approval').innerText;");
  assert.ok(card.includes("hello.txt"), card);
  await screenshot("codex-1-approval");
  pass(`approval card shows the command and Codex's decisions: ${buttons.join(", ")}`);
  // parity: sidebar.ws-status. An open approval is Conductor's tool approval: Needs permission.
  const rowStatus = () => run(`return [...document.querySelectorAll('[data-testid="workspace-status-icon"]')].map((e) => e.dataset.status);`);
  await waitFor("Needs permission on the sidebar row", async () => (await rowStatus()).includes("needs-user-permission"), 15000).catch(async (e) => {
    throw new Error(`${e.message}; the sidebar row icons are ${JSON.stringify(await rowStatus())}`);
  });
  pass("the sidebar row shows Needs permission while the approval is open");

  assert.ok(await clickApproval("Allow"));
  await waitFor('"hello from codex" reply', () => chatText().then((t) => t.includes("hello from codex") && !t.includes("Codex wants")));
  await turnDone(1);
  const tools = await toolNames();
  assert.deepEqual(tools, ["printf '%s\\n' 'hello from codex' > hello.txt", "cat hello.txt"]);
  assert.equal(readFileSync(join(workspace.path, "hello.txt"), "utf8"), "hello from codex\n");
  // The commentary message folds into the (now opened) tool-call group and renders as Markdown, so its
  // `code` spans lose their backticks; the final reply stays outside it (user bubbles are left out: the prompt quotes the reply).
  const [grouped, outside] = await run(
    `const groups = [...document.querySelectorAll('.chat-scroll .chat-tool-group')];
     const clone = document.querySelector('.chat-scroll').cloneNode(true);
     for (const g of clone.querySelectorAll('.chat-tool-group, .chat-user')) g.remove();
     return [groups.map((g) => g.innerText).join('\\n'), clone.textContent];`,
  );
  assert.match(grouped, /I.ll create `?hello\.txt`? in the workspace, then run `?cat hello\.txt`?\./, "commentary message shown inside the tool-call group");
  assert.ok(outside.includes("hello from codex"), "final message shown outside the tool-call group");
  assert.ok(!/I.ll create/.test(outside), "commentary is not outside the tool-call group");
  await screenshot("codex-2-turn-done");
  pass(`Allow runs the commands (${tools.join(" | ")}), hello.txt is in ${workspace.path}, reply shown`);
  await waitFor("the sidebar row to leave Needs permission", async () => !(await rowStatus()).includes("needs-user-permission"), 15000);
  pass("answering the approval clears Needs permission on the sidebar row");

  const sent = requests();
  const start = sent.find((r) => r.method === "thread/start");
  assert.equal(start.params.cwd, workspace.path);
  assert.equal(start.params.approvalPolicy, "on-request");
  assert.equal(start.params.sandbox, "workspace-write");
  const turn = sent.find((r) => r.method === "turn/start");
  assert.equal(turn.params.effort, "medium", "default Codex thinking level from settings");
  assert.deepEqual(sent.find((r) => r.response)?.response, { id: 0, result: { decision: "accept" } });
  pass("Codex got thread/start in the workspace folder (on-request, workspace-write), effort medium, and the accept answer");

  // 2. Follow-up on the same thread.
  await send("follow-up");
  await waitFor('"turn 2: follow-up"', () => chatText().then((t) => t.includes("turn 2: follow-up")));
  await turnDone(2);
  assert.equal(requests().filter((r) => r.method === "thread/start").length, 1);
  assert.equal(requests().filter((r) => r.method === "initialize").length, 1);
  pass('turn 2 reply is "turn 2: follow-up": one app-server and one thread ran both turns');

  // 3. Deny and stop.
  await send("hello again");
  await waitFor("the second approval card", async () => (await approvalButtons()).length > 0);
  assert.ok(await clickApproval("Deny and stop"));
  await waitFor('"Interrupted by user"', () => chatText().then((t) => (t.match(/Interrupted by user/g) ?? []).length === 1));
  await turnDone(3);
  assert.deepEqual(requests().filter((r) => r.response).at(-1).response, { id: 1, result: { decision: "cancel" } });
  pass('"Deny and stop" answers cancel and the turn ends as "Interrupted by user"');

  // 4. Stop a running turn.
  await send("slow");
  await waitFor("the Stop button", running);
  await wd("POST", `/element/${await find('.composer button[title="Stop the agent"]')}/click`, {});
  await waitFor('a second "Interrupted by user"', () => chatText().then((t) => (t.match(/Interrupted by user/g) ?? []).length === 2), 20000);
  await turnDone(4);
  const interrupt = requests().find((r) => r.method === "turn/interrupt");
  assert.deepEqual(interrupt.params, { threadId: "th-e2e-1", turnId: "turn-4" });
  await screenshot("codex-3-stopped");
  pass('Stop sends turn/interrupt for the running turn and the chat shows "Interrupted by user"');

  // parity: sidebar.ws-status. Conductor holds Codex's MCP elicitations and permission requests for the
  // user and shows the session as needs_user_input ("Needs input") until they are answered.
  const rowIcons = () =>
    run(`return [...document.querySelectorAll('[data-testid="workspace-status-icon"]')].map((e) => ({ status: e.dataset.status, label: e.getAttribute('aria-label') }));`);
  const needsInput = () => rowIcons().then((icons) => icons.some((i) => i.status === "needs-user-input" && i.label === "Needs input"));
  const consentCard = (kind) => run(`const c = document.querySelector('[data-testid="codex-consent"][data-kind="${kind}"]'); return c ? c.innerText : null;`);
  const clickConsent = (label) =>
    run("const b = [...document.querySelectorAll('[data-testid=\"codex-consent\"] button')].find((b) => b.textContent === arguments[0]); if (!b) return false; b.click(); return true;", label);
  const lastResponse = (id) => requests().filter((r) => r.response?.id === id).at(-1)?.response;

  // 5. MCP elicitation (form).
  await send("elicit: file the issue in linear");
  const elicitCard = await waitFor("the elicitation card", () => consentCard("elicitation"));
  assert.ok(elicitCard.includes("linear needs information"), elicitCard);
  assert.ok(elicitCard.includes("Which team should own the issue?"), elicitCard);
  await waitFor("Needs input on the sidebar row", needsInput, 15000).catch(async (e) => {
    throw new Error(`${e.message}; the sidebar row icons are ${JSON.stringify(await rowIcons())}`);
  });
  await screenshot("codex-4-elicitation-needs-input");
  pass('an MCP elicitation shows "linear needs information" and the sidebar row shows Needs input');
  assert.ok(await clickConsent("Continue"));
  await waitFor("the required-field error", () => consentCard("elicitation").then((t) => t && t.includes("Team is required.")));
  assert.equal(lastResponse("elicit-turn-5"), undefined, "nothing is sent while the form is incomplete");
  await run(
    `const i = document.querySelector('[data-testid="codex-consent"] input');
     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'core');
     i.dispatchEvent(new Event('input', { bubbles: true }));`,
  );
  assert.ok(await clickConsent("Continue"));
  await waitFor('"linear got team core"', () => chatText().then((t) => t.includes("linear got team core")));
  await turnDone(5);
  assert.deepEqual(lastResponse("elicit-turn-5"), { id: "elicit-turn-5", result: { action: "accept", content: { team: "core" }, _meta: null } });
  await waitFor("the sidebar row to leave Needs input", async () => !(await needsInput()), 15000);
  pass("Continue sends the form's content to Codex ({team: core}), the turn ends, and Needs input clears");

  // 6. Permission request, denied.
  await send("perm: fetch the tracker");
  const permCard = await waitFor("the permission card", () => consentCard("permissions"));
  assert.ok(permCard.includes("codex requests permission"), permCard);
  assert.ok(permCard.includes("Network access"), permCard);
  assert.ok(permCard.includes("Fetch the issue tracker"), permCard);
  await waitFor("Needs input on the sidebar row", needsInput, 15000);
  await screenshot("codex-5-permission-needs-input");
  assert.ok(await clickConsent("Deny"));
  await waitFor('"permissions: none granted"', () => chatText().then((t) => t.includes("permissions: none granted")));
  await turnDone(6);
  assert.deepEqual(lastResponse("perm-turn-6"), { id: "perm-turn-6", result: { permissions: {}, scope: "turn" } });
  await waitFor("the sidebar row to leave Needs input", async () => !(await needsInput()), 15000);
  pass('a permission request shows "codex requests permission" with Network access and Needs input; Deny grants nothing');

  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("codex-failure").catch(() => {});
    await chatText().then((t) => console.error(`chat text:\n${t}`)).catch(() => {});
  }
  try {
    console.error(`fake codex requests:\n${readFileSync(join(home, "codex-fake.jsonl"), "utf8")}`);
  } catch {}
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
