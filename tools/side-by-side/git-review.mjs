// Side-by-side evidence for the git-review surfaces of the UI map (diff tab,
// Changes panel, Create from picker): Conductor 0.87.6's extracted frontend
// (tools/screens harness, Tauri IPC mocked) and OpenConductor's built frontend
// (dist/, seeded like tools/sidebar-screens, with a fake Tauri backend that
// serves the reference's lisbon diff from tools/screens/seed-data.js), both
// driven by REA capture-browser-scenario at the UI map's size (1280x820, dark).
//
//   npm run build && (cd tools/screens && npm ci) && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     node tools/side-by-side/git-review.mjs <out-dir> [state ...]
//
// Writes <out>/ref-<state>.png, <out>/oc-<state>.png and <out>/captures.json
// (REA Evidence ids, final URLs and the visible copy of each side). With
// UIMAP_RECORD=parity/ui-map/side-by-side.json each pair is also scored with
// REA compare-web-screenshots at channel thresholds 0 and 24 and recorded under
// its UI map state id for tools/ui-map/build_map.py (tools/ui-map/README.md).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4367);
const OC_PORT = Number(process.env.OC_PORT ?? 4368);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const VIEWPORT = { width: 1280, height: 820 };
const RECORD = process.env.UIMAP_RECORD ? path.resolve(process.env.UIMAP_RECORD) : null;
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const click = (selector) => ({ click: selector });
const fill = (selector, value) => ({ fill: [selector, value] });

// Conductor: open lisbon's "Ada/fix login redirect" chat, then auth.ts from the Changes list.
const REF_LISBON = [click("text=tide-web"), click("text=Ada/fix login redirect")];
const REF_AUTH = [...REF_LISBON, click("text=auth.ts >> nth=-1")];
// OpenConductor: the seed selects lisbon; its Changes list names files by path.
const OC_AUTH = [click("button.oc-change[title='Open src/lib/auth.ts']")];
// The Create composer from the sidebar, then its "Create from" trigger.
const REF_CREATE_FROM = [click("text=Create >> nth=0"), click("[aria-label='Create from']")];
const OC_CREATE_FROM = [click(".sb-primary .sb-row >> text=Create"), click("[aria-label='Create from']")];

/**
 * Per state: the steps on each side, its UI map state id (tools/ui-map/gen_states.py)
 * and its committed side-by-side image (parity/side-by-side/).
 */
const STATES = {
  "diff-unified": { ref: REF_AUTH, oc: OC_AUTH, image: "git-review-01-diff-unified.png" },
  "diff-split": { ref: [...REF_AUTH, click("role=button[name='Split view']")], oc: [...OC_AUTH, click("role=button[name='Split view']")], image: "git-review-02-diff-split.png" },
  "diff-entire-file": { ref: [...REF_AUTH, click("role=button[name='Entire file']")], oc: [...OC_AUTH, click("role=button[name='Entire file']")], image: "git-review-03-diff-entire-file.png" },
  "create-from-prs": { ref: REF_CREATE_FROM, oc: OC_CREATE_FROM, image: "git-review-04-create-from-prs.png" },
  "create-from-branches": {
    ref: [...REF_CREATE_FROM, click("[role=tab] >> text=Branches")],
    oc: [...OC_CREATE_FROM, click("[role=tab] >> text=Branches")],
    image: "git-review-05-create-from-branches.png",
  },
};

