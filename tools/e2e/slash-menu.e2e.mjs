#!/usr/bin/env node
// End-to-end test of the composer's "/" menu through the built desktop app:
// for a Reason, a Claude Code and a Codex chat, typing "/" lists the agent's
// commands and skills with descriptions, typing filters them, and Enter puts
// the picked skill in the draft (`/name `, or `$name ` for Codex).
//
// A fresh HOME holds the fixture skill `oc-fixture-skill` where Claude Code
// (~/.claude/skills) and Codex (~/.agents/skills) read user skills, and a
// stand-in `reason` answers `reason skills list` with it (other commands go
// to tools/reason-acp/fake_reason_acp.py). No agent is signed in here, so
// Claude Code's and Codex's lists come from their folders
// (src-tauri/src/agent_commands/scan.rs); tools/slash-menu/run-e2e-mac.sh
// runs the same menus, and real turns, against the signed-in CLIs.
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/slash-menu.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)

import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";
import { finishStartup } from "../../tests/e2e/startup.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: slash-menu.e2e.mjs <app binary>");
  process.exit(2);
}

const FIXTURE = "oc-fixture-skill";
const FIXTURE_DESCRIPTION = "OpenConductor e2e fixture skill. Replies with one marker line and does nothing else.";
const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-slash-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const skill = `---\nname: ${FIXTURE}\ndescription: ${FIXTURE_DESCRIPTION}\n---\n\nReply with OC-FIXTURE-SKILL-RAN and nothing else.\n`;
for (const dir of [".claude/skills", ".agents/skills"]) {
  mkdirSync(join(home, dir, FIXTURE), { recursive: true });
  writeFileSync(join(home, dir, FIXTURE, "SKILL.md"), skill);
}
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// `reason` on PATH: `skills list` answers like Reason CLI 0.2.689 with the
// fixture; everything else is the ACP stand-in.
const bin = join(home, "bin");
mkdirSync(bin);
const skills = JSON.stringify({ schema_version: 1, ok: true, data: { items: [
  { skill_id: "fixture-1", name: FIXTURE, description: FIXTURE_DESCRIPTION, is_enabled: true },
  // A second skill the "/oc-fix" filter drops.
  { skill_id: "fixture-2", name: "release-notes", description: "Draft release notes", is_enabled: true },
], total: 2, has_next_page: false, end_cursor: null } });
writeFileSync(join(home, "skills.json"), skills);
const fake = join(repoRoot, "tools/reason-acp/fake_reason_acp.py");
writeFileSync(join(bin, "reason"), `#!/bin/sh\nif [ "$1" = skills ]; then cat "${join(home, "skills.json")}"; exit 0; fi\nexec python3 "${fake}" "$@"\n`);
chmodSync(join(bin, "reason"), 0o755);

// Skills discovery uses the managed path, not the chat executable override.
// Keep the real install for every setup check; replace it only inside this disposable HOME.
const managedReason = join(home, ".local/bin/reason");
const officialReason = join(home, "official-reason");
function installSkillsFixture() {
  copyFileSync(managedReason, officialReason);
  copyFileSync(join(bin, "reason"), `${managedReason}.fixture`);
  renameSync(`${managedReason}.fixture`, managedReason);
}
function restoreOfficialReason() {
  if (!existsSync(officialReason)) return;
  copyFileSync(officialReason, `${managedReason}.restore`);
  renameSync(`${managedReason}.restore`, managedReason);
}

const env = { ...process.env, HOME: home, OPENCONDUCTOR_HOME: join(home, ".openconductor"), PATH: `${bin}:${process.env.PATH}` };
mkdirSync(env.OPENCONDUCTOR_HOME, { recursive: true });
writeFileSync(join(env.OPENCONDUCTOR_HOME, "settings.toml"), `reason_executable_path = ${JSON.stringify(join(bin, "reason"))}\n`);
delete env.REASON_CLI;
delete env.XDG_DATA_HOME;
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
const startup = new WebDriver(base);
let sessionUrl = null;
async function wd(method, path, body) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  writeFileSync(join(out, `${name}.png`), Buffer.from(png, "base64"));
  console.log(`screenshot: ${join(out, `${name}.png`)}`);
}
const menu = () =>
  run(`return Array.from(document.querySelectorAll('.oc-suggest .oc-suggest-row'), (r) => ({
    name: r.querySelector('.oc-suggest-name')?.textContent ?? '',
    description: r.querySelector('.oc-suggest-desc')?.textContent ?? '',
    skill: r.hasAttribute('data-skill'),
  }));`);
