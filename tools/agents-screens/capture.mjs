// Captures OpenConductor's Settings › Agents and Default models screens with
// REA capture-browser-scenario, using the viewport, locale, timezone and click
// steps of the Conductor references (tools/screens/shots/05-settings.json and
// 07-agents.json). Serves the Vite build through tools/sidebar-screens/server.mjs.
//
//   npm run build && TMPDIR=/tmp/t node tools/agents-screens/capture.mjs [name ...]
//
// Writes <OUT_DIR>/<name>.png (OUT_DIR defaults to .oc-tmp/agents-screens).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.env.OUT_DIR ?? path.join(repoRoot, ".oc-tmp/agents-screens"));
const PORT = Number(process.env.PORT ?? 4337);
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const only = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(path.join(here, "shots.json"), "utf8")).filter((s) => !only.length || only.includes(s.name));

const server = spawn(process.execPath, [path.join(repoRoot, "tools/sidebar-screens/server.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break; } catch {}
  await sleep(100);
}
fs.mkdirSync(outDir, { recursive: true });
const open = [
  { step_id: "open_settings", action: "click", locator: { kind: "role", role: "button", name: "Settings" }, timeout_ms: 5000 },
  { step_id: "pause", action: "wait_for_timeout", duration_ms: 800 },
];
let failures = 0;
for (const shot of shots) {
  const theme = shot.theme ?? "dark";
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://localhost:${PORT}/?oc_scenario=${shot.scenario ?? "populated"}&oc_theme=${theme}` },
    environment: { viewport: { width: shot.viewport?.width ?? 1440, height: shot.viewport?.height ?? 900, device_scale_factor: 1 }, color_scheme: theme, locale: "en-US", timezone: "UTC" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 1500 },
      ...open,
      ...(shot.actions ?? []),
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 800 },
    ],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(process.env.TMPDIR ?? "/tmp", `oc-agents-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
  const res = spawnSync(REA, ["capture-browser-scenario", inputFile, "--format", "json"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 120000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try { ev = JSON.parse(res.stdout); if (ev.error) throw new Error(JSON.stringify(ev.details ?? ev.message)); } catch (e) {
    console.error(`[${shot.name}] ${e instanceof Error ? e.message : ""}`);
    console.error(`[${shot.name}] REA failed (exit ${res.status}): ${(res.stderr || res.stdout || "").slice(0, 1500)}`);
    failures++; continue;
  }
  const steps = ev.normalized_result?.steps ?? [];
  const bad = steps.filter((s) => s.status && s.status !== "ok" && s.status !== "succeeded" && s.status !== "completed");
  if (bad.length) console.error(`[${shot.name}] steps not ok: ${bad.map((s) => `${s.step_id}:${s.status} ${JSON.stringify(s.error ?? "").slice(0, 300)}`).join(", ")}`);
  const art = [...steps].reverse().find((s) => s.artifacts?.screenshot)?.artifacts?.screenshot;
  const b64 = art?.value?.data_base64 ?? art?.artifact?.data_base64 ?? art?.data_base64;
  if (!b64) { console.error(`[${shot.name}] no screenshot: ${String(JSON.stringify(art)).slice(0, 400)}`); failures++; continue; }
  fs.writeFileSync(path.join(outDir, `${shot.name}.png`), Buffer.from(b64, "base64"));
  console.log(`[${shot.name}] ok evidence ${ev.evidence_id}`);
}
server.kill();
process.exit(failures ? 1 : 0);
