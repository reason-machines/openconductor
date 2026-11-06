// Side-by-side evidence for Help menu › Diagnostics, Submit a prompt and the
// Help menu itself: Conductor 0.87.6's extracted frontend (tools/screens
// harness, Tauri IPC mocked) and OpenConductor's built frontend (dist/, seeded
// like tools/sidebar-screens), both driven by REA capture-browser-scenario with
// the same viewport, theme, data and clicks. Every shell command answers empty
// with exit 0 on both sides, so a diagnostics run ends with every row done.
//
//   npm run build && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     node tools/side-by-side/help-diagnostics.mjs <out-dir> [state ...]
//
// Writes <out>/ref-<state>.png, <out>/oc-<state>.png and <out>/captures.json
// (REA Evidence ids, final URLs and the visible copy of each side). Compose with
// tools/side-by-side/compose_pair.py.
//
// VIEWPORT=1280x820 captures at the UI map's size. With UIMAP_RECORD=<file>
// (parity/ui-map/side-by-side.json) each pair is also scored with REA
// compare-web-screenshots at channel thresholds 0 and 24 and recorded under its
// UI map state id, for tools/ui-map/build_map.py (see tools/ui-map/README.md).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const [outArg = ".oc-tmp/help-diagnostics", ...only] = process.argv[2] === "--serve-oc" ? [] : process.argv.slice(2);
const out = path.resolve(outArg);
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4337);
const OC_PORT = Number(process.env.OC_PORT ?? 4338);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const [vw, vh] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);
const VIEWPORT = { width: vw, height: vh };
const RECORD = process.env.UIMAP_RECORD ? path.resolve(process.env.UIMAP_RECORD) : null;
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const css = (selector) => ({ kind: "css", selector });
// Conductor's help trigger has no label: it is the button just before Settings in the footer.
const REF_HELP = css("xpath=//button[@aria-label='Settings']/preceding::button[1]");
const OC_HELP = css(".sb-help > .sb-footer-btn");
const item = (label) => css(`[role=menuitem] >> text=${label}`);

/**
 * Per state: the clicks on each side (REA actions without step ids), how long to settle
 * after, its UI map state id and its committed side-by-side image (parity/side-by-side/).
 */
const HELP_STATES = {
  "help-menu": { ref: [REF_HELP], oc: [OC_HELP], uiMap: "menu-help", image: "dialogs-menus-01-help-menu.png" },
  "submit-prompt": { ref: [REF_HELP, item("Submit a prompt")], oc: [OC_HELP, item("Submit a prompt")], uiMap: "dialog-submit-prompt", image: "dialogs-menus-02-submit-prompt.png" },
  diagnostics: { ref: [REF_HELP, item("Diagnostics")], oc: [OC_HELP, item("Diagnostics")], uiMap: "route-diagnostics", image: "dialogs-menus-03-diagnostics.png" },
  "diagnostics-run": {
    ref: [REF_HELP, item("Diagnostics"), css("text=Run environment diagnostics")],
    oc: [OC_HELP, item("Diagnostics"), css("text=Run environment diagnostics")],
    settle: 4000,
    uiMap: "diagnostics-run",
    image: "dialogs-menus-04-diagnostics-run.png",
  },
};

// SBS_STATES=<module> swaps in another set of states with the same shape (its default export,
// built from the `css` helper it is given), e.g. tools/side-by-side/create-composer-states.mjs.
const STATES = process.env.SBS_STATES
  ? (await import(path.resolve(process.env.SBS_STATES))).default({ css })
  : HELP_STATES;