const headings = () => run("return Array.from(document.querySelectorAll('.oc-suggest .oc-suggest-heading-label'), (h) => h.textContent);");
const composerValue = () => run("const t = document.querySelector('.composer [contenteditable=true]'); return t ? t.textContent : null;");
async function clearComposer() {
  await run(`const t = document.querySelector('.composer [contenteditable=true]');
    t.focus(); const selection = getSelection(); selection.selectAllChildren(t);
    document.execCommand('delete'); return true;`);
}
const type = async (text) => wd("POST", `/element/${await find(".composer [contenteditable=true]")}/value`, { text });
const chip = () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.textContent ?? null;");
async function pickAgent(label) {
  await wd("POST", `/element/${await find("[data-testid='composer-model-button']")}/click`, {});
  const items = await waitFor("the model menu", () => run("return Array.from(document.querySelectorAll('.oc-model-menu .oc-model-item'), (b) => b.textContent.trim());").then((xs) => (xs.length ? xs : null)));
  assert.ok(items.includes(label), `${label} in the model picker: ${items.join(", ")}`);
  await run("for (const b of document.querySelectorAll('.oc-model-menu .oc-model-item')) if (b.textContent.trim() === arguments[0]) { b.click(); return true; } return false;", label);
  await waitFor(`${label} on the picker chip`, () => chip().then((c) => c && c.includes(label)));
}

const steps = [];
const pass = (s) => {
  steps.push(s);
  console.log(`ok - ${s}`);
};

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const session = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } } });
  sessionUrl = `${base}/session/${session.sessionId}`;
  startup.sessionId = session.sessionId;
  await wd("POST", "/window/rect", { width: 1440, height: 900 }).catch(() => {});
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
  restoreOfficialReason();
  // Keep the composer unmounted until the post-setup fixture hook has finished.
  await run("localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); history.replaceState(null, '', '/first-run-onboarding'); location.reload();", JSON.stringify(prefs));
  await finishStartup(startup, { afterSetup: installSkillsFixture });
  await waitFor("the workspace chat", () => run("return !!document.querySelector('.workspace .composer [contenteditable=true]');"), 60000);
  await waitFor("the model picker", () => chip());

  // Reason (the default agent), Claude Code, Codex.
  const agents = [
    { id: "reason", label: null, insert: `/${FIXTURE} `, heading: true },
    { id: "claude", label: "Claude Code", insert: `/${FIXTURE} `, heading: false },
    { id: "codex", label: "Codex", insert: `$${FIXTURE} `, heading: true },
  ];
  for (const a of agents) {
    if (a.label) await pickAgent(a.label);
    await clearComposer();
    await wd("POST", `/element/${await find(".composer [contenteditable=true]")}/click`, {});
    await type("/");
    const rows = await waitFor(`${a.id}: the fixture skill in the "/" menu`, () => menu().then((rs) => (rs.some((r) => r.name === FIXTURE) ? rs : null)), 45000);
    assert.ok(rows.length >= 2, `${a.id}: the "/" menu lists the fixture and more: ${rows.length}`);
    const fixture = rows.find((r) => r.name === FIXTURE);
    assert.equal(fixture.description, FIXTURE_DESCRIPTION, `${a.id}: the skill's description`);
    assert.equal(fixture.skill, a.heading, `${a.id}: listed as a ${a.heading ? "skill" : "command"}`);
    // Commands first, then skills (Conductor's jNi), under one "Skills" heading.
    const firstSkill = rows.findIndex((r) => r.skill);
    if (a.heading) {
      assert.deepEqual(await headings(), ["Skills"], `${a.id}: one Skills heading`);
      assert.ok(rows.slice(firstSkill).every((r) => r.skill), `${a.id}: every row after the first skill is a skill`);
    }
    await screenshot(`slash-menu-${a.id}-open`);
    pass(`${a.id}: "/" lists ${rows.length} items with descriptions, including ${FIXTURE} ("${fixture.description}")`);

    await type("oc-fix");
    const filtered = await waitFor(`${a.id}: the filtered menu`, () => menu().then((rs) => (rs.length < rows.length ? rs : null)));
    assert.ok(filtered.some((r) => r.name === FIXTURE), `${a.id}: the filter keeps ${FIXTURE}: ${filtered.map((r) => r.name).join(", ")}`);
    await screenshot(`slash-menu-${a.id}-filtered`);
    pass(`${a.id}: "/oc-fix" narrows ${rows.length} items to ${filtered.length}: ${filtered.map((r) => r.name).join(", ")}`);

    const at = filtered.findIndex((r) => r.name === FIXTURE);
    await type("\uE015".repeat(at) + "\uE007");
    await waitFor(`${a.id}: the picked skill in the draft`, () => composerValue().then((v) => v === a.insert));
    assert.equal((await menu()).length, 0, `${a.id}: the menu closes after the pick`);
    pass(`${a.id}: Enter puts ${JSON.stringify(a.insert)} in the draft`);
    await clearComposer();
  }
  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("slash-menu-failure").catch(() => {});
    await menu().then((m) => console.error(`menu: ${JSON.stringify(m)}`)).catch(() => {});
    await composerValue().then((v) => console.error(`composer: ${JSON.stringify(v)}`)).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  restoreOfficialReason();
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
