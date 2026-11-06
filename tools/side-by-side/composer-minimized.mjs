// Side-by-side evidence for the minimized chat composer on a file diff (UI map
// state diff-unified): Conductor 0.87.6's extracted frontend (tools/screens
// harness, Tauri IPC mocked) and OpenConductor's built frontend (dist/, with
// tests/e2e/right-panel-fixture.mjs's fake backend), both driven by REA
// capture-browser-scenario at the UI map's size (1280x820, dark).
//
//   npm run build && (cd tools/screens && npm ci) && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     node tools/side-by-side/composer-minimized.mjs <out-dir>
//
// Writes <out>/ref-diff-unified.png, <out>/oc-diff-unified.png and
// <out>/captures.json (REA Evidence ids). Compose with tools/side-by-side/pair.py.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, SHELL, fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4347);
const OC_PORT = Number(process.env.OC_PORT ?? 4348);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const VIEWPORT = { width: 1280, height: 820 };
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const css = (selector) => ({ kind: "css", selector });

// The same clicks as tools/ui-map/states.json's diff-unified, then the pointer parked on the empty title bar.
const REF = [css("text=tide-web"), css("text=Ada/fix login redirect"), css("text=auth.ts >> nth=-1")];
const OC = [css("button.oc-change[title='Open src/lib/auth.ts']")];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  const init = `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES })});`;
  http
    .createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__health") return res.end("ok");
      let file = path.join(DIST_OC, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST_OC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_OC, "index.html");
      let body = fs.readFileSync(file);
      if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${init}</script>`);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    })
    .listen(OC_PORT);
}

function capture(out, name, url, clicks) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 }];
  clicks.forEach((locator, i) => {
    actions.push({ step_id: `c${i}`, action: "click", locator, timeout_ms: 5000 });
    actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 1500 });
  });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const file = path.join(tmp, `composer-min-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try {
    ev = JSON.parse(res.stdout);
  } catch {
    throw new Error(`${name}: ${(res.stderr || res.stdout || `exit ${res.status}`).slice(0, 400)}`);
  }
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
  if (art.screenshot?.state !== "captured") throw new Error(`${name}: screenshot ${art.screenshot?.state} ${JSON.stringify(ev.normalized_result?.issues ?? ev.issues ?? "").slice(0, 400)}`);
  const png = Buffer.from(art.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${name}.png`), png);
  return { evidence_id: ev.evidence_id, png_sha256: sha256(png), final_url: art.url?.value?.url ?? art.url?.value ?? null };
}

if (process.argv[2] === "--serve-oc") {
  serveOc();
} else {
  const out = path.resolve(process.argv[2] ?? ".oc-tmp/composer-minimized");
  fs.mkdirSync(out, { recursive: true });
  // REA runs synchronously, so each page server is its own process.
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "composer-min-ipc") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  try {
    for (const port of [REF_PORT, OC_PORT]) {
      for (let i = 0; i < 50; i++) {
        try {
          if ((await fetch(`http://localhost:${port}/__health`)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const q = "oc_scenario=populated&oc_theme=dark";
    const ref = capture(out, "ref-diff-unified", `http://conductor.localhost:${REF_PORT}/?${q}`, REF);
    const oc = capture(out, "oc-diff-unified", `http://localhost:${OC_PORT}/`, OC);
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify({ tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref, oc }, null, 1) + "\n");
    console.log(`ref ${ref.evidence_id} | oc ${oc.evidence_id}`);
  } finally {
    refServer.kill();
    ocServer.kill();
  }
}
