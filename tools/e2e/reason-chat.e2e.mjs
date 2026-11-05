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
//                        "Approve tool use", the session is needs_user_permission
//                        in conductor.db, the sidebar row and the Home list show
//                        "Needs permission"; Allow resumes the turn and the
//                        status goes back to idle
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
const running = () => run("return !!document.querySelector('.composer button[title=\"Stop the agent\"]');");

/** What has the keyboard, for failure messages: the composer, a terminal, or another element. */
const focusedElement = () =>
  run(`const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (a.closest(".composer")) return "composer " + a.tagName.toLowerCase();
    if (a.closest(".terminal-panel")) return "terminal " + a.className;
    return a.tagName.toLowerCase() + (a.className ? "." + a.className : "");`);
const composerValue = () => run("const t = document.querySelector('.composer textarea'); return t ? t.value : null;");

async function send(text) {
  await wd("POST", `/element/${await find(".composer textarea")}/value`, { text });
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

  // Seed one repo with one workspace through the real backend: the sidebar lists
  // what conductor.db holds, so the repo is added and a worktree created like the UI does.
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const seeded = await runAsync(
    `const done = arguments[arguments.length - 1];
     const invoke = window.__TAURI_INTERNALS__.invoke;
     // The workspace chat's model comes from Settings' default model (#271).
     invoke("get_settings")
       .then((s) => invoke("update_settings", { settings: { ...s, models: { ...s.models, default: "opus-5-5-1m" } } }))
       .then(() => invoke("add_repository", { path: arguments[0] }))
       .then((repo) => invoke("create_workspace", { repositoryId: repo.id, branchName: "e2e", directoryName: "e2e", baseBranch: null, existingBranch: false, prNumber: null }))
       .then((created) => done({ workspace: created.workspace }), (err) => done({ error: String(err) }));`,
    project,
  );
  assert.ok(seeded?.workspace, `seeding failed: ${JSON.stringify(seeded)}`);
  const workspace = seeded.workspace;
  const prefs = { selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] };
  await run("localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); location.reload();", JSON.stringify(prefs));
  const placeholder = await waitFor("the Reason chat panel", () => chatText().then((t) => t && t.includes("Reason runs this chat") && t));
  pass(`the desktop chat panel runs Reason: "${placeholder.split("\n").find((l) => l.includes("Reason runs"))}"`);

  // The workspace opens its first terminal on its own (a PTY spawn, so it lands
  // a moment later). Its arrival must not take the keyboard from the chat box:
  // keys typed there would go to the shell and Send would stay disabled.
  const terminalFirst = await run(`document.querySelector('.composer textarea').focus(); return !!document.querySelector('.terminal-panel .xterm');`);
  await waitFor("the workspace's terminal", () => run("return !!document.querySelector('.terminal-panel .xterm');"));
  await sleep(500);
  const focus = await focusedElement();
  assert.equal(focus, "composer textarea", `the terminal that opened with the workspace took focus from the chat box (${focus})`);
  pass(
    terminalFirst
      ? "the chat box keeps focus (the terminal was already open when it was focused)"
      : "the chat box keeps focus when the workspace's terminal opens after it",
  );

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
  await wd("POST", `/element/${await find('.composer button[title="Stop the agent"]')}/click`, {});
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

  // Every finished turn has a More actions menu ("Fork to new tab", "Fork to new workspace"); only
  // turns before the last also have "Reset chat". Opens the turn's menu with
  // real clicks, reads its items, and leaves it open.
  const openMenu = async (turn) => {
    await wd("POST", `/element/${await find(`${turn} button[aria-label="More actions"]`)}/click`, {});
    return waitFor(`${turn}'s menu`, () =>
      run(`const m = document.querySelector('${turn} .chat-menu'); return m ? [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.innerText.trim()) : null;`),
    );
  };
  const closeMenu = async (turn) => {
    await wd("POST", `/element/${await find(`${turn} button[aria-label="More actions"]`)}/click`, {});
    await waitFor(`${turn}'s menu to close`, () => run(`return !document.querySelector('${turn} .chat-menu');`));
  };
  const turn5 = `.chat-turn-end[data-turn-id="${id5}"]`;
  const turn6 = `.chat-turn-end[data-turn-id="${id6}"]`;
  const lastItems = await openMenu(turn6);
  assert.deepEqual(lastItems, ["Fork to new tab", "Fork to new workspace"], "the last turn has no Reset chat");
  await closeMenu(turn6);
  const turn5Items = await openMenu(turn5);
  assert.deepEqual(turn5Items, ["Fork to new tab", "Fork to new workspace", "Reset chat"], "turn 5 has both forks and Reset chat");
  pass('the last turn\'s menu has "Fork to new tab" and "Fork to new workspace"; turn 5\'s also has "Reset chat"');
  const resetItem = turn5Items.indexOf("Reset chat") + 1;
  await wd("POST", `/element/${await find(`${turn5} .chat-menu [role="menuitem"]:nth-child(${resetItem})`)}/click`, {});
  const dialog = await waitFor('"Reset chat?" with "2 changed"', () =>
    run(`const d = document.querySelector('.modal[aria-label="Reset chat?"]'); return d && d.innerText.includes("changed") ? d.innerText : null;`),
  );
  assert.match(dialog, /Later messages will be deleted\./);
  assert.match(dialog, /Also reset files/);
  assert.match(dialog, /\b2 changed\b/, dialog);
  assert.equal(await run(`return document.querySelector('.modal input[aria-label="Also reset files"]').checked;`), true);
  await screenshot("reason-chat-reset-dialog");
  pass('Reset chat on turn 5 opens "Reset chat?": "Later messages will be deleted.", Also reset files on, 2 changed');

  await wd("POST", `/element/${await find(".modal .oc-btn-danger")}/click`, {});
  await waitFor("the dialog to close", () => run(`return !document.querySelector('.modal[aria-label="Reset chat?"]');`), 15000);
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
  // The fake runs its "bash: rm -rf build" tool row first, then asks.
  await waitFor('the "bash: rm -rf build" tool row', () => chatText().then((t) => t.includes("bash: rm -rf build")));
  await waitFor("Needs permission on the sidebar row", async () => needsPermission(await sidebarStatus()), 15000).catch(async (e) => {
    throw new Error(`${e.message}; the sidebar row icons are ${JSON.stringify(await sidebarStatus())}`);
  });
  const card = await waitFor("the permission card", () => run(`const c = document.querySelector('[data-testid="chat-permission-request"]'); return c ? c.innerText : null;`));
  assert.match(card, /Approve tool use/);
  assert.match(card, /bash: rm -rf build/);
  const storedRows = await waitFor("needs_user_permission in conductor.db", async () => {
    const rows = await storedStatuses();
    return Array.isArray(rows) && rows.some((r) => r.chatId === workspace.id && r.status === "needs_user_permission") && rows;
  });
  await screenshot("status-needs-permission-chat");
  pass(`Reason's permission request shows "Approve tool use", the sidebar row says Needs permission, conductor.db holds ${JSON.stringify(storedRows)}`);

  await run(`const b = [...document.querySelectorAll(".sb-row")].find((e) => e.querySelector(".sb-row-label")?.textContent.trim() === "Home"); b.click(); return true;`);
  await waitFor("Needs permission on the Home row", async () => needsPermission(await homeStatus()));
  await screenshot("status-needs-permission-home");
  pass("the Home list shows the workspace's Needs permission status in place of its time");

  await run(`document.querySelector('[data-testid="workspace-status-icon"][data-status="needs-user-permission"]').closest("button").click(); return true;`);
  await wd("POST", `/element/${await waitFor("the Allow button", () => find('.chat-permission button[data-kind="allow_once"]'))}/click`, {});
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
  const forkItem = forkItems.indexOf("Fork to new workspace") + 1;
  assert.ok(forkItem > 0, JSON.stringify(forkItems));
  await wd("POST", `/element/${await find(`${turn5} .chat-menu [role="menuitem"]:nth-child(${forkItem})`)}/click`, {});
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
