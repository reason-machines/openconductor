#!/usr/bin/env node
// End-to-end test of the bundled agent binaries through the built desktop app
// (src-tauri/src/agent_binaries.rs + agent_launch.rs).
//
// OPENCONDUCTOR_AGENT_BINARY_MANIFEST points the app at a local "release":
// Claude Code as a raw file, Codex as .tar.gz members (the shape of the
// upstream assets), each with its sha256. A second `codex` sits only on the
// login shell's PATH (~/.bash_profile). Each wrapper appends its name to
// ~/launched.txt, then the Codex one runs tools/e2e/fake_codex_app_server.py.
//
//   1. at launch the app downloads both agents into agent-binaries/ with
//      their .meta records; get_agent_binary_state reports them ready
//   2. agent_executable_status: source "bundled", the version folder
//   3. agent_system_binary ("Use system Codex") finds the login-shell copy
//   4. a Codex chat runs the bundled copy, not the one on PATH, and replies
//   5. a Settings executable path overrides the bundled copy
//
// Usage (under a display, e.g. xvfb-run):
//   node tools/e2e/agent-binaries.e2e.mjs <path to the built app binary>
// Env: E2E_OUT  folder for screenshots (default: a temp folder)
//      TAURI_DRIVER  tauri-driver binary (default: tauri-driver on PATH)

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] && resolve(process.argv[2]);
if (!app) {
  console.error("usage: agent-binaries.e2e.mjs <app binary>");
  process.exit(2);
}

const home = realpathSync(mkdtempSync(join(tmpdir(), "oc-e2e-agentbin-")));
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(home, "screens");
mkdirSync(out, { recursive: true });
const project = join(home, "proj");
mkdirSync(project);
const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "ignore" });
git("init", "-q", "-b", "main");
writeFileSync(join(project, "README.md"), "e2e\n");
git("add", ".");
git("-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "-m", "init");

const fake = join(repoRoot, "tools/e2e/fake_codex_app_server.py");
const launched = join(home, "launched.txt");
const codexWrapper = (name) => `#!/bin/sh\necho ${name} >> "${launched}"\nexec python3 "${fake}" "$@"\n`;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const exe = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
};

// The "release mirror".
const mirror = join(home, "mirror");
const stage = join(mirror, "stage");
const VERSION = { claude: "2.1.284-e2e", codex: "0.156.1-e2e" };
const claudeBody = `#!/bin/sh\necho claude-bundled >> "${launched}"\necho "${VERSION.claude} (Claude Code)"\n`;
exe(join(mirror, "claude"), claudeBody);
const codexBody = codexWrapper("codex-bundled");
const hostBody = "#!/bin/sh\nexit 0\n";
exe(join(stage, "codex-e2e"), codexBody);
exe(join(stage, "codex-code-mode-host-e2e"), hostBody);
execFileSync("tar", ["czf", join(mirror, "codex.tar.gz"), "-C", stage, "codex-e2e"]);
execFileSync("tar", ["czf", join(mirror, "host.tar.gz"), "-C", stage, "codex-code-mode-host-e2e"]);
const file = (exeName, url, body, entry) => ({
  exe: exeName,
  url: `file://${url}`,
  sha256: sha(body),
  size: Buffer.byteLength(body),
  ...(entry ? { tar_gz_entry: entry } : {}),
});
const manifestPath = join(mirror, "manifest.json");
writeFileSync(
  manifestPath,
  JSON.stringify({
    claude: { version: VERSION.claude, files: [file("claude", join(mirror, "claude"), claudeBody)] },
    codex: {
      version: VERSION.codex,
      files: [
        file("codex", join(mirror, "codex.tar.gz"), codexBody, "codex-e2e"),
        file("codex-code-mode-host", join(mirror, "host.tar.gz"), hostBody, "codex-code-mode-host-e2e"),
      ],
    },
  }),
);

// A codex only the login shell's PATH has.
const loginOnly = join(home, "login-only");
exe(join(loginOnly, "codex"), codexWrapper("codex-system"));
writeFileSync(join(home, ".bash_profile"), `export PATH="${loginOnly}:$PATH"\n`);
// And one for the Settings executable path.
const custom = join(home, "custom", "codex");
exe(custom, codexWrapper("codex-custom"));

const env = {
  ...process.env,
  HOME: home,
  SHELL: "/bin/bash",
  OPENCONDUCTOR_AGENT_BINARY_MANIFEST: manifestPath,
};
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
const invoke = (cmd, args = {}) =>
  runAsync(
    `const done = arguments[arguments.length - 1];
     window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then((v) => done({ ok: v }), (e) => done({ err: String(e) }));`,
    cmd,
    args,
  ).then((r) => {
    if (r && "err" in r) throw new Error(`${cmd}: ${r.err}`);
    return r?.ok;
  });

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
  const f = join(out, `${name}.png`);
  writeFileSync(f, Buffer.from(png, "base64"));
  console.log(`screenshot: ${f}`);
}

