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
//   7. "unauth"          the turn fails with a 401: "Authentication required"
//                        under it, and "Open Codex settings" opens Settings ›
//                        Agents on the Codex tab
//   8. auth modes        on that tab: ChatGPT (in-app sign-in), CLI, then API
//                        key (typed and saved), each stored as codexModes.ts
//                        says; a new chat per mode sends a turn, and that
//                        chat's app-server launch has the key only under API
//                        key (the shell's leaked key is cleared otherwise),
//                        the signed-in account, the custom executable and
//                        personality, and the reply renders
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/codex-chat.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

// Settings › Agents › Codex: "Codex executable path" points at a second
// wrapper (it tags the fake's launch line "custom"), personality "friendly".
const custom = join(home, "custom-codex", "codex");
mkdirSync(dirname(custom), { recursive: true });
writeFileSync(custom, `#!/bin/sh\nOC_FAKE_CODEX=custom exec python3 "${fake}" "$@"\n`);
chmodSync(custom, 0o755);
mkdirSync(join(home, ".openconductor"), { recursive: true });
writeFileSync(
  join(home, ".openconductor", "settings.toml"),
  `codex_executable_path = ${JSON.stringify(custom)}\n\n[models.codex]\npersonality = "friendly"\n`,
);

const env = { ...process.env, HOME: home, SHELL: "/bin/bash" };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME"]) delete env[k];
// A key left in the user's shell: only the API key mode may hand Codex a key, and it must be the stored one.
const SHELL_KEY = "sk-e2e-left-in-the-shell";
env.OPENAI_API_KEY = env.CODEX_API_KEY = SHELL_KEY;
// "Sign in with ChatGPT" opens the auth URL: xdg-open runs $BROWSER, so no real browser starts.
env.BROWSER = "true";
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
let sessionUrl = null;

async function wd(method, path, body, timeoutMs = 45000) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    // A hung WebDriver call fails here, naming the call, instead of at the job's step timeout.
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

const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[aria-label^=\"Stop the agent\"]');");
const approvalButtons = () => run("return [...document.querySelectorAll('.codex-approval button')].map((b) => b.textContent);");
const clickApproval = (label) =>
  run("const b = [...document.querySelectorAll('.codex-approval button')].find((b) => b.textContent === arguments[0]); if (!b) return false; b.click(); return true;", label);
/**
 * Opens every collapsed "N tool calls" summary (tool rows fold into it once a turn ends), then reads each
 * row's command: Conductor draws a Codex command as a Bash row with the command in its right-hand chip.
 */
