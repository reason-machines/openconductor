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
//   4. "slow", then Stop the turn ends as "Interrupted by user"
//   5-6. two turns that write files; each saved start/end checkpoints
//   7. "Reset chat" on turn 5   "Reset chat?" says 2 changed; Reset deletes
//                        turn 6 and restores turn 5's files
//   8. "permission"      Reason asks session/request_permission: the chat shows
//                        "Do you want to run this command?", the session is needs_user_permission
//                        in conductor.db, the sidebar row and the Home list show
//                        "Needs permission"; Allow resumes the turn and the
//                        status goes back to idle
//   9. Fork to new workspace on turn 5
//   10. Relaunch: quit the app, select another Reason workspace (the fake's
//                        `fake-reason-selected`, as switching workspace in the
//                        Reason desktop app does), start the app again and send
//                        a follow-up in the first chat. It must resume the
//                        chat's own Session in its workspace: no 409
//                        client_session_id_conflict, no new Session.
//   The Session runs Settings' default model (set before the chat opens).
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/reason-chat.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
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

// Explicit chat override: the universal installer still ensures the official CLI.
const bin = join(home, "bin");
mkdirSync(bin);
const fake = join(repoRoot, "tools/reason-acp/fake_reason_acp.py");
writeFileSync(join(bin, "reason"), `#!/bin/sh\nexec python3 "${fake}" "$@"\n`);
chmodSync(join(bin, "reason"), 0o755);

const env = { ...process.env, HOME: home, OPENCONDUCTOR_HOME: join(home, ".openconductor"), PATH: `${bin}:${process.env.PATH}` };
mkdirSync(env.OPENCONDUCTOR_HOME, { recursive: true });
writeFileSync(join(env.OPENCONDUCTOR_HOME, "settings.toml"), `reason_executable_path = ${JSON.stringify(join(bin, "reason"))}\n`);
delete env.REASON_CLI;
// The app data folder (conductor.db, worktrees) must be under the fresh HOME too.
delete env.XDG_DATA_HOME;
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
const capture = new WebDriver(base);
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
/** Runs `script` in the page; it returns one element (or null), whose WebDriver id this returns. */
const elementBy = (script, ...args) => run(script, ...args).then((el) => (el ? el[W3C_ELEMENT] ?? el.ELEMENT ?? null : null));
/** A real WebDriver click: scrolled into view, refused while another element covers it. */
const click = (id) => wd("POST", `/element/${id}/click`, {});
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
  const png = await capture.screenshot();
  const file = join(out, `${name}.png`);
  writeFileSync(file, png);
  console.log(`screenshot: ${file}`);
}

const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const running = () => run("return !!document.querySelector('.composer button[aria-label^=\"Stop the agent\"]');");

/** What has the keyboard, for failure messages: the composer, a terminal, or another element. */
const focusedElement = () =>
  run(`const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (a.closest(".composer")) return "composer " + a.tagName.toLowerCase();
    if (a.closest(".terminal-panel")) return "terminal " + a.className;
    return a.tagName.toLowerCase() + (a.className ? "." + a.className : "");`);
const composerValue = () => run("const t = document.querySelector('.composer [contenteditable=true]'); return t ? t.textContent : null;");

async function send(text) {
  await wd("POST", `/element/${await find(".composer [contenteditable=true]")}/value`, { text });
  // Send is disabled while the box is empty: a click then does nothing and the
  // turn never shows, so say where the typed text went instead of timing out later.
  const typed = await composerValue();
  assert.equal(typed, text, `the composer holds what was typed; focus is on ${await focusedElement()}`);
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
}

/** Opens every collapsed "N tool calls" summary, then returns each tool row's input as the agent reported it. */
const toolInputs = () =>
  run(`for (const b of document.querySelectorAll('.chat-tool-summary-row[aria-expanded="false"]')) b.click(); return true;`).then(() =>
  run(`return [...document.querySelectorAll('.chat-tool[data-tool-input]')].map((e) => e.dataset.toolInput);`)).then((texts) => texts.map((t) => JSON.parse(t)));

/** A finished turn has no Stop button. */
const turnDone = (n) => waitFor(`turn ${n} to finish`, async () => !(await running()));