const chatText = () => run("const el = document.querySelector('.chat-scroll'); return el ? el.innerText : null;");
const launches = () => (existsSync(launched) ? readFileSync(launched, "utf8").trim().split("\n") : []);
const pass = (s) => console.log(`ok - ${s}`);

try {
  await waitFor("tauri-driver", () => fetch(`${base}/status`).then((r) => r.ok), 20000);
  const session = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } },
  });
  sessionUrl = `${base}/session/${session.sessionId}`;
  await waitFor("the app to load", () => run("return document.readyState === 'complete' && !!document.getElementById('root');"));

  // 1. Startup downloads.
  const states = await waitFor("both agents ready", async () => {
    const s = await invoke("get_agent_binary_state");
    return s.length === 2 && s.every((x) => x.state === "ready") ? s : null;
  });
  for (const agent of ["claude", "codex"]) {
    const st = states.find((s) => s.agent === agent);
    assert.equal(st.version, VERSION[agent]);
    assert.equal(st.kind, "current");
  }
  const store = join(home, ".local/share/com.reasonmachines.openconductor/agent-binaries");
  const bundledCodex = join(store, "codex", VERSION.codex, "codex");
  assert.equal(readFileSync(bundledCodex, "utf8"), codexBody, "the tar.gz member, unpacked");
  assert.equal(readFileSync(join(store, "codex", VERSION.codex, "codex-code-mode-host"), "utf8"), hostBody);
  const meta = JSON.parse(readFileSync(join(store, ".meta", `codex-${VERSION.codex}.json`), "utf8"));
  assert.deepEqual(Object.keys(meta), ["sha256", "size", "downloaded_at_unix_ms", "verified_mtime_unix_ms"]);
  assert.equal(meta.sha256, sha(codexBody));
  pass(`startup downloaded claude ${VERSION.claude} and codex ${VERSION.codex} (tar.gz members) with .meta sha256`);

  // 2. Status for the Settings › Agents Version row.
  const status = await invoke("agent_executable_status", { agent: "codex" });
  assert.equal(status.source, "bundled");
  assert.equal(status.path, bundledCodex);
  assert.equal(status.version, VERSION.codex);
  assert.equal(status.binary.state, "ready");
  const claudeStatus = await invoke("agent_executable_status", { agent: "claude" });
  assert.deepEqual([claudeStatus.source, claudeStatus.version], ["bundled", VERSION.claude]);
  pass("agent_executable_status: bundled, with the version and download state");

  // 3. "Use system Codex" reads the login shell's PATH.
  assert.equal(await invoke("agent_system_binary", { agent: "codex" }), join(loginOnly, "codex"));
  assert.equal(await invoke("codex_cli_path"), bundledCodex);
  pass("agent_system_binary finds the login-shell-only codex; chats still run the bundled one");

  // 4. A Codex chat runs the bundled copy.
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
  // ChatModelPicker renders nothing until getSettings() resolves, which can land after the chat text.
  await waitFor("the model picker chip", () => run("return !!document.querySelector(\"[data-testid='composer-model-button']\") || null;"));
  await run("document.querySelector(\"[data-testid='composer-model-button']\").click();");
  await waitFor("Codex in the model picker", () =>
    run("return [...document.querySelectorAll('.oc-model-menu .oc-model-item')].some((b) => b.textContent.trim() === 'Codex') || null;"),
  );
  await run("[...document.querySelectorAll('.oc-model-menu .oc-model-item')].find((b) => b.textContent.trim() === 'Codex').click();");
  await waitFor("Codex on the picker chip", () => run("return document.querySelector(\"[data-testid='composer-model-button']\")?.title === 'Codex' || null;"));
  await wd("POST", `/element/${await find(".composer textarea")}/value`, { text: "which codex is this" });
  await wd("POST", `/element/${await find(".composer button[type=submit]")}/click`, {});
  await waitFor("the reply", () => chatText().then((t) => t && t.includes("turn 1: which codex is this")));
  await screenshot("agent-binaries-1-codex-chat");
  assert.ok(launches().includes("codex-bundled"), `launches: ${launches()}`);
  assert.ok(!launches().includes("codex-system"), "PATH is only the fallback");
  pass("a Codex chat ran the bundled codex and got its reply");

  // 5. The Settings executable path overrides the bundled copy.
  const settings = await invoke("get_settings");
  await invoke("update_settings", { settings: { ...settings, codex_executable_path: custom } });
  const overridden = await invoke("agent_executable_status", { agent: "codex" });
  assert.deepEqual([overridden.source, overridden.path], ["custom", custom]);
  assert.equal(await invoke("codex_cli_path"), custom);
  pass("codex_executable_path overrides the bundled copy");
  console.log("agent-binaries e2e: all steps passed");
} catch (e) {
  await screenshot("agent-binaries-failure").catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  if (sessionUrl) await wd("DELETE", "").catch(() => {});
  driver.kill();
  await Promise.race([driverExited, sleep(3000)]);
}