// ---------- OpenConductor page: the sidebar-screens seed plus a fake backend with the reference's diff.
const ocSeed = fs.readFileSync(path.join(repoRoot, "tools/sidebar-screens/seed.js"), "utf8");
// Before/after of the two files Conductor's harness changes in lisbon (tools/screens/seed-data.js).
const ocBackend = fs.readFileSync(path.join(here, "git-review-backend.js"), "utf8");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  http
    .createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__health") return res.end("ok");
      let file = path.join(DIST_OC, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST_OC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_OC, "index.html");
      let body = fs.readFileSync(file);
      if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${ocSeed}</script><script>${ocBackend}</script>`);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    })
    .listen(OC_PORT);
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
  const fa = path.join(tmp, `git-review-a-${name}.json`);
  const fb = path.join(tmp, `git-review-b-${name}.json`);
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

function capture(out, name, url, steps) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 }];
  steps.forEach((s, i) => {
    if (s.click) actions.push({ step_id: `c${i}`, action: "click", locator: { kind: "css", selector: s.click }, timeout_ms: 5000 });
    // REA's fill takes its value as {source, value} (REA-GAPS.md #35).
    if (s.fill) actions.push({ step_id: `f${i}`, action: "fill", locator: { kind: "css", selector: s.fill[0] }, value: { source: "literal", value: s.fill[1] }, timeout_ms: 5000 });
    actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 1200 });
  });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] },
  };
  const file = path.join(tmp, `git-review-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try {
    ev = JSON.parse(res.stdout);
  } catch {
    throw new Error(`${name}: ${(res.stderr || res.stdout || `exit ${res.status}`).slice(0, 400)}`);
  }
  const failed = (ev.normalized_result?.steps ?? []).filter((s) => s.status === "failed");
  if (failed.length) throw new Error(`${name}: step ${failed[0].step_id} failed ${JSON.stringify(failed[0].error ?? failed[0].issues ?? "").slice(0, 300)}`);
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
  if (art.screenshot?.state !== "captured") throw new Error(`${name}: screenshot ${art.screenshot?.state} ${JSON.stringify(ev.normalized_result?.issues ?? ev.issues ?? "").slice(0, 400)}`);
  const png = Buffer.from(art.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${name}.png`), png);
  const dom = art.dom?.value?.html ?? art.dom?.value?.content ?? art.dom?.value ?? "";
  return { png, evidence_id: ev.evidence_id, png_sha256: sha256(png), final_url: art.url?.value?.url ?? art.url?.value ?? null, dom: visibleText(typeof dom === "string" ? dom : JSON.stringify(dom)) };
}

async function main() {
  const [outArg = ".oc-tmp/git-review", ...only] = process.argv.slice(2);
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  // REA runs synchronously below, so each page server is its own process.
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "git-review-ipc") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const manifestPath = path.join(out, "captures.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const record = RECORD && fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : { states: {} };
  const laneCaptures = JSON.parse(fs.readFileSync(path.join(repoRoot, "parity/ui-map/oc-captures.json"), "utf8"));
  const head = spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() || null;
  let failures = 0;
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
    for (const [state, spec] of Object.entries(STATES)) {
      if (only.length && !only.includes(state)) continue;
      try {
        const { png: refPng, ...ref } = capture(out, `ref-${state}`, `http://conductor.localhost:${REF_PORT}/?${q}`, spec.ref);
        const { png: ocPng, ...oc } = capture(out, `oc-${state}`, `http://localhost:${OC_PORT}/?${q}`, spec.oc);
        manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref, oc };
        const cmp = compare(state, refPng, ocPng);
        manifest[state].compare = cmp;
        if (RECORD) {
          record.states[state] = {
            lane: "tools/side-by-side/git-review.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, Tauri IPC mocked with the reference's lisbon diff) in Chromium",
            openconductor_commit: head,
            viewport: VIEWPORT,
            image: `side-by-side/${spec.image}`,
            // The UI map's own OpenConductor capture this record replaces; once that lane captures the state again, its capture wins.
            supersedes_oc_png_sha256: laneCaptures[state]?.png_sha256 ?? null,
            reference: { evidence_id: ref.evidence_id, png_sha256: ref.png_sha256, final_url: ref.final_url, dom: ref.dom },
            openconductor: { evidence_id: oc.evidence_id, png_sha256: oc.png_sha256, dom: oc.dom },
            compare: cmp,
          };
        }
        console.log(`${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id} | t24 ${(cmp.t24.changed_ratio * 100).toFixed(1)}%`);
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

if (process.argv[2] === "--serve-oc") serveOc();
else await main();