// OpenConductor: dist/ with the sidebar-screens seed, Home (not All workspaces)
// selected like Conductor's "/", and a Tauri shell that answers every command empty.
const ocSeed = fs.readFileSync(path.join(repoRoot, "tools/sidebar-screens/seed.js"), "utf8");
const ocExtra = `(function () {
  const raw = localStorage.getItem("openconductor.shell.v1");
  if (raw) { const s = JSON.parse(raw); s.selection = { kind: "root" }; localStorage.setItem("openconductor.shell.v1", JSON.stringify(s)); }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 0,
    async invoke(cmd) {
      if (cmd === "execute_shell_command_cancellable" || cmd === "execute_shell_command") return { stdout: "", stderr: "", exitCode: 0, signal: null, cancelled: false, truncated: false };
      throw new Error("not mocked: " + cmd);
    },
  };
})();`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  http
    .createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__health") return res.end("ok");
      let file = path.join(DIST_OC, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST_OC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_OC, "index.html");
      let body = fs.readFileSync(file);
      if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${ocSeed}</script><script>${ocExtra}</script>`);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    })
    .listen(OC_PORT);
}
// REA runs synchronously below, so each page server is its own process.
if (process.argv[2] === "--serve-oc") {
  serveOc();
} else {
await main();
}

async function main() {
const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { env: process.env, stdio: ["ignore", "ignore", "inherit"] });
const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
  env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "help-diag-ipc") },
  stdio: ["ignore", "ignore", "inherit"],
});
for (const port of [REF_PORT, OC_PORT]) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/__health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Text nodes and labels of the captured DOM, the way tools/ui-map/capture_ref.mjs reads them. */
function visibleText(html) {
  const body = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ");
  const texts = [];
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    if (t) texts.push(t);
  }
  const labels = [...body.matchAll(/\s(?:aria-label|title|placeholder)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
  return { texts, labels };
}

const pngArtifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });

/** REA compare-web-screenshots at channel thresholds 0 and 24, like tools/ui-map/compare.mjs. */
function compare(name, a, b) {
  const fa = path.join(tmp, `help-diag-a-${name}.json`);
  const fb = path.join(tmp, `help-diag-b-${name}.json`);
  fs.writeFileSync(fa, JSON.stringify(pngArtifact(a)));
  fs.writeFileSync(fb, JSON.stringify(pngArtifact(b)));
  const res = {};
  for (const t of [0, 24]) {
    const p = spawnSync(REA, ["compare-web-screenshots", fa, fb, "--channel-threshold", String(t), "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    const j = JSON.parse(p.stdout);
    const nr = j.normalized_result ?? j;
    res[`t${t}`] = { evidence_id: j.evidence_id ?? null, changed_pixels: nr.changed_pixels ?? null, total_pixels: nr.total_pixels ?? null, changed_ratio: nr.changed_ratio ?? null };
  }
  return res;
}

function capture(name, url, clicks, settle) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 }];
  clicks.forEach((locator, i) => {
    actions.push({ step_id: `c${i}`, action: "click", locator, timeout_ms: 5000 });
    actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 600 });
  });
  actions.push({ step_id: "final", action: "wait_for_timeout", duration_ms: settle ?? 800 });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] },
  };
  const file = path.join(tmp, `help-diag-${name}.json`);
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
  const dom = art.dom?.value?.html ?? art.dom?.value?.content ?? art.dom?.value ?? "";
  return { png, evidence_id: ev.evidence_id, png_sha256: sha256(png), final_url: art.url?.value?.url ?? art.url?.value ?? null, dom: visibleText(typeof dom === "string" ? dom : JSON.stringify(dom)) };
}

fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, "captures.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const record = RECORD && fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : { states: {} };
const laneCaptures = JSON.parse(fs.readFileSync(path.join(repoRoot, "parity/ui-map/oc-captures.json"), "utf8"));
const head = spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() || null;
let failures = 0;
try {
  for (const [state, spec] of Object.entries(STATES)) {
    if (only.length && !only.includes(state)) continue;
    const q = "oc_scenario=populated&oc_theme=dark";
    try {
      const { png: refPng, ...ref } = capture(`ref-${state}`, `http://conductor.localhost:${REF_PORT}/?${q}`, spec.ref, spec.settle);
      const { png: ocPng, ...oc } = capture(`oc-${state}`, `http://localhost:${OC_PORT}/?${q}`, spec.oc, spec.settle);
      manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref, oc };
      let line = `${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id}`;
      if (RECORD && spec.uiMap) {
        const cmp = compare(state, refPng, ocPng);
        record.states[spec.uiMap] = {
          lane: `tools/side-by-side/help-diagnostics.mjs${process.env.SBS_STATES ? ` (SBS_STATES=${path.relative(repoRoot, path.resolve(process.env.SBS_STATES))})` : ""}: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, Tauri IPC mocked) in Chromium`,
          openconductor_commit: head,
          viewport: VIEWPORT,
          image: `side-by-side/${spec.image}`,
          // The UI map's own OpenConductor capture this record replaces; once that lane captures the state again, its capture wins.
          supersedes_oc_png_sha256: laneCaptures[spec.uiMap]?.png_sha256 ?? null,
          reference: { evidence_id: ref.evidence_id, png_sha256: ref.png_sha256, final_url: ref.final_url, dom: ref.dom },
          openconductor: { evidence_id: oc.evidence_id, png_sha256: oc.png_sha256, dom: oc.dom },
          compare: cmp,
        };
        line += ` | t24 ${(cmp.t24.changed_ratio * 100).toFixed(1)}%`;
      }
      console.log(line);
    } catch (e) {
      failures++;
      console.error(String(e));
    }
  }
} finally {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
  if (RECORD) fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
  refServer.kill();
  ocServer.kill();
}
process.exit(failures ? 1 : 0);
}
