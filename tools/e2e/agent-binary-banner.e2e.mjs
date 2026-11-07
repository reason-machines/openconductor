#!/usr/bin/env node
// End-to-end test of the bundled agent binary download banner through the
// built desktop app (Conductor's `UAo` above the composer; slice 5,
// evidence/persistence/agent-binaries/README.md).
//
// Drives the real app binary over WebDriver (tauri-driver + WebKitWebDriver,
// Linux only). OPENCONDUCTOR_AGENT_BINARY_MANIFEST points the backend's release
// source at a manifest whose Claude Code file is served by a local HTTP server
// in this script, so the download can fail, retry and succeed on cue. One
// workspace chat with the agent set to Claude Code and no executable path set:
//
//   1. the launch-time download gets 404s: the banner reads "Downloading Claude Code
//      2.1.284… Retrying in Ns (attempt 2)" with Retry now, then "Couldn't
//      download Claude Code." with Retry; "see error" shows the HTTP error
//   2. a reload hydrates the failed status and the store retries it by itself
//   3. the server sends the file slowly: Retry shows "n MB / 3 MB" while it
//      downloads, the banner goes away once the binary is verified and
//      get_agent_binary_state reports it ready
//   4. Settings' Claude Code executable path hides the banner
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/agent-binary-banner.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)
// No npm dependencies: WebDriver is plain HTTP.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: agent-binary-banner.e2e.mjs <app binary>");
  process.exit(2);
}

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-binary-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