// Navigate through the sidebar instead of racing React's saved preferences with a reload.
async function openWorkspace(repoName, branch) {
  await finishStartup(capture);
  const row = `button[data-testid="left-sidebar-workspace-item"][title*=" · ${branch} · "]`;
  const rowId = await waitFor(`the ${branch} row in the sidebar`, async () => {
    const id = await elementBy("return document.querySelector(arguments[0]);", row);
    if (id) return id;
    const header = await elementBy(
      `return [...document.querySelectorAll('.sb-repo-header[role="button"][aria-expanded="false"]')].find((h) => h.querySelector(".sb-repo-name")?.textContent === arguments[0]) || null;`,
      repoName,
    );
    if (header) await click(header);
    return null;
  });
  await click(rowId);
  await waitFor(`${branch} to be the open workspace`, () => run("return document.querySelector(arguments[0])?.getAttribute('aria-current') === 'page';", row));
}

const steps = [];
const pass = (s) => {
  steps.push(s);
  console.log(`ok - ${s}`);
};

/** Starts the app in a new WebDriver session. */
async function launch() {
  const session = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } },
  });
  sessionUrl = `${base}/session/${session.sessionId}`;
  capture.sessionId = session.sessionId;
  await finishStartup(capture);
}

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  await launch();

  // Seed one repo with one workspace through the real backend: the sidebar lists
  // what conductor.db holds, so the repo is added and a worktree created like the UI does.
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const seeded = await runAsync(
    `const done = arguments[arguments.length - 1];
     const invoke = window.__TAURI_INTERNALS__.invoke;
     // The workspace chat's model comes from Settings' default model (#271).
     invoke("get_settings")
       .then((s) => invoke("update_settings", { settings: { ...s, reason: { ...s.reason, workspace: "ws-a" }, models: { ...s.models, default: "opus-5-5-1m" } } }))
       .then(() => invoke("add_repository", { path: arguments[0] }))
       .then((repo) => invoke("create_workspace", { repositoryId: repo.id, branchName: "e2e", directoryName: "e2e", baseBranch: null, existingBranch: false, prNumber: null }))
       .then((created) => done({ workspace: created.workspace }), (err) => done({ error: String(err) }));`,
    project,
  );
  assert.ok(seeded?.workspace, `seeding failed: ${JSON.stringify(seeded)}`);
  const workspace = seeded.workspace;
  assert.equal(workspace.branchName, "e2e", "the seeded workspace has the requested branch");
  // The page loads conductor.db's rows at startup, so reload to list the seeded repo, then open its workspace.
  await run("location.reload(); return true;");
  await openWorkspace("proj", workspace.branchName);
  // Conductor's empty first chat (x9s) and a model, not Codex, on the picker chip.
  const intro = await waitFor("the empty chat's intro", () => chatText().then((t) => t && t.includes("You’re in a new copy of") && t));
  assert.ok(intro.includes("called e2e"), intro);
  // The picker renders once the default model has loaded from Settings, a moment after the intro.
  const modelChip = await waitFor("the model on the picker chip", () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.title || null;"));
  assert.ok(modelChip !== "Codex", `the chat runs a model on Reason: ${modelChip}`);
  await screenshot("reason-0-empty-chat");
  pass(`the desktop chat opens on Conductor's empty state ("${intro.split("\n")[0]}") with ${modelChip} on the picker`);

  // Conductor's default workspace layout shows no terminal, so none opens with
  // the workspace to take the keyboard from the chat box.
  await run(`document.querySelector('.composer [contenteditable=true]').focus(); return true;`);
  await sleep(500);
  assert.equal(await run("return document.querySelectorAll('.terminal-panel').length;"), 0, "the workspace opened a terminal panel by default");
  const focus = await focusedElement();
  assert.equal(focus, "composer div", `something took focus from the chat box (${focus})`);
  pass("no terminal opens with the workspace (Conductor's default layout) and the chat box keeps focus");

  // 1. A local path: in the workspace folder under HOME.
  await send("local");
  const local = await waitFor("the local tool row", async () => {
    const rows = await toolInputs();
    return rows.length >= 1 && rows[0].paths?.length ? rows[0].paths[0] : null;
  });
  assert.equal(local.place, "local", JSON.stringify(local));
  assert.equal(local.relative, "a.txt");
  assert.equal(local.raw, join(workspace.path, "a.txt"));
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
  // Stop once the agent runs the turn (its tool row shows), so the fake CLI
  // counts it; a Stop before the prompt reaches Reason never sends it.
  // Conductor's row: the tool name ("Bash") with the command in a chip ("sleep").
  await waitFor('the Bash "sleep" tool row', () =>
    run(`return [...document.querySelectorAll(".chat-tool")].some((r) => /\\bBash\\b/.test(r.innerText) && r.innerText.includes("sleep"));`),
  );
  await wd("POST", `/element/${await find('.composer button[aria-label^="Stop the agent"]')}/click`, {});
  await waitFor('"Interrupted by user"', () => chatText().then((t) => t.includes("Interrupted by user")), 15000);
  await turnDone(4);
  pass('Stop ends the running turn: "Interrupted by user"');
  await screenshot("reason-chat-stopped");

  // 5-6. Checkpoints: two turns that edit files, then "Reset chat" back to turn 5.
  const wsFile = (name) => join(workspace.path, name);
  const readWs = (name) => (existsSync(wsFile(name)) ? readFileSync(wsFile(name), "utf8") : null);
  // Turn ids are random (`<chat>:<uuid>`), so each turn's id is read from its
  // end row, and its checkpoints are named by that id (turnCheckpointRef).
  const chat = workspace.id.replace(/[^A-Za-z0-9._-]/g, "-");
  const turnKey = (id) => id.slice(id.indexOf(":") + 1).replace(/[^A-Za-z0-9._-]/g, "-");
  const checkpointRefs = () =>
    execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/conductor-checkpoints/"], { cwd: workspace.path, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  const turnIds = () => run(`return [...document.querySelectorAll('.chat-turn-end')].map((e) => e.dataset.turnId);`);
  // Waits for turn n's end row and end checkpoint: the checkpoint is saved after
  // the turn is shown as ended, so the next turn starts once it is in place.
  const settled = async (n) => {
    await turnDone(n);
    const ids = await turnIds();
    const id = ids[ids.length - 1];
    await waitFor(`turn ${n}'s end checkpoint`, () => checkpointRefs().includes(`refs/conductor-checkpoints/session-${chat}-turn-${turnKey(id)}-end`));
    return id;
  };

  await send("write: notes.txt=one");
  await waitFor('"turn 5 wrote notes.txt"', () => chatText().then((t) => t.includes("turn 5 wrote notes.txt")));
  const id5 = await settled(5);
  await send("write: notes.txt=two;extra.txt=x");
  await waitFor('"turn 6 wrote"', () => chatText().then((t) => t.includes("turn 6 wrote notes.txt extra.txt")));
  const id6 = await settled(6);
  assert.equal(readWs("notes.txt"), "two\n");
  assert.equal(readWs("extra.txt"), "x\n");
  const refs = checkpointRefs();
  for (const id of [id5, id6]) {
    for (const point of ["start", "end"]) {
      const ref = `refs/conductor-checkpoints/session-${chat}-turn-${turnKey(id)}-${point}`;
      assert.ok(refs.includes(ref), `${ref} in ${refs.join(" ")}`);
    }
  }
  pass(`turns 5 and 6 each saved start/end checkpoints (${refs.length} refs in the workspace)`);

  // Every finished turn has a "Show message actions" menu ("Fork to new tab", "Fork to new
  // workspace"); only turns before the last also have "Reset chat". Opens the turn's menu with
  // real clicks, reads its items, and leaves it open. The menu is portalled to <body> under its
  // button (.cm-turn-menu, one open at a time) behind a backdrop, so Escape closes it.
  const openMenu = async (turn) => {
    await click(await find(`${turn} button[aria-label="Show message actions"]`));
    return waitFor(`${turn}'s menu`, () =>
      run(`const m = document.querySelector('.cm-turn-menu'); return m ? [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.innerText.trim()) : null;`),
    );
  };
  const closeMenu = async (turn) => {
    await run(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true;`);
    await waitFor(`${turn}'s menu to close`, () => run(`return !document.querySelector('.cm-turn-menu');`));
  };
  const menuItem = (name) =>
    waitFor(`the "${name}" menu item`, () =>
      elementBy(`return [...document.querySelectorAll('.cm-turn-menu [role="menuitem"]')].find((b) => b.innerText.trim() === arguments[0]) || null;`, name),
    );
  // "Reset chat?" by role and accessible title, not by class.
  const resetDialog = `[...document.querySelectorAll('[role="alertdialog"]')].find((d) => document.getElementById(d.getAttribute("aria-labelledby"))?.textContent.trim() === "Reset chat?") || null`;
  const turn5 = `.chat-turn-end[data-turn-id="${id5}"]`;
  const turn6 = `.chat-turn-end[data-turn-id="${id6}"]`;
  const lastItems = await openMenu(turn6);
  assert.deepEqual(lastItems, ["Fork to new tab", "Fork to new workspace"], "the last turn has no Reset chat");
  await closeMenu(turn6);
  const turn5Items = await openMenu(turn5);
  assert.deepEqual(turn5Items, ["Fork to new tab", "Fork to new workspace", "Reset chat"], "turn 5 has both forks and Reset chat");
  pass('the last turn\'s menu has "Fork to new tab" and "Fork to new workspace"; turn 5\'s also has "Reset chat"');
  await click(await menuItem("Reset chat"));
  await waitFor('the "Reset chat?" dialog', () => run(`return !!(${resetDialog});`));
  // The count arrives after the dialog opens. Wait for its value, then assert it.
  const dialog = await waitFor('"Reset chat?" to finish counting changed files', () =>
    run(`const d = ${resetDialog}; return d && /\\b\\d+ changed\\b/.test(d.innerText) ? d.innerText : null;`),
  );
  assert.match(dialog, /Later messages will be deleted\./);
  assert.match(dialog, /Also reset files/);
  assert.match(dialog, /\b2 changed\b/, `the count of files changed since turn 5:\n${dialog}`);
  assert.equal(await run(`return (${resetDialog}).querySelector('input[type="checkbox"][aria-label="Also reset files"]').checked;`), true);
  await screenshot("reason-chat-reset-dialog");
  pass('Reset chat on turn 5 opens "Reset chat?": "Later messages will be deleted.", Also reset files on, 2 changed');

  await click(await elementBy(`return [...(${resetDialog}).querySelectorAll("button")].find((b) => b.innerText.trim().startsWith("Reset")) || null;`));
  await waitFor("the dialog to close", () => run(`return !(${resetDialog});`), 15000);
  const after = await chatText();
  assert.ok(after.includes("turn 5 wrote notes.txt"), after);
  assert.ok(!after.includes("turn 6 wrote"), after);
  assert.ok(after.includes("turn 3: follow-up"), "earlier turns stay");
  assert.equal(readWs("notes.txt"), "one\n");
  assert.equal(readWs("extra.txt"), null);
  assert.deepEqual(await openMenu(turn5), ["Fork to new tab", "Fork to new workspace"], "turn 5 is now the last turn: no Reset chat");
  await closeMenu(turn5);
  await screenshot("reason-chat-after-reset");
  pass("Reset deleted turn 6 and restored the files: notes.txt is back to one, extra.txt is gone");

  const stored = JSON.parse(readFileSync(join(home, "state.json"), "utf8")).sessions;
  const sessions = Object.keys(stored);
  assert.deepEqual(sessions, ["sess-1"], "one Reason Session for the workspace");
  pass(`the fake CLI saw one Session: ${sessions.join(", ")}`);
  assert.equal(stored["sess-1"].config?.model, "byok:anthropic:claude-opus-5-5", JSON.stringify(stored["sess-1"]));
  pass("the Session runs Settings' default model: session/set_config_option model=byok:anthropic:claude-opus-5-5");

  // 7. A permission request (parity: sidebar.ws-status, home.status-overview).
  const statusesOf = (css) => run(`return [...document.querySelectorAll(arguments[0])].map((e) => ({ status: e.dataset.status, label: e.getAttribute("aria-label") }));`, css);
  const sidebarStatus = () => statusesOf('[data-testid="workspace-status-icon"]');
  const homeStatus = () => statusesOf('[data-testid="home-workspace-status"]');
  const storedStatuses = () =>
    runAsync(`const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke("session_statuses").then(done, (e) => done({ error: String(e) }));`);
  const needsPermission = (list) => list.some((i) => i.status === "needs-user-permission" && i.label === "Needs permission");
  await send("permission");
  // The fake runs its "bash: rm -rf build" tool call first, then asks. Conductor's
  // row shows it as the tool name ("Bash") with the command in a chip, like step 4;
  // the permission card below keeps the ACP title.
  await waitFor('the Bash "rm -rf build" tool row', () =>
    run(`return [...document.querySelectorAll(".chat-tool")].some((r) => /\\bBash\\b/.test(r.innerText) && r.innerText.includes("rm -rf build"));`),
  );
  await waitFor("Needs permission on the sidebar row", async () => needsPermission(await sidebarStatus()), 15000).catch(async (e) => {
    throw new Error(`${e.message}; the sidebar row icons are ${JSON.stringify(await sidebarStatus())}`);
  });
  const card = await waitFor("the permission card", () => run(`const c = document.querySelector('[data-testid="chat-permission-request"]'); return c ? c.innerText : null;`));
  // Conductor's tool approval (`Jpo`), in the composer box in place of its editor: the
  // question for an `execute` tool, the call as the transcript's Bash row (command in a
  // chip), and Yes / No whatever the options are named.
  assert.match(card, /Do you want to run this command\?/);
  assert.match(card, /Bash/);
  assert.match(card, /rm -rf build/);
  assert.match(card, /Yes/);
  assert.match(card, /No/);
  assert.equal(await run(`return !!document.querySelector('.composer.oc-composer.is-approval [data-testid="chat-permission-request"]');`), true);
  const storedRows = await waitFor("needs_user_permission in conductor.db", async () => {
    const rows = await storedStatuses();
    return Array.isArray(rows) && rows.some((r) => r.chatId === workspace.id && r.status === "needs_user_permission") && rows;
  });
  await screenshot("status-needs-permission-chat");
  pass(`Reason's permission request shows "Do you want to run this command?", the sidebar row says Needs permission, conductor.db holds ${JSON.stringify(storedRows)}`);

  // Sidebar Home opens the wordmark screen (#483); the list is the /all-workspaces route.
  await run(`history.pushState(null, "", "/all-workspaces"); dispatchEvent(new PopStateEvent("popstate")); return true;`);
  await waitFor("Needs permission on the Home row", async () => needsPermission(await homeStatus()));
  await screenshot("status-needs-permission-home");
  pass("the Home list shows the workspace's Needs permission status in place of its time");

  // With no workspace open its sidebar group is folded (Conductor's `Dra`), so open it from
  // the Home list: the option whose status reads "Needs permission".
  await click(
    await waitFor("the Home row that needs permission", () =>
      elementBy(
        `return [...document.querySelectorAll('[role="listbox"][aria-label="Workspaces"] [role="option"]')].find((o) => o.querySelector('[role="img"][aria-label="Needs permission"]')) || null;`,
      ),
    ),
  );
  await click(await waitFor("the Allow button", () => find('[data-testid="chat-permission-request"] button[data-kind="allow_once"]')));
  await waitFor('"permission: allow"', () => chatText().then((t) => t.includes("permission: allow")));
  await turnDone(8);
  await waitFor("the sidebar row to leave Needs permission", async () => !needsPermission(await sidebarStatus()));
  await waitFor("conductor.db to drop the status", async () => {
    const rows = await storedStatuses();
    return Array.isArray(rows) && !rows.some((r) => r.chatId === workspace.id);
  });
  assert.equal(await run(`return document.querySelectorAll('[data-testid="chat-permission-request"]').length;`), 0);
  pass('Allow answers the request: the turn replies "permission: allow" and the status is idle again');

  // 8. Fork to new workspace on turn 5 (Conductor's forkChat): a branch off
  // "e2e" named "e2e-v1", a workspace on it restored to turn 5's end
  // checkpoint, and its chat's composer holding the transcript, not sent.
  const forkItems = await openMenu(turn5);
  assert.ok(forkItems.includes("Fork to new workspace"), JSON.stringify(forkItems));
  await click(await menuItem("Fork to new workspace"));
  const worktrees = () =>
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: workspace.path, encoding: "utf8" })
      .split("\n\n")
      .map((block) => ({ path: block.match(/^worktree (.+)$/m)?.[1], branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] }));
  const forked = await waitFor('a worktree on branch "e2e-v1"', () => worktrees().find((w) => w.branch === "e2e-v1"), 30000);
  assert.notEqual(forked.path, workspace.path);
  const chip = await waitFor("the forked chat's transcript attachment", () =>
    run(`const c = document.querySelector('.composer-attachments'); return c && c.innerText.includes("Transcript of") ? c.innerText : null;`),
  );
  assert.match(chip, /Transcript of e2e\.md/, chip);
  assert.equal(await composerValue(), "", "nothing typed and nothing sent");
  assert.equal(readFileSync(join(forked.path, "notes.txt"), "utf8"), "one\n", "the fork has turn 5's files");
  assert.equal(existsSync(join(forked.path, "extra.txt")), false);
  const forkedChat = await chatText();
  assert.ok(!forkedChat.includes("turn 5 wrote notes.txt"), "the fork opens a new chat, not the source's transcript");
  await screenshot("reason-chat-forked-workspace");
  pass(`Fork to new workspace made ${forked.path} on e2e-v1 with turn 5's notes.txt and "Transcript of e2e.md" in its composer`);

  // 10. Relaunch with another Reason workspace selected, then a follow-up
  // in the first chat (Sven's 409 client_session_id_conflict).
  const sessionKey = `openconductor.reason.session.${workspace.id}`;
  const before = await run("return localStorage.getItem(arguments[0]);", sessionKey);
  assert.ok(before, `the first chat stored its Reason Session under ${sessionKey}`);
  const fakeState = () => JSON.parse(readFileSync(join(home, "state.json"), "utf8")).sessions;
  const sessionsBefore = Object.keys(fakeState());
  assert.equal(fakeState()[before].workspace, "ws-a", "the Session was created in the selected workspace, ws-a");
  await wd("DELETE", "");
  sessionUrl = null;
  writeFileSync(join(home, "fake-reason-selected"), "ws-b");
  await launch();
  await waitFor("the app to load again", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  // The app reopens the workspace that was open when it quit (the fork), so go back to the first chat from its sidebar row.
  await openWorkspace("proj", workspace.branchName);
  await waitFor("the first chat's transcript after the relaunch", () => chatText().then((t) => t && t.includes("turn 5 wrote notes.txt")));
  assert.equal(await run("return localStorage.getItem(arguments[0]);", sessionKey), before, "the chat kept its Session id");
  await send("echo: after relaunch");
  const relaunched = await waitFor('the follow-up\'s reply (or an error)', () =>
    chatText().then((t) => (/turn \d+: after relaunch|409|client_session_id_conflict|was not sent/.test(t) ? t : null)),
  );
  assert.ok(!/409|client_session_id_conflict/.test(relaunched), `no 409 after the relaunch:\n${relaunched}`);
  const turnN = Number(relaunched.match(/turn (\d+): after relaunch/)?.[1]);
  await turnDone("after relaunch");
  const stateAfter = fakeState();
  assert.deepEqual(Object.keys(stateAfter), sessionsBefore, "no new Reason Session");
  assert.equal(stateAfter[before].turns, turnN, `Session ${before} ran the follow-up as its turn ${turnN}`);
  await screenshot("reason-chat-relaunch-follow-up");
  pass(`after a relaunch with workspace ws-b selected, the follow-up resumed Session ${before} in ws-a ("turn ${turnN}: after relaunch"), with no 409 and no new Session`);

  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("failure").catch(() => {});
    await chatText().then((t) => console.error(`chat text:\n${t}`)).catch(() => {});
    await focusedElement().then((f) => console.error(`focus: ${f}`)).catch(() => {});
    await composerValue().then((v) => console.error(`composer: ${JSON.stringify(v)}`)).catch(() => {});
    await run("const a = document.querySelector('.composer-attachments'); return a ? a.innerText : null;")
      .then((t) => console.error(`composer attachments: ${JSON.stringify(t)}`))
      .catch(() => {});
    await run("const r = document.querySelector('.terminal-panel .xterm-rows'); return r ? r.innerText : null;")
      .then((t) => console.error(`terminal text:\n${t}`))
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
