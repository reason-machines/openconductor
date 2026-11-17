import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, unlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";
import { createRuntimeReceipt, executableIdentity, processSnapshot, cleanupObservation, resolvedPath, resolveAppRoots, ROOTS_SCRIPT } from "./runtime-receipt.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "oc-receipt-test-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const procRoot = join(root, "proc");
  mkdirSync(join(procRoot, "net"), { recursive: true });
  const ports = (listening = false) => {
    writeFileSync(join(procRoot, "net/tcp"), "header\n" + (listening ? "0: 0100007F:115C 00000000:0000 0A 0:0 0:0 0 1000 0 9876\n" : ""));
    writeFileSync(join(procRoot, "net/tcp6"), "header\n");
  };
  ports();
  const process = (pid, ppid, start = "100", state = "S") => {
    const dir = join(procRoot, String(pid));
    mkdirSync(join(dir, "fd"), { recursive: true });
    const fields = Array(20).fill("0");
    fields[0] = state; fields[1] = String(ppid); fields[19] = start;
    writeFileSync(join(dir, "stat"), `${pid} (name with ) spaces) ${fields.join(" ")}\n`);
    for (const name of ["exe", "cwd"]) {
      try { unlinkSync(join(dir, name)); } catch {}
      symlinkSync(root, join(dir, name));
    }
  };
  const app = join(root, "app"); writeFileSync(app, "self-contained binary fixture\n");
  return { root, procRoot, ports, process, app, out: join(root, "out"), home: root, project: root };
}

function record(f, phase) { return JSON.parse(readFileSync(join(f.out, `runtime-${phase}.json`))); }

test("hashes exact executable bytes and canonicalizes symlinked roots without inventing absent paths", (t) => {
  const f = fixture(t);
  const alias = join(f.root, "alias"); symlinkSync(f.app, alias);
  assert.deepEqual(executableIdentity(alias), { status: "observed", path: f.app, sha256: createHash("sha256").update(readFileSync(f.app)).digest("hex") });
  assert.equal(resolvedPath(join(f.root, "missing")).status, "unavailable");
  assert.equal(executableIdentity(join(f.root, "missing")).status, "unavailable");
  assert.equal(resolvedPath().status, "not_reported");
});

test("observes owned listener, descendants, and actual open database path; no argv/env capture", (t) => {
  const f = fixture(t);
  f.process(100, 1); f.process(101, 100); f.process(900, 1);
  symlinkSync("socket:[9876]", join(f.procRoot, "100/fd/3"));
  const db = join(f.root, "conductor.db"); writeFileSync(db, "");
  symlinkSync(db, join(f.procRoot, "101/fd/4"));
  writeFileSync(join(f.procRoot, "101/environ"), "API_KEY=DO_NOT_RECORD");
  writeFileSync(join(f.procRoot, "101/cmdline"), "--password=DO_NOT_RECORD");
  f.ports(true);
  const s = processSnapshot(100, f);
  assert.equal(s.status, "observed");
  assert.deepEqual(s.tree.map((p) => p.pid), [100, 101]);
  assert.equal(s.tree[0].startTicks, "100");
  assert.equal(s.port.listeners[0].ownerPid, 100);
  assert.equal(s.port.released, false);
  assert.deepEqual(s.databases, [{ status: "observed", path: db }]);
  assert.doesNotMatch(JSON.stringify(s), /DO_NOT_RECORD|API_KEY|password|900/);
});

test("a listener outside the driver tree has unknown ownership, never clearance", (t) => {
  const f = fixture(t); f.process(100, 1); f.ports(true);
  const s = processSnapshot(100, f);
  assert.equal(s.port.listeners[0].ownerPid, null);
  assert.equal(cleanupObservation(s, s).status, "failed");
});

test("missing proc data is unavailable, not an empty/released port", (t) => {
  const f = fixture(t); unlinkSync(join(f.procRoot, "net/tcp"));
  const s = processSnapshot(100, f);
  assert.equal(s.status, "unavailable");
  assert.equal(cleanupObservation(s, s).status, "unverified");
});

test("cleanup distinguishes live survivors, zombies, PID reuse, and port release", (t) => {
  const f = fixture(t); f.process(100, 1); f.ports(true);
  const before = processSnapshot(100, f);
  assert.equal(cleanupObservation(before, before).status, "failed");
  f.process(100, 1, "100", "Z"); f.ports();
  assert.equal(cleanupObservation(before, processSnapshot(100, f)).status, "observed_clean");
  f.process(100, 1, "200");
  assert.equal(cleanupObservation(before, processSnapshot(100, f)).status, "observed_clean");
});