// The "release host": 3 MiB served in 64 KiB chunks every 60 ms (~3 s), or 404.
const MiB = 1024 * 1024;
const payload = Buffer.alloc(3 * MiB, 7);
let mode = "fail";
const fixtureRequests = [];
const server = createServer((req, res) => {
  const request = { path: req.url, mode, status: null, finished: false };
  fixtureRequests.push(request);
  res.on("finish", () => {
    request.status = res.statusCode;
    request.finished = true;
  });
  if (req.url !== "/claude" || mode === "fail") {
    res.writeHead(404).end("not here");
    return;
  }
  res.writeHead(200, { "content-length": payload.length, "content-type": "application/octet-stream" });
  let off = 0;
  const tick = () => {
    if (off >= payload.length) return void res.end();
    res.write(payload.subarray(off, off + 64 * 1024));
    off += 64 * 1024;
    setTimeout(tick, 60);
  };
  tick();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/claude`;
const manifest = join(home, "agent-binary-manifest.json");
const sha256 = createHash("sha256").update(payload).digest("hex");
writeFileSync(manifest, JSON.stringify({ claude: { version: "2.1.284", files: [{ exe: "claude", url, sha256, size: payload.length }] } }));

const env = { ...process.env, HOME: home, SHELL: "/bin/bash", OPENCONDUCTOR_AGENT_BINARY_MANIFEST: manifest };
for (const k of ["XDG_DATA_HOME", "XDG_CONFIG_HOME"]) delete env[k];
const driver = spawn(process.env.TAURI_DRIVER || "tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const driverExited = new Promise((r) => driver.on("exit", r));

const base = "http://127.0.0.1:4444";
let sessionUrl = null;

/** One WebDriver request; none may hang the run (25 s bound, named in the error). */
async function wd(method, path, body, timeoutMs = 25000) {
  const res = await fetch(`${sessionUrl ?? base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => {
    throw new Error(`${method} ${path}: ${e?.name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : e}`);
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (script, ...args) => wd("POST", "/execute/sync", { script, args });
const runAsync = (script, ...args) => wd("POST", "/execute/async", { script, args });
const invoke = (cmd, args = {}) =>
  runAsync(
    "const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then((v) => done({ ok: v ?? null }), (e) => done({ error: String(e) }));",
    cmd,
    args,
  ).then((r) => {
    if (r?.error) throw new Error(`${cmd}: ${r.error}`);
    return r?.ok;
  });

async function waitFor(what, fn, timeoutMs = 30000, everyMs = 200) {
  console.log(`… ${what}`);
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}; last: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

/** Saves <name>.png; a screenshot that fails or takes over 20 s is logged, not fatal (as in run.mjs). */
async function screenshot(name) {
  try {
    const png = await wd("GET", "/screenshot", undefined, 20000);
    const file = join(out, `${name}.png`);
    writeFileSync(file, Buffer.from(png, "base64"));
    console.log(`screenshot: ${file}`);
  } catch (e) {
    console.log(`no ${name}.png: ${e?.message ?? e}`);
  }
}

/** The banner's state, text, button and error, or null when it is not shown. */
const banner = () =>
  run(`const b = document.querySelector('[data-testid="agent-binary-banner"]');
       if (!b) return null;
       return {
         state: b.dataset.state,
         text: b.querySelector('.agent-binary-banner-text').innerText.replace(/\\s+/g, ' ').trim(),
         action: b.querySelector('.agent-binary-banner-action')?.innerText.trim() ?? null,
         error: b.querySelector('.agent-binary-banner-error')?.innerText ?? null,
         // Right above the visible composer: .composer-wrap itself (a tool approval in its
         // place), or the composer's slot (WorkspaceView) when shown and holding it.
         aboveComposer: (() => {
           const n = b.nextElementSibling;
           if (!n) return false;
           if (n.classList.contains('composer-wrap')) return true;
           return n.classList.contains('oc-composer-slot') && !n.hidden && !!n.querySelector(':scope > .composer-wrap');
         })(),
         pulsing: !!b.querySelector('.agent-binary-banner-icon.is-downloading'),
         alert: !!b.querySelector('.agent-binary-banner-icon.is-failed'),
       };`);
const bannerIn = (state) => async () => {
  const b = await banner();
  return b?.state === state ? b : null;
};
const click = (css) => run("const el = document.querySelector(arguments[0]); if (!el) return false; el.click(); return true;", css);

const steps = [];
const pass = (s) => {
  steps.push(s);
  console.log(`ok - ${s}`);
};

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  // Starting the app takes 25-40 s on a cold CI runner.
  const session = await wd(
    "POST",
    "/session",
    { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } } },
    180000,
  );
  sessionUrl = `${base}/session/${session.sessionId}`;
  await wd("POST", "/window/rect", { width: 1280, height: 860 }).catch(() => {});

  // One repo with one workspace through the real backend; its main chat runs Claude Code.
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));
  const repo = await invoke("add_repository", { path: project });
  const { workspace } = await invoke("create_workspace", { repositoryId: repo.id, branchName: "e2e", directoryName: "e2e", baseBranch: null, existingBranch: false, prNumber: null });
  const prefs = { selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] };
  await run(
    "localStorage.setItem('openconductor.shell.prefs.v1', arguments[0]); localStorage.setItem('openconductor.agent.' + arguments[1], 'claude'); location.reload();",
    JSON.stringify(prefs),
    workspace.id,
  );
  await waitFor("the chat composer", () => run("return !!document.querySelector('.composer-wrap [contenteditable=true]');"));

  // 1. The app fetches both agents at launch (lib.rs, as Conductor does); the host 404s:
  // retrying with a countdown, then failed.
  const checkRetrying = async (b, when) => {
    assert.match(b.text, /^Downloading Claude Code 2\.1\.284…\s?Retrying in \d+s \(attempt [23]\)/, b.text);
    assert.equal(b.action, "Retry now");
    assert.ok(b.aboveComposer, "the banner sits right above the composer");
    assert.ok(b.pulsing, "pulsing download icon");
    await screenshot("binary-1-retrying");
    pass(`${when}: "${b.text}" with Retry now, above the composer`);
  };
  // The launch-time download may already have used its attempts by the time the window is up.
  const first = await waitFor("the launch-time download's banner", async () => {
    const b = await banner();
    return b && (b.state === "retrying" || b.state === "failed") ? b : null;
  }, 30000, 100);
  let sawRetrying = first.state === "retrying";
  if (sawRetrying) await checkRetrying(first, "the launch-time download retries");

  const failed = await waitFor("the failed banner", bannerIn("failed"), 30000);
  assert.match(failed.text, /^Couldn't download Claude Code\. see error$/, failed.text);
  assert.ok(fixtureRequests.some((r) => r.mode === "fail" && r.status === 404 && r.finished), "the local fixture answered the failed download with HTTP 404");
  assert.equal(failed.action, "Retry");
  assert.ok(failed.alert, "destructive alert icon");
  assert.ok(await click(".agent-binary-banner-toggle"));
  const opened = await waitFor("the error text", async () => ((await banner())?.error ? banner() : null));
  assert.match(opened.error, /404/, opened.error);
  assert.match(opened.text, /hide error$/);
  await screenshot("binary-2-failed");
  pass(`after the last attempt: "Couldn't download Claude Code." with Retry; see error shows "${opened.error.trim().slice(0, 80)}"`);

  // 2. Hydrating a failed status retries it (Conductor's AgentBinaryStore.initialize).
  await run("location.reload();");
  await waitFor("the chat composer after reload", () => run("return !!document.querySelector('.composer-wrap [contenteditable=true]');"));
  const again = await waitFor("the auto-retry", bannerIn("retrying"), 15000, 100);
  if (!sawRetrying) await checkRetrying(again, "the auto-retry retries");
  await waitFor("the auto-retry to fail again", bannerIn("failed"), 30000);
  pass("a reload hydrates the failed status and the store retries the download by itself");

  // 3. Retry with the file available: progress in MB, then gone once ready.
  mode = "slow";
  assert.ok(await click(".agent-binary-banner-action"));
  const downloading = await waitFor("progress in MB", async () => {
    const b = await banner();
    return b?.state === "downloading" && /\d+ MB \/ 3 MB$/.test(b.text) ? b : null;
  }, 15000, 100);
  assert.match(downloading.text, /^Downloading Claude Code 2\.1\.284… \d+ MB \/ 3 MB$/);
  assert.equal(downloading.action, null, "no button while downloading");
  await screenshot("binary-3-downloading");
  pass(`Retry downloads again: "${downloading.text}"`);
  await waitFor("the banner to go once ready", async () => (await banner()) === null, 30000);
  const state = await invoke("get_agent_binary_state");
  const claude = state.find((s) => s.agent === "claude");
  assert.equal(claude?.state, "ready", JSON.stringify(state));
  assert.equal(claude?.version, "2.1.284");
  pass("the banner goes away once the binary is verified; get_agent_binary_state reports claude 2.1.284 ready");

  // 4. A custom executable path hides the banner even while a download fails:
  // a newer release that 404s, with Settings' Claude Code executable path set.
  mode = "fail";
  writeFileSync(manifest, JSON.stringify({ claude: { version: "2.1.285", files: [{ exe: "claude", url, sha256, size: payload.length }] } }));
  const settings = await invoke("get_settings");
  await invoke("update_settings", { settings: { ...settings, claude_code_executable_path: "/usr/bin/true" } });
  await run("location.reload();");
  await waitFor("the chat composer after reload", () => run("return !!document.querySelector('.composer-wrap [contenteditable=true]');"));
  await invoke("request_agent_binary_download", { agent: "claude" });
  await waitFor("2.1.285 to be retrying", async () => {
    const s = (await invoke("get_agent_binary_state")).find((x) => x.agent === "claude");
    return s?.version === "2.1.285" && s.state === "retrying";
  }, 15000);
  await sleep(1000);
  assert.equal(await banner(), null, "Settings' executable path wins");
  pass("with Settings' Claude Code executable path set, no banner shows");

  console.log(`\n${steps.length} checks passed`);
} catch (e) {
  console.error(`not ok - ${e instanceof Error ? e.stack : e}`);
  if (sessionUrl) {
    await screenshot("binary-failure").catch(() => {});
    const diagnostics = {
      banner: await banner().catch((error) => ({ error: String(error) })),
      backend: await invoke("get_agent_binary_state").catch((error) => ({ error: String(error) })),
      fixtureRequests,
    };
    writeFileSync(join(out, "binary-failure.json"), JSON.stringify(diagnostics, null, 2));
    console.error(`binary failure diagnostics: ${JSON.stringify(diagnostics)}`);
  }
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  server.close();
  await Promise.race([driverExited, sleep(3000)]);
}
