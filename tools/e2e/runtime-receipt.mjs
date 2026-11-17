// Evidence only: never changes app settings, process ownership, signals or suite results.
// Linux /proc observations are limited to the driver's descendant tree and port 4444.
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function unavailable(error) {
  // Never serialize arbitrary exception text (it can contain command/env values).
  return { status: "unavailable", code: error?.code ?? "observation_failed" };
}

export function resolvedPath(path) {
  if (typeof path !== "string" || !path) return { status: "not_reported" };
  try { return { status: "observed", path: realpathSync(path) }; }
  catch (error) { return { ...unavailable(error), requestedPath: resolve(path) }; }
}

export function executableIdentity(app) {
  try {
    const path = realpathSync(app);
    const hash = createHash("sha256");
    const fd = openSync(app, "r");
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      for (let n; (n = readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, n));
      return { status: "observed", path, sha256: hash.digest("hex") };
    } finally { closeSync(fd); }
  } catch (error) { return unavailable(error); }
}

export function readProcess(procRoot, pid) {
  const stat = readFileSync(join(procRoot, String(pid), "stat"), "utf8");
  // comm can contain spaces and parentheses; fields after its LAST ')' are stable.
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  const link = (name) => { try { return readlinkSync(join(procRoot, String(pid), name)); } catch { return null; } };
  return { pid, ppid: Number(fields[1]), state: fields[0], startTicks: fields[19], executable: link("exe"), cwd: link("cwd") };
}

export function processSnapshot(driverPid, { procRoot = "/proc", port = 4444, appPath } = {}) {
  try {
    const processes = readdirSync(procRoot).filter((n) => /^\d+$/.test(n)).flatMap((n) => {
      try { return [readProcess(procRoot, Number(n))]; } catch { return []; }
    });
    const owned = new Set(driverPid ? [driverPid] : []);
    for (let changed = true; changed;) {
      changed = false;
      for (const p of processes) if (owned.has(p.ppid) && !owned.has(p.pid)) { owned.add(p.pid); changed = true; }
    }
    const tree = processes.filter((p) => owned.has(p.pid));
    const socketOwners = new Map();
    const databases = new Set();
    let fdComplete = true;
    for (const p of tree) {
      try {
        for (const fd of readdirSync(join(procRoot, String(p.pid), "fd"))) {
          let target;
          try { target = readlinkSync(join(procRoot, String(p.pid), "fd", fd)); } catch { continue; }
          const socket = /^socket:\[(\d+)\]$/.exec(target);
          if (socket) socketOwners.set(socket[1], p.pid);
          if ((appPath === undefined || p.executable === appPath) && ["conductor.db", "cache.db"].includes(basename(target))) databases.add(target);
        }
      } catch { fdComplete = false; }
    }
    const listeners = [];
    for (const table of ["tcp", "tcp6"]) {
      const lines = readFileSync(join(procRoot, "net", table), "utf8").trim().split("\n").slice(1);
      for (const line of lines) {
        const f = line.trim().split(/\s+/);
        if (f[3] !== "0A" || parseInt(f[1].split(":")[1], 16) !== port) continue;
        listeners.push({ table, addressHex: f[1], inode: f[9], ownerPid: socketOwners.get(f[9]) ?? null });
      }
    }
    return { status: "observed", tree, fdComplete, databases: [...databases].map(resolvedPath), port: { number: port, listeners, released: listeners.length === 0 } };
  } catch (error) { return unavailable(error); }
}

export function cleanupObservation(previous, current) {
  if (previous?.status !== "observed" || current?.status !== "observed") return { status: "unverified" };
  const survivors = previous.tree.filter((old) => current.tree.some((p) => p.pid === old.pid && p.startTicks === old.startTicks && !["Z", "X"].includes(p.state)));
  return {
    status: survivors.length || !current.port.released ? "failed" : "observed_clean",
    survivors: survivors.map(({ pid, startTicks }) => ({ pid, startTicks })),
    portReleased: current.port.released,
  };
}

// Only selected path fields leave the webview; never serialize settings, row
// payloads, URLs, argv, /proc/environ, or arbitrary provider errors.
export const ROOTS_SCRIPT = `
const done = arguments[arguments.length - 1];
const invoke = window.__TAURI_INTERNALS__.invoke;
(async () => {
  let configFile, projects, worktrees;
  try { configFile = { status: "reported_by_app", value: await invoke("settings_file_path") }; }
  catch { configFile = { status: "unavailable" }; }
  try {
    const repos = await invoke("list_repositories");
    projects = { status: "reported_by_app", value: repos.map((r) => r.root) };
    const rows = await Promise.all(repos.map((r) => invoke("list_workspaces", { repositoryId: r.id })));
    worktrees = { status: "reported_by_app", value: rows.flat().map((w) => w.path) };
  } catch { worktrees = { status: "unavailable" }; }
  done({ configFile, projects, worktrees });
})();`;

