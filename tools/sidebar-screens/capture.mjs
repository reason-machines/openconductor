// Captures OpenConductor's sidebar screens with REA capture-browser-scenario,
// using the same viewport, locale, timezone and click steps as the Conductor
// references in evidence/screens (see tools/screens/shots/02-workspace-chat.json).
//
//   npm run build && TMPDIR=/tmp/t node tools/sidebar-screens/capture.mjs [name ...]
//
// Writes <OUT_DIR>/<name>.png and <OUT_DIR>/<name>.evidence.json (REA Evidence,
// screenshot artifact kept for compare.mjs). OUT_DIR defaults to
// <repo>/.oc-tmp/sidebar-screens (git-excluded scratch).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.env.OUT_DIR ?? path.join(repoRoot, ".oc-tmp/sidebar-screens"));
const PORT = Number(process.env.PORT ?? 4327);
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const only = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(path.join(here, "shots.json"), "utf8")).filter((s) => !only.length || only.includes(s.name));

const server = spawn(process.execPath, [path.join(here, "server.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break; } catch {}
  await sleep(100);
}
fs.mkdirSync(outDir, { recursive: true });
let failures = 0;
for (const shot of shots) {
  const theme = shot.theme ?? "dark";
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://localhost:${PORT}/?oc_scenario=${shot.scenario}&oc_theme=${theme}` },
    environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: theme, locale: "en-US", timezone: "UTC" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: shot.settle_ms ?? 1500 },
      ...(shot.actions ?? []),
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 800 },
    ],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(process.env.TMPDIR ?? "/tmp", `oc-sidebar-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
  const res = spawnSync(REA, ["capture-browser-scenario", inputFile, "--format", "json"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try { ev = JSON.parse(res.stdout); } catch {
    console.error(`[${shot.name}] REA failed (exit ${res.status}): ${(res.stderr || res.stdout).slice(0, 1500)}`);
    failures++; continue;
  }
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot;
  const b64 = art?.value?.data_base64 ?? art?.artifact?.data_base64 ?? art?.data_base64;
  if (!b64) { console.error(`[${shot.name}] no screenshot: ${JSON.stringify(art).slice(0, 400)}`); failures++; continue; }
  fs.writeFileSync(path.join(outDir, `${shot.name}.png`), Buffer.from(b64, "base64"));
  fs.writeFileSync(path.join(outDir, `${shot.name}.evidence.json`), res.stdout);
  console.log(`[${shot.name}] ok evidence ${ev.evidence_id}`);
}
server.kill();
process.exit(failures ? 1 : 0);
