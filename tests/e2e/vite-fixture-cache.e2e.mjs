import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startViteFixture } from "./vite-fixture-server.mjs";

const configEvent = "openconductor-fixture-cache-config";
const pauseEvent = "openconductor-fixture-cache-paused";

async function fetchModule(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const source = await response.text();
  assert.equal(response.status, 200, `${url}: ${response.status} ${response.statusText}\n${source}`);
  return source;
}

async function optimizedGraph(fixture) {
  const entry = await fetchModule(fixture.base + "/entry.js");
  const advertised = [...entry.matchAll(/\bfrom\s*["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], fixture.base))
    .filter((url) => url.pathname.includes("/deps/") && url.searchParams.has("v"));
  assert.ok(advertised.length, `Entry advertises an optimized dependency:\n${entry}`);
  const graph = new Map();
  const pending = [...advertised];
  while (pending.length) {
    const url = pending.pop();
    if (graph.has(url.href)) continue;
    const source = await fetchModule(url);
    graph.set(url.href, source);
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      const dependency = new URL(match[1], url);
      if (dependency.pathname.includes("/deps/")) pending.push(dependency);
    }
  }
  return graph;
}

async function fetchPinnedGraph(graph, phase) {
  for (const href of graph.keys()) {
    const url = new URL(href);
    // Keep the advertised version, but bypass Vite's in-memory transform result.
    url.searchParams.set("cache-probe", phase);
    await fetchModule(url);
  }
}

async function exerciseCacheOwnership() {
  const cwd = process.cwd();
  const project = await mkdtemp(join(tmpdir(), "openconductor-cache-project-"));
  const phaseFile = join(project, "phase");
  const caches = new Map();
  const fixtures = [];
  let resumeOptimizer;
  let pauseTimer;
  const captureConfig = ({ phase, cacheDir }) => caches.set(phase, cacheDir);
  const paused = new Promise((resolve) => {
    process.once(pauseEvent, (resume) => { resumeOptimizer = resume; resolve(); });
  });
  process.on(configEvent, captureConfig);
  try {
    await mkdir(join(project, "node_modules", "fixture-cjs"), { recursive: true });
    await writeFile(join(project, "package.json"), JSON.stringify({ private: true, type: "module" }));
    await writeFile(join(project, "node_modules", "fixture-cjs", "package.json"), JSON.stringify({ name: "fixture-cjs", version: "1.0.0", main: "index.cjs" }));
    await writeFile(join(project, "node_modules", "fixture-cjs", "index.cjs"), "module.exports = { value: 'fixture-cache' };\n");
    await writeFile(join(project, "index.html"), '<script type="module" src="/entry.js"></script>\n');
    await writeFile(join(project, "entry.js"), 'import dependency from "fixture-cjs"; document.body.textContent = dependency.value;\n');
    await writeFile(join(project, "vite.config.mjs"), `
import { existsSync, readFileSync } from "node:fs";
const phase = readFileSync(${JSON.stringify(phaseFile)}, "utf8");
if (phase === "occupied") throw new Error("Occupied port reached Vite configuration");
let cacheDir;
export default {
  plugins: [{
    name: "observe-fixture-cache",
    configResolved(config) {
      cacheDir = config.cacheDir;
      process.emit(${JSON.stringify(configEvent)}, { phase, cacheDir });
      if (phase === "config-failed") throw new Error("Synthetic config failure");
    },
    closeBundle() {
      if (!existsSync(cacheDir)) throw new Error("Cache removed before Vite closed");
    },
  }],
  optimizeDeps: {
    include: ["fixture-cjs"],
    force: phase === "B",
    esbuildOptions: {
      plugins: [{
        name: "pause-real-optimizer",
        setup(build) {
          if (phase === "B" && (build.initialOptions.outdir ?? "").includes("deps_temp_")) {
            build.onStart(() => new Promise((resolve) => process.emit(${JSON.stringify(pauseEvent)}, resolve)));
          }
        },
      }],
    },
  },
};
`);
    process.chdir(project);
    await writeFile(phaseFile, "A");
    const a = await startViteFixture({ host: "127.0.0.1", port: 0 });
    fixtures.push(a);
    const graphA = await optimizedGraph(a);
    console.log(`A advertised graph fetched: ${graphA.size} modules`);

    await writeFile(phaseFile, "B");
    const b = await startViteFixture({ host: "127.0.0.1", port: 0 });
    fixtures.push(b);
    try {
      await Promise.race([paused, new Promise((_, reject) => {
        pauseTimer = setTimeout(() => reject(new Error("B optimizer did not reach its barrier")), 15_000);
      })]);
    } finally {
      clearTimeout(pauseTimer);
    }
    console.log("B real optimizer paused before commit");
    await assert.rejects(stat(join(caches.get("B"), "deps", "_metadata.json")), { code: "ENOENT" });
    await fetchPinnedGraph(graphA, "B-paused");
    assert.notEqual(caches.get("A"), caches.get("B"));
    assert.equal((await stat(caches.get("A"))).isDirectory(), true);
    assert.equal((await stat(caches.get("B"))).isDirectory(), true);
    resumeOptimizer();
    const graphB = await optimizedGraph(b);
    console.log(`A graph stayed fetchable during B optimization; B graph fetched: ${graphB.size} modules`);

    await b.close();
    await assert.rejects(stat(caches.get("B")), { code: "ENOENT" });
    await fetchPinnedGraph(graphA, "B-closed");
    console.log("B cache removed after close; A graph still fetchable");

    await writeFile(phaseFile, "occupied");
    const port = Number(new URL(a.base).port);
    await assert.rejects(startViteFixture({ host: "127.0.0.1", port }), { code: "EADDRINUSE" });
    assert.equal(caches.has("occupied"), false);
    await fetchPinnedGraph(graphA, "occupied-port");
    console.log("Occupied port rejected before Vite configuration; A graph still fetchable");

    await writeFile(phaseFile, "config-failed");
    await assert.rejects(startViteFixture({ host: "127.0.0.1", port: 0 }), /Synthetic config failure/);
    const failedCache = caches.get("config-failed");
    assert.ok(failedCache);
    assert.notEqual(failedCache, caches.get("A"));
    assert.notEqual(failedCache, caches.get("B"));
    await assert.rejects(stat(failedCache), { code: "ENOENT" });
    await fetchPinnedGraph(graphA, "config-failed");
    console.log("Config-failure startup cache removed; A graph still fetchable");

    await Promise.all([a.close(), a.close()]);
    await assert.rejects(stat(caches.get("A")), { code: "ENOENT" });
    const rebound = createServer();
    try {
      const listening = once(rebound, "listening");
      rebound.listen({ host: "127.0.0.1", port });
      await listening;
    } finally {
      if (rebound.listening) await new Promise((resolve, reject) => rebound.close((error) => error ? reject(error) : resolve()));
    }
    console.log("A cache removed after idempotent close; HTTP port rebound");
  } finally {
    clearTimeout(pauseTimer);
    resumeOptimizer?.();
    const closed = await Promise.allSettled(fixtures.map((fixture) => fixture.close()));
    process.removeListener(configEvent, captureConfig);
    process.removeAllListeners(pauseEvent);
    process.chdir(cwd);
    await rm(project, { recursive: true, force: true });
    const errors = closed.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Cache regression cleanup failed");
  }
}

if (process.argv.includes("--cache-scenario")) {
  await exerciseCacheOwnership();
} else {
  test("live Vite fixtures retain independent optimized graphs and clean up owned caches", { timeout: 60_000 }, async (t) => {
    try {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.url), "--cache-scenario"], { timeout: 55_000 });
      t.diagnostic(stdout.trim());
      if (stderr.trim()) t.diagnostic(stderr.trim());
    } catch (error) {
      t.diagnostic(error.stdout ?? "");
      t.diagnostic(error.stderr ?? "");
      throw error;
    }
  });
}
