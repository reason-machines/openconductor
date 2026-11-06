#!/usr/bin/env node
// End-to-end test of the composer's "/" menu through the built desktop app,
// for each chat agent (Reason, Codex, Claude Code).
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only) with stand-ins on PATH, so it needs no sign-in:
//   reason  tools/reason-acp/fake_reason_acp.py (`reason skills list` and `acp`)
//   codex   tools/e2e/fake_codex_app_server.py (`skills/list`, skill input items)
//   claude  tools/e2e/fake_claude.py (stream-json `initialize` command list)
// Each lists the fixture skill "oc-fixture" from its own folder in a fresh
// HOME; running it replies "OC-FIXTURE-SKILL-RAN <args>".
//
// For each agent: "/" opens the menu, which is not empty and lists
// oc-fixture with its description; typing "oc-fix" filters the menu down to
// rows that match; Enter picks oc-fixture into the box; sending it runs the
// skill in a real turn of the app's chat, and the reply shows in the chat.
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/slash-menu.e2e.mjs <path to the built app binary>
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
  console.error("usage: slash-menu.e2e.mjs <app binary>");
  process.exit(2);
}

const FIXTURE = "oc-fixture";
const MARKER = "OC-FIXTURE-SKILL-RAN";
const skillFile = `---\nname: ${FIXTURE}\ndescription: OpenConductor e2e fixture skill\n---\n\n${MARKER}\n\nReply with the line above, then the arguments.\n`;

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-slash-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
for (const dir of [".claude/skills", ".codex/skills", ".reason-fake/skills"]) {
  mkdirSync(join(home, dir, FIXTURE), { recursive: true });
  writeFileSync(join(home, dir, FIXTURE, "SKILL.md"), skillFile);
}
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// The app finds each CLI on PATH or in ~/.local/bin (Codex through the login shell's PATH).
const bin = join(home, ".local", "bin");
mkdirSync(bin, { recursive: true });
const stand = { reason: "tools/reason-acp/fake_reason_acp.py", codex: "tools/e2e/fake_codex_app_server.py", claude: "tools/e2e/fake_claude.py" };
for (const [name, file] of Object.entries(stand)) {
  writeFileSync(join(bin, name), `#!/bin/sh\nexec python3 "${join(repoRoot, file)}" "$@"\n`);
  chmodSync(join(bin, name), 0o755);
}

const env = { ...process.env, HOME: home, SHELL: "/bin/bash", PATH: `${bin}:${process.env.PATH}` };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME", "REASON_CLI", "ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR"]) delete env[k];
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
let sessionUrl = null;