export function resolveAppRoots(reported) {
  const one = reported?.configFile;
  const paths = (field) => field?.status === "reported_by_app" && Array.isArray(field.value)
    ? { status: "reported_by_app", paths: field.value.map(resolvedPath) }
    : { status: "unavailable" };
  return {
    configFile: one?.status === "reported_by_app" ? resolvedPath(one.value) : { status: "unavailable" },
    configDirectory: one?.status === "reported_by_app" && typeof one.value === "string" ? resolvedPath(dirname(one.value)) : { status: "unavailable" },
    projects: paths(reported?.projects), worktrees: paths(reported?.worktrees),
  };
}

export function createRuntimeReceipt({ suite, app, out, home, project, procRoot = "/proc", cleanupTimeoutMs = 3000, sampleMs = 100 }) {
  mkdirSync(out, { recursive: true });
  const startedAt = Date.now();
  const identity = {
    schemaVersion: 1, suite, startedAt: new Date(startedAt).toISOString(), cleanupTimeoutMs,
    // Allowlisted CI identity only. No general environment capture.
    run: { id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null, job: process.env.GITHUB_JOB ?? null, testedSha: process.env.GITHUB_SHA ?? null },
    harnessPid: process.pid, executable: executableIdentity(app),
    launchRoots: { home: resolvedPath(home), project: resolvedPath(project) },
  };
  let driverPid;
  let beforeTeardown;
  let roots = { status: "not_observed" };
  const known = new Map();
  const save = (phase, data) => writeFileSync(join(out, `runtime-${phase}.json`), JSON.stringify({ ...identity, phase, observedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt, ...data }, null, 2) + "\n");
  const snapshot = () => {
    const state = processSnapshot(driverPid, { procRoot, appPath: identity.executable.path ?? "" });
    if (state.status === "observed") {
      for (const p of state.tree) known.set(`${p.pid}:${p.startTicks}`, p);
      // Descendants can be reparented after driver.kill(); explicitly check
      // every previously observed identity instead of trusting an empty tree.
      for (const p of known.values()) {
        if (state.tree.some((now) => now.pid === p.pid)) continue;
        try {
          const now = readProcess(procRoot, p.pid);
          if (now.startTicks === p.startTicks) state.tree.push(now);
        } catch (error) { if (error.code !== "ENOENT") state.status = "partial"; }
      }
    }
    return state;
  };
  save("before-launch", { processes: snapshot(), cleanup: { status: "not_started" } });
  let finished = false;
  const incomplete = () => {
    if (finished) return;
    try { save("after-teardown", { roots, processes: snapshot(), cleanup: { status: "missing_teardown" } }); } catch { /* no successful receipt can be claimed */ }
  };
  process.once("exit", incomplete);
  return {
    track(driver) { driverPid = driver.pid; },
    async beforeTeardown(executeAsync) {
      // Diagnostic errors cannot bypass the suite's existing teardown.
      try {
        roots = resolveAppRoots(await executeAsync(ROOTS_SCRIPT));
      } catch { roots = { status: "unavailable" }; }
      beforeTeardown = snapshot();
      if (beforeTeardown.status === "observed") {
        beforeTeardown.appExecutables = beforeTeardown.tree.filter((p) => p.executable === identity.executable.path)
          .map((p) => ({ pid: p.pid, ...executableIdentity(join(procRoot, String(p.pid), "exe")) }));
        roots.databases = { status: beforeTeardown.databases.length ? "observed_open_fds" : "not_observed", paths: beforeTeardown.databases };
        roots.appData = { status: roots.databases.status, paths: [...new Set(beforeTeardown.databases.filter((p) => p.status === "observed").map((p) => dirname(p.path)))].map(resolvedPath) };
      }
      try { save("before-teardown", { roots, processes: beforeTeardown }); } catch { console.error("runtime receipt: before-teardown write failed"); }
      return beforeTeardown;
    },
    async afterTeardown() {
      try {
        const deadline = Date.now() + cleanupTimeoutMs;
        let current, cleanup;
        do {
          current = snapshot();
          cleanup = driverPid ? cleanupObservation(beforeTeardown, current) : { status: "unverified" };
          if (cleanup.status !== "failed" || Date.now() >= deadline) break;
          await new Promise((r) => setTimeout(r, sampleMs));
        } while (true);
        save("after-teardown", { roots, processes: current, cleanup, suiteExitCode: process.exitCode ?? null });
        finished = true;
        process.removeListener("exit", incomplete);
      } catch { console.error("runtime receipt: after-teardown observation failed"); }
    },
  };
}