test("records before launch, app-reported roots and observed post-teardown cleanup", async (t) => {
  const f = fixture(t); f.process(100, 1); f.process(101, 100);
  const config = join(f.root, "settings.toml"); writeFileSync(config, "secret = 'DO_NOT_RECORD'\n");
  const db = join(f.root, "conductor.db"); writeFileSync(db, "");
  symlinkSync(db, join(f.procRoot, "101/fd/4"));
  const receipt = createRuntimeReceipt({ suite: "fixture", ...f, cleanupTimeoutMs: 0 });
  assert.equal(record(f, "before-launch").cleanup.status, "not_started");
  receipt.track({ pid: 100 });
  await receipt.beforeTeardown(async () => ({
    configFile: { status: "reported_by_app", value: config },
    projects: { status: "reported_by_app", value: [f.root] },
    worktrees: { status: "reported_by_app", value: [f.root] },
    credentials: "DO_NOT_RECORD",
  }));
  rmSync(join(f.procRoot, "100"), { recursive: true });
  rmSync(join(f.procRoot, "101"), { recursive: true });
  await receipt.afterTeardown();
  const after = record(f, "after-teardown");
  assert.equal(after.cleanup.status, "observed_clean");
  assert.equal(after.roots.configDirectory.path, f.root);
  assert.equal(after.roots.databases.paths[0].path, db);
  assert.equal(after.roots.appData.paths[0].path, dirname(db));
  assert.equal(after.roots.worktrees.paths[0].path, f.root);
  assert.equal(after.suiteExitCode, null, "unset exitCode is not proof the suite passed");
  assert.doesNotMatch(JSON.stringify(after), /DO_NOT_RECORD|credentials/);
});

test("reparented children remain failed cleanup after the driver exits", async (t) => {
  const f = fixture(t); f.process(100, 1); f.process(101, 100);
  const receipt = createRuntimeReceipt({ suite: "survivor", ...f, cleanupTimeoutMs: 0 });
  receipt.track({ pid: 100 });
  await receipt.beforeTeardown(async () => { throw new Error("DO_NOT_RECORD"); });
  rmSync(join(f.procRoot, "100"), { recursive: true }); f.process(101, 1);
  await receipt.afterTeardown();
  const after = record(f, "after-teardown");
  assert.equal(after.cleanup.status, "failed");
  assert.deepEqual(after.cleanup.survivors.map((p) => p.pid), [101]);
  assert.equal(after.roots.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(after), /DO_NOT_RECORD/);
});

test("missing before-teardown observation stays unverified", async (t) => {
  const f = fixture(t);
  const receipt = createRuntimeReceipt({ suite: "incomplete", ...f, cleanupTimeoutMs: 0 });
  await receipt.afterTeardown();
  assert.equal(record(f, "after-teardown").cleanup.status, "unverified");
});

test("early harness exit emits missing_teardown, preserving the original suite exit code", (t) => {
  const f = fixture(t);
  const code = `import {createRuntimeReceipt} from ${JSON.stringify(new URL("./runtime-receipt.mjs", import.meta.url).href)};
    createRuntimeReceipt(${JSON.stringify({ suite: "exit", ...f })}); process.exitCode=7;`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", code]);
  assert.equal(child.status, 7);
  assert.equal(record(f, "after-teardown").cleanup.status, "missing_teardown");
});

test("app root query returns only allowlisted paths, not repository metadata/settings", async () => {
  const commands = [];
  const roots = await new Promise((done) => {
    const window = { __TAURI_INTERNALS__: { invoke: async (cmd) => {
      commands.push(cmd);
      if (cmd === "settings_file_path") return "/tmp/config/settings.toml";
      if (cmd === "list_repositories") return [{ id: "repo", root: "/tmp/project", remote: "SECRET_URL" }];
      return [{ path: "/tmp/worktree", secret: "DO_NOT_RECORD" }];
    } } };
    new Function("window", ROOTS_SCRIPT)(window, done);
  });
  assert.deepEqual(commands, ["settings_file_path", "list_repositories", "list_workspaces"]);
  assert.deepEqual(roots.worktrees.value, ["/tmp/worktree"]);
  assert.doesNotMatch(JSON.stringify(roots), /SECRET_URL|DO_NOT_RECORD/);
  assert.equal(resolveAppRoots({}).configFile.status, "unavailable");
});

test("WebDriver async receipt transport sends only the script and arguments", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ value: { configFile: { status: "unavailable" } } }) };
  };
  const wd = new WebDriver(); wd.sessionId = "fixture";
  await wd.executeAsync(ROOTS_SCRIPT, [], 3000);
  assert.equal(calls[0].url, "http://127.0.0.1:4444/session/fixture/execute/async");
  assert.deepEqual(calls[0].body, { script: ROOTS_SCRIPT, args: [] });
});

test("every hosted built-app suite emits receipts and both jobs upload them even on failure", () => {
  const repo = new URL("../../", import.meta.url);
  const workflow = readFileSync(new URL(".github/workflows/e2e.yml", repo), "utf8");
  const suites = [...new Set([...workflow.matchAll(/node ((?:tools|tests)\/e2e\/[\w.-]+\.mjs)(?: src-tauri\/target\/debug\/openconductor|\s*$)/gm)].map((m) => m[1]))];
  assert.equal(suites.length, 10);
  for (const suite of suites) {
    const source = readFileSync(new URL(suite, repo), "utf8");
    assert.match(source, /createRuntimeReceipt\(/, suite);
    assert.match(source, /receipt\.track\(driver\)/, suite);
    assert.match(source, /await receipt\.beforeTeardown\(/, suite);
    assert.match(source, /await receipt\.afterTeardown\(\)/, suite);
    assert.ok(source.indexOf("createRuntimeReceipt({") < source.indexOf("const driver = spawn"), suite);
  }
  assert.equal((workflow.match(/name: Upload per-suite runtime receipts\n        if: always\(\)/g) ?? []).length, 2);
  assert.match(workflow, /transcript-parity\/runtime-\*\.json/);
  assert.match(workflow, /slash-menu\/runtime-\*\.json/);
});