const toolNames = () =>
  run(`for (const b of document.querySelectorAll('.chat-tool-summary-row[aria-expanded="false"]')) b.click(); return true;`).then(() =>
    run("return [...document.querySelectorAll('.chat-tool')].map((t) => t.querySelector('.oc-code-chip')?.textContent ?? t.innerText);"),
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

/** Picks Codex in the composer's model picker (Conductor's picker picks the agent too). */
async function pickCodex(shot) {
  await run("document.querySelector(\"[data-testid='composer-model-button']\").click();");
  await waitFor("Codex in the model picker", () =>
    run("return [...document.querySelectorAll('.oc-model-menu .oc-model-item')].some((b) => b.textContent.trim() === 'Codex') || null;"),
  );
  if (shot) await screenshot(shot);
  await run("[...document.querySelectorAll('.oc-model-menu .oc-model-item')].find((b) => b.textContent.trim() === 'Codex').click();");
  await waitFor("Codex on the picker chip", () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.title === 'Codex' || null;"));
  await waitFor("the Codex access menu", () => run("return !!document.querySelector('.codex-access') || null;"));
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
  await waitFor("the chat panel", () => chatText().then((t) => t && t.includes("You’re in a new copy of")));

  const cliPath = await runAsync("const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('codex_cli_path').then(done, (e) => done('error: ' + e));");
  // Settings' "Codex executable path" overrides the CLI found on PATH (~/.local/bin).
  assert.equal(cliPath, custom);
  pass(`codex_cli_path honours the Codex executable path override: ${cliPath}`);

  await pickCodex("codex-0-model-picker");
  pass("the model picker switches the chat to Codex: the chip reads Codex and the access menu shows");
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
    `const groups = [...document.querySelectorAll('.chat-scroll [data-tool-group]')];
     const clone = document.querySelector('.chat-scroll').cloneNode(true);
     for (const g of clone.querySelectorAll('[data-tool-group], .chat-user')) g.remove();
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
  const launches = sent.filter((r) => r.launch).map((r) => r.launch);
  assert.ok(launches.length > 0, "the fake logged its launch");
  assert.deepEqual([...new Set(launches.map((l) => l.launcher))], ["custom"], "every app-server ran the Codex executable path from settings");
  const chatLaunch = launches.find((l) => l.args.includes("stdio://"));
  assert.ok(chatLaunch?.args.includes('personality="friendly"'), `chat launch args ${JSON.stringify(chatLaunch?.args)}`);
  pass('the chat\'s app-server is the custom "Codex executable path" and got -c personality="friendly"');

  // 2. Follow-up on the same thread.
  await send("follow-up");
  await waitFor('"turn 2: follow-up"', () => chatText().then((t) => t.includes("turn 2: follow-up")));
  await turnDone(2);
  assert.equal(requests().filter((r) => r.method === "thread/start").length, 1);
  // The "/" menu lists skills from its own short-lived app-server (clientInfo openconductor-commands).
  assert.equal(requests().filter((r) => r.method === "initialize" && r.params?.clientInfo?.name === "openconductor").length, 1);
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
  await wd("POST", `/element/${await find('.composer button[aria-label^="Stop the agent"]')}/click`, {});
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

  // 7. Signed out: the failed turn links to the Codex tab of Settings › Agents.
  await send("unauth: anything");
  const signIn = await waitFor("the sign-in notice", () => run("const n = document.querySelector('[data-testid=\"chat-sign-in\"]'); return n ? n.textContent : null;"));
  assert.ok(signIn.includes("Authentication required") && signIn.includes("Codex is not signed in"), signIn);
  await screenshot("codex-6-sign-in-required");
  await run("Array.from(document.querySelectorAll('[data-testid=\"chat-sign-in\"] button')).find((b) => b.textContent.trim() === 'Open Codex settings').click();");
  const tab = await waitFor("Settings › Agents on the Codex tab", () =>
    run("const t = document.querySelector('[role=\"tab\"][aria-selected=\"true\"]'); return t && location.pathname === '/settings/user/providers' ? t.textContent.trim() : null;"),
  );
  assert.equal(tab, "Codex");
  await screenshot("codex-7-agents-codex-tab");
  pass('a 401 turn shows "Authentication required" and "Open Codex settings" opens Settings › Agents on the Codex tab');

  // 8. Each Codex auth mode, set on the Codex tab as a user does, then a turn in a new chat (its own app-server).
  const codexTab = 'section[aria-label="Codex"]';
  const fingerprint = (v) => createHash("sha256").update(v).digest("hex").slice(0, 16);
  const API_KEY = "sk-e2e-0123456789-mode";
  const codexSettings = () =>
    runAsync("const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke('get_settings').then((s) => done({ top: s.codex_provider ?? null, stored: s.providers?.codex ?? null }), (e) => done({ error: String(e) }));");
  const pressedCard = () => run(`return [...document.querySelectorAll('${codexTab} button[aria-pressed="true"]')].map((b) => b.textContent);`);
  const clickIn = (css, text) =>
    run("const b = [...document.querySelectorAll(arguments[0])].find((b) => b.textContent === arguments[1]); if (!b) return false; b.click(); return true;", css, text);
  const authStatus = () => run(`const s = document.querySelector('${codexTab} [data-testid="agent-auth-status"]'); return s ? s.innerText : '';`);
  // The status line has answered (Refresh enabled again) and says `text`. A key saved while the card's refresh is
  // still out is overwritten by that refresh's stale answer, so the key waits for this.
  const settled = (text) =>
    waitFor(`the status line to settle on "${text}"`, () =>
      run(`const s = document.querySelector('${codexTab} [data-testid="agent-auth-status"]'); return !!s && s.innerText.includes(arguments[0]) && !s.querySelector('button:disabled');`, text),
      20000,
    ).catch(async (e) => {
      throw new Error(`${e.message}; status: ${JSON.stringify(await authStatus())}`);
    });
  const settingsFile = () => readFileSync(join(home, ".openconductor", "settings.toml"), "utf8");
  const modes = [
    {
      id: "chatgpt",
      card: "ChatGPTRecommended",
      stored: (s) => s.top === "chatgpt_sign_in" && s.stored === null,
      async connect() {
        await waitFor("Not signed in with ChatGPT", async () => (await authStatus()).includes("Not signed in with ChatGPT"), 20000);
        assert.ok(await clickIn(`${codexTab} button`, "Sign in with ChatGPT"));
        const line = await waitFor("Connected with ChatGPT", () => run("const c = document.querySelector('[data-testid=\"codex-chatgpt-connected\"] .agc-ok'); return c ? c.textContent : null;"), 20000);
        assert.equal(line, "Connected with ChatGPT as e2e@example.com");
        assert.ok(requests().some((r) => r.method === "account/login/start"), "the sign-in reached Codex");
      },
      keys: { CODEX_API_KEY: null, OPENAI_API_KEY: null },
    },
    {
      // `codex login` and the in-app ChatGPT sign-in share Codex's own login, so the account carries over.
      id: "cli",
      card: "CLI",
      stored: (s) => (s.top === null || s.top === "default") && s.stored?.kind === "codex_login",
      async connect() {
        await waitFor("the CLI status", async () => /Connected|not authenticated/i.test(await authStatus()), 20000);
      },
      keys: { CODEX_API_KEY: null, OPENAI_API_KEY: null },
    },
    {
      id: "apikey",
      card: "API key",
      stored: (s) => s.top === null && s.stored?.kind === "openai_api",
      async connect() {
        await settled("No OpenAI API key configured");
        await wd("POST", `/element/${await find(`${codexTab} input[aria-label="OpenAI API key"]`)}/value`, { text: API_KEY });
        assert.ok(await clickIn(`${codexTab} button`, "Save"));
        await waitFor("the masked key", () => run(`return document.querySelector('${codexTab} [data-testid="secret-value"]')?.textContent.endsWith('mode') || null;`));
        await settled("Connected");
        assert.ok(!settingsFile().includes(API_KEY), "the key stays out of settings.toml");
      },
      keys: { CODEX_API_KEY: fingerprint(API_KEY), OPENAI_API_KEY: fingerprint(API_KEY) },
    },
  ];
  assert.deepEqual(await waitFor("the Codex cards", () => pressedCard().then((c) => (c.length ? c : null))), ["CLI"], "no codex_provider and no [providers.codex] reads as CLI");
  for (const mode of modes) {
    if (mode.id !== "chatgpt") {
      await run("window.dispatchEvent(new CustomEvent('openconductor:open-settings', { detail: { page: 'providers', providerTab: 'codex' } }));");
      await waitFor("the Codex tab", () => run(`return !!document.querySelector('${codexTab} button[aria-pressed]') || null;`));
    }
    assert.ok(await clickIn(`${codexTab} button[aria-pressed]`, mode.card), `the ${mode.card} card`);
    await waitFor(`the ${mode.card} card selected`, async () => (await pressedCard())[0] === mode.card);
    const stored = await waitFor(`${mode.id} stored in settings.toml`, () => codexSettings().then((s) => (mode.stored(s) ? s : null)), 15000).catch(async (e) => {
      throw new Error(`${e.message}; settings: ${JSON.stringify(await codexSettings())}`);
    });
    await mode.connect();
    await screenshot(`codex-8-${mode.id}-settings`);
    pass(`the ${mode.card} card stores ${JSON.stringify(stored)}`);

    // Back to the workspace, a new chat on Codex, one turn.
    console.log(`# ${mode.id}: back to the workspace`);
    await run("document.querySelector('.settings-back').click();");
    await waitFor("the workspace", () => run("return !!document.querySelector('.main-tab-new-button') || null;"));
    console.log(`# ${mode.id}: new chat`);
    await run("document.querySelector('.main-tab-new-button').click();");
    await waitFor("the new, empty chat", () => chatText().then((t) => t !== null && !/unauth|turn \d+:/.test(t)));
    console.log(`# ${mode.id}: pick Codex`);
    await pickCodex();
    console.log(`# ${mode.id}: send the turn`);
    const prompt = `mode ${mode.id}`;
    await send(prompt);
    await waitFor(`"turn 1: ${prompt}"`, () => chatText().then((t) => t.includes(`turn 1: ${prompt}`)));
    await waitFor("the turn to finish", async () => !(await running()));
    const all = requests();
    const turnStart = all.find((r) => r.method === "turn/start" && r.params.input.some((i) => i.text === prompt));
    assert.ok(turnStart, `${mode.id}: Codex got turn/start for "${prompt}"`);
    const launch = all.find((r) => r.launch && r.pid === turnStart.pid)?.launch;
    assert.ok(launch, `a launch line for pid ${turnStart.pid}`);
    assert.equal(launch.launcher, "custom", `${mode.id}: the Codex executable path`);
    assert.ok(launch.args.includes('personality="friendly"'), `${mode.id}: launch args ${JSON.stringify(launch.args)}`);
    assert.deepEqual(launch.keys, mode.keys, `${mode.id}: the API key variables Codex got`);
    assert.equal(launch.account, "chatgpt", `${mode.id}: Codex's own login`);
    // WebKitWebDriver's snapshot of a new chat right after its turn can stall (seen on CI); the picture is evidence, not a check.
    await screenshot(`codex-9-${mode.id}-turn`, 10000).catch((e) => console.log(`# no screenshot: ${e.message}`));
    pass(`${mode.card}: a new chat's turn renders "turn 1: ${prompt}"; its app-server got ${mode.keys.CODEX_API_KEY ? "the stored key" : "no key"}, the ChatGPT account, the custom path and personality`);
  }

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
