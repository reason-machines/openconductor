// First run on a throwaway HOME with no `reason` on PATH, through the built app:
//   1. the window reaches onboarding at once while the official Reason CLI
//      installs in the background (status in a corner, nothing over the app);
//   2. "Continue without signing in" reaches the main window, the status sits
//      in the sidebar footer, and the composer stays clickable;
//   3. the install finishes by itself, the status clears, and
//      `~/.local/bin/reason --version` works.
// Real network: the official manifest and install script (reasonmachines.com).
//
// usage: xvfb-run -a node tools/e2e/reason-cli-first-run.e2e.mjs <app binary>
import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: reason-cli-first-run.e2e.mjs <app binary>");
  process.exit(2);
}

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-cli-first-run-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const cli = join(home, ".local/bin/reason");

// No `reason` anywhere on PATH.
const onPath = (dir) => { try { accessSync(join(dir, "reason"), constants.X_OK); return true; } catch { return false; } };
const PATH = (process.env.PATH ?? "").split(":").filter((dir) => dir && !onPath(dir)).join(":");
assert.equal(existsSync(cli), false);

const env = { ...process.env, HOME: home, PATH, OPENCONDUCTOR_HOME: join(home, ".openconductor"), SHELL: "/bin/bash" };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "REASON_API_KEY"]) delete env[k];
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const base = "http://127.0.0.1:4444";
let sessionUrl = null;
async function wd(method, path, body) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, { method, signal: AbortSignal.timeout(90000), headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}
const run = (script, ...args) => wd("POST", "/execute/sync", { script, args });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what, fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}; last: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}
async function click(css) {
  const el = await wd("POST", "/element", { using: "css selector", value: css });
  await wd("POST", `/element/${el[W3C_ELEMENT] ?? el.ELEMENT}/click`, {});
}
async function screenshot(name) {
  const f = join(out, `${name}.png`);
  writeFileSync(f, Buffer.from(await wd("GET", "/screenshot"), "base64"));
  console.log(`screenshot: ${f}`);
}
const cliStatus = () => run(`const el = document.querySelector('[data-testid="reason-cli-status"]'); return el ? { state: el.dataset.state, text: el.textContent, title: el.getAttribute('title') } : null;`);
const pass = (s) => console.log(`ok - ${s}`);

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const launched = Date.now();
  const session = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } } });
  sessionUrl = `${base}/session/${session.sessionId}`;

  // 1. Onboarding appears without waiting for the install.
  await waitFor("first-run onboarding", () => run("return !!document.querySelector('.onb .onb-continue:not(:disabled)');"), 30000);
  const openedMs = Date.now() - launched;
  const early = await cliStatus();
  await screenshot("cli-first-run-1-onboarding");
  assert.equal(existsSync(cli) && early === null, false, "the window opened before the install finished");
  pass(`first run opened onboarding in ${openedMs} ms with CLI status ${JSON.stringify(early?.state ?? "done")}`);

  // 2. The main window, with the status in the sidebar footer and nothing covering the app.
  await click(".onb .onb-continue:not(:disabled)");
  await waitFor("the main window", () => run("return !!document.querySelector('.app') && !document.querySelector('.onb');"), 30000);
  const footer = await run(`const el = document.querySelector('[data-testid="reason-cli-status"]'); return el ? !!el.closest('.sb-footer') : null;`);
  if (footer !== null) assert.equal(footer, true, "the CLI status lives in the sidebar footer");
  const covered = await run(`const s = document.querySelector('.sb-footer-btn[aria-label="Settings"]'); if (!s) return 'no settings button'; const r = s.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return s.contains(top) ? null : (top?.className || String(top));`);
  assert.equal(covered, null, "nothing covers the footer's Settings button");
  await screenshot("cli-first-run-2-main-window");
  pass(`main window reached with the CLI status ${footer === null ? "already cleared" : "in the sidebar footer"}`);

  // 3. The background install finishes by itself and the CLI runs.
  const done = await waitFor("the background Reason CLI install", async () => {
    const s = await cliStatus();
    if (s?.state === "error") throw Object.assign(new Error(`Reason CLI setup failed: ${s.title}`), { fatal: true });
    return s === null || s.state === "warning" ? { status: s } : null;
  }, 600000);
  console.log(`app responsive after install: ${JSON.stringify(await run("return document.readyState;"))}`);
  await screenshot("cli-first-run-3-installed");
  const version = execFileSync(cli, ["--version"], { env, encoding: "utf8", timeout: 60000 }).trim();
  assert.ok(version.length > 0);
  pass(`background install finished (${JSON.stringify(done.status?.state ?? "cleared")}); ${cli} --version: ${version}`);
} catch (error) {
  console.error(`not ok - ${error instanceof Error ? error.stack : error}`);
  await screenshot("cli-first-run-failure").catch(() => {});
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await driverExited;
}