/** One WebDriver request; one that hangs fails after 60 s with its path. */
async function wd(method, path, body) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  }).catch((e) => {
    throw new Error(`${method} ${path}: ${e?.name === "TimeoutError" ? "no answer in 60 s" : (e?.message ?? e)}`);
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

/**
 * Saves a screenshot. Best effort, as in tests/e2e/run.mjs: WebKitWebDriver on
 * a loaded Xvfb sometimes drops a screenshot request, which says nothing about
 * the menu, so a failed shot is logged and the checks go on.
 */
async function screenshot(name) {
  try {
    const png = await wd("GET", "/screenshot");
    const file = join(out, `${name}.png`);
    writeFileSync(file, Buffer.from(png, "base64"));
    console.log(`screenshot: ${file}`);
  } catch (e) {
    console.log(`no ${name}.png: ${e?.message ?? e}`);
  }
}

const TEXTAREA = ".composer textarea";
const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const composerValue = () => run(`return document.querySelector(${JSON.stringify(TEXTAREA)})?.value ?? null;`);
/** The menu's rows: shown name, description, whether it is a skill, and the "Skills" header. */
const menuRows = () =>
  run(`const menu = document.querySelector('[role="listbox"][aria-label="Slash commands"]');
    if (!menu) return null;
    return {
      header: [...menu.querySelectorAll('.oc-suggest-header-label')].map((e) => e.textContent),
      rows: [...menu.querySelectorAll('[role="option"]')].map((o) => ({
        name: o.querySelector('.oc-suggest-name').textContent,
        description: o.querySelector('.oc-suggest-desc').textContent,
        skill: o.hasAttribute('data-skill'),
      })),
    };`);

async function type(text) {
  await wd("POST", `/element/${await find(TEXTAREA)}/value`, { text });
}

const steps = [];
const pass = (s) => {
  steps.push(s);
  console.log(`ok - ${s}`);
};

/** Agent, the localStorage value that picks it, its chip label, and how the fixture row is named. */
const AGENTS = [
  { id: "reason", label: null, fixture: FIXTURE, skillRow: true },
  { id: "codex", label: "Codex", fixture: FIXTURE, skillRow: true },
  { id: "claude", label: "Claude Code", fixture: FIXTURE, skillRow: false },
];

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const session = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } },
  });
  sessionUrl = `${base}/session/${session.sessionId}`;
  await wd("POST", "/window/rect", { width: 1440, height: 900 }).catch(() => undefined);

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
  const prefs = JSON.stringify({ selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] });

  for (const agent of AGENTS) {
    // The chat's agent is the picker's choice, kept per chat (the chat id is the workspace id).
    await run(
      "localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); localStorage.setItem('openconductor.agent.' + arguments[1], arguments[2]); location.reload(); return true;",
      prefs,
      workspace.id,
      agent.id,
    );
    await waitFor(`${agent.id}: the composer`, () => run(`return !!document.querySelector(${JSON.stringify(TEXTAREA)});`));
    if (agent.label) {
      const chip = await waitFor(`${agent.id}: the picker chip`, () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.innerText || null;"));
      assert.ok(chip.includes(agent.label), `the chat runs ${agent.label}: chip says ${chip}`);
    }

    // "/" opens the menu; the agent's lookup answers a moment later.
    await run(`document.querySelector(${JSON.stringify(TEXTAREA)}).focus(); return true;`);
    await type("/");
    const menu = await waitFor(`${agent.id}: the fixture skill in the "/" menu`, async () => {
      const m = await menuRows();
      return m && m.rows.some((r) => r.name === agent.fixture) ? m : null;
    });
    assert.ok(menu.rows.length > 0, "the menu is not empty");
    const row = menu.rows.find((r) => r.name === agent.fixture);
    assert.match(row.description, /OpenConductor e2e fixture skill/);
    assert.equal(row.skill, agent.skillRow, `${agent.fixture} is ${agent.skillRow ? "under Skills" : "one of Claude Code's commands"}`);
    if (agent.skillRow) assert.deepEqual(menu.header, ["Skills"], "one Skills header");
    await screenshot(`slash-${agent.id}-menu`);
    pass(`${agent.id}: "/" lists ${menu.rows.length} rows with ${agent.fixture} ("${row.description}")`);

    // Typing filters.
    await type("oc-fix");
    const filtered = await waitFor(`${agent.id}: the filtered menu`, async () => {
      const m = await menuRows();
      return m && m.rows.length < menu.rows.length ? m : null;
    });
    assert.ok(filtered.rows.some((r) => r.name === agent.fixture), JSON.stringify(filtered.rows));
    for (const r of filtered.rows) assert.match(r.name, /o.*c.*-.*f.*i.*x/i, `${r.name} matches "oc-fix"`);
    await screenshot(`slash-${agent.id}-filtered`);
    pass(`${agent.id}: "/oc-fix" narrows the menu to ${filtered.rows.map((r) => r.name).join(", ")}`);

    // Enter picks the first row into the box; the skill then runs as a turn.
    console.log(`${agent.id}: picking with Enter`);
    assert.equal(filtered.rows[0].name, agent.fixture, "the fixture is the first match");
    await wd("POST", `/element/${await find(TEXTAREA)}/value`, { text: "\uE007" });
    await waitFor(`${agent.id}: the picked skill in the box`, async () => (await composerValue()) === `/${agent.fixture} `);
    assert.equal(await menuRows(), null, "picking closes the menu");
    const args = `e2e-${agent.id}`;
    await type(args);
    console.log(`${agent.id}: sending "/${agent.fixture} ${args}"`);
    await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
    const reply = `${MARKER} `;
    const text = await waitFor(`${agent.id}: the skill's reply`, () => chatText().then((t) => (t && t.includes(reply) && t.includes(args) ? t : null)), 45000);
    assert.ok(text.includes(MARKER));
    await screenshot(`slash-${agent.id}-ran`);
    pass(`${agent.id}: picking ${agent.fixture} and sending ran it ("${MARKER} … ${args}" in the chat)`);
  }

  writeFileSync(join(out, "slash-menu-steps.json"), JSON.stringify(steps, null, 2));
  console.log(`\nall ${steps.length} checks passed`);
} catch (e) {
  console.error(`FAIL: ${e?.stack ?? e}`);
  await screenshot("slash-failure");
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => undefined);
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
