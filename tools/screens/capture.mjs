// Runs REA capture-browser-scenario for each shot in a shots file and writes
// evidence/screens/<name>.png plus evidence/screens/manifest.json entries.
//
//   TMPDIR=/tmp/t node capture.mjs shots/onboarding.json [only-this-name ...]
//
// Shot fields: name, path (SPA route), scenario (fixture set), theme
// ("dark" | "light"), actions (REA actions after the page settles), settle_ms,
// viewport {width,height}, notes.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.env.OUT_DIR ?? path.join(repoRoot, "evidence/screens"));
const PORT = Number(process.env.PORT ?? 4317);
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
// Default host is conductor.localhost (loopback in Chromium). Virtuoso Message
// List, bundled in Conductor, treats "localhost" as a dev environment and
// replaces the chat transcript with an expired-license banner; shots can set
// host: "localhost" to show that state.
const HOST = process.env.HOST_NAME ?? "conductor.localhost";
const LOG_DIR = process.env.LOG_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "oc-ipc-logs");
const REA_VERSION = spawnSync(REA, ["--version"], { encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } }).stdout?.trim().split("\n").pop() || "unknown";

const [shotsFile, ...only] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(path.resolve(shotsFile), "utf8")).filter(
  (s) => only.length === 0 || only.includes(s.name),
);

const server = spawn(process.execPath, [path.join(here, "server.mjs")], {
  env: { ...process.env, PORT: String(PORT), LOG_DIR },
  stdio: "inherit",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
  } catch {}
  await sleep(100);
}

const manifestPath = path.join(outDir, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
fs.mkdirSync(outDir, { recursive: true });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
let failures = 0;

for (const shot of shots) {
  const theme = shot.theme ?? "dark";
  const query = new URLSearchParams({ oc_scenario: shot.scenario ?? "signed-in", oc_theme: theme });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://${shot.host ?? HOST}:${PORT}${shot.path ?? "/"}?${query}` },
    environment: {
      viewport: { width: shot.viewport?.width ?? 1440, height: shot.viewport?.height ?? 900, device_scale_factor: 1 },
      color_scheme: theme,
      locale: "en-US",
      timezone: "UTC",
    },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: shot.settle_ms ?? 5000 },
      ...(shot.actions ?? []),
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: shot.final_settle_ms ?? 800 },
    ],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(process.env.TMPDIR ?? "/tmp", `rea-shot-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
  const res = spawnSync(REA, ["capture-browser-scenario", inputFile, "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  let evidence;
  try {
    evidence = JSON.parse(res.stdout);
  } catch {
    console.error(`[${shot.name}] REA failed (exit ${res.status}):\n${(res.stderr || res.stdout).slice(0, 2000)}`);
    failures++;
    continue;
  }
  const steps = evidence.normalized_result?.steps ?? [];
  const shotArtifact = steps.at(-1)?.artifacts?.screenshot;
  const b64 = shotArtifact?.artifact?.data_base64 ?? shotArtifact?.data_base64 ?? findBase64(shotArtifact);
  if (!b64) {
    console.error(`[${shot.name}] no screenshot in evidence: ${JSON.stringify(shotArtifact).slice(0, 500)}`);
    failures++;
    continue;
  }
  const png = Buffer.from(b64, "base64");
  fs.writeFileSync(path.join(outDir, `${shot.name}.png`), png);
  const events = JSON.stringify(evidence.normalized_result?.events ?? evidence.normalized_result ?? {});
  manifest[shot.name] = {
    file: `${shot.name}.png`,
    route: shot.path ?? "/",
    host: shot.host ?? HOST,
    scenario: shot.scenario ?? "signed-in",
    theme,
    viewport: input.environment.viewport,
    actions: (shot.actions ?? []).map((a) => a.step_id),
    notes: shot.notes ?? "",
    png_sha256: sha256(png),
    rea: {
      tool: "capture_browser_scenario",
      command: `rea capture-browser-scenario <input.json> --format json`,
      rea_version: `rea-agents ${REA_VERSION}`,
      evidence_id: evidence.evidence_id,
      scenario_sha256: evidence.parameters?.scenario_sha256,
      browser: `${evidence.normalized_result?.browser?.product} ${evidence.normalized_result?.browser?.version}`,
    },
    page_errors: (events.match(/"page-error/g) || []).length,
  };
  console.log(`[${shot.name}] ok ${png.length} bytes ${manifest[shot.name].png_sha256.slice(0, 12)}`);
  if (process.env.KEEP_EVIDENCE) fs.writeFileSync(path.join(LOG_DIR, `evidence-${shot.name}.json`), res.stdout);
}

function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 2) + "\n");
server.kill();
process.exit(failures ? 1 : 0);
