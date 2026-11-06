// Side-by-side evidence for the right-click menus on a chat tab and on a changed file:
// Conductor 0.87.6's extracted frontend (tools/screens harness, Tauri IPC mocked, the
// "Ada/fix login redirect" workspace) and OpenConductor's built frontend (dist/, the
// `?demo=1` state), both driven by REA capture-browser-scenario at the UI map's size,
// dark. The PR badge's menu is not here: the harness answers no PR ("Couldn't load PR
// info"), so Conductor's badge never renders there.
//
//   npm run build && (cd tools/screens && npm ci) && DIST_REF=<decoded Conductor dist> \
//     TMPDIR=/tmp/t UIMAP_RECORD=parity/ui-map/side-by-side.json \
//     node tools/side-by-side/shell-menus.mjs <out-dir>
//
// Writes <out>/{ref,oc}-<state>.png, <out>/captures.json and, with UIMAP_RECORD, a record
// per UI map state scored with REA compare-web-screenshots at thresholds 0 and 24.
// Compose the committed images with compose_pair.py.
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
const REF_PORT = Number(process.env.REF_PORT ?? 4357);
const OC_PORT = Number(process.env.OC_PORT ?? 4358);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const VIEWPORT = { width: 1280, height: 820 };
const RECORD = process.env.UIMAP_RECORD ? path.resolve(process.env.UIMAP_RECORD) : null;
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const css = (selector) => ({ kind: "css", selector });

const REF_OPEN = [{ click: css("text=tide-web") }, { click: css("text=Ada/fix login redirect"), settle: 2500 }];
/** Per state: each side's steps (`click` or `rclick`), its UI map state id and its committed image. */
const STATES = {
  "chat-tab": {
    ref: [...REF_OPEN, { rclick: css('[role=tab][aria-label^="Close chat"]') }],
    oc: [{ rclick: css(".main-tabs [role=tab] >> nth=0") }],
    uiMap: "menu-chat-tab",
    image: "shell-menus-01-chat-tab.png",
  },
  "changes-file": {
    ref: [...REF_OPEN, { rclick: css('.cursor-pointer.mx-2:has-text("auth.test.ts")') }],
    oc: [{ rclick: css(".oc-change-row >> nth=0") }],
    uiMap: "menu-changes-file",
    image: "shell-menus-02-changes-file.png",
  },
};

// OpenConductor: dist/ on the demo state, past first-run onboarding.
const ocExtra = `localStorage.setItem("openconductor.firstRunOnboardingStep", "999");`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  http
    .createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__health") return res.end("ok");
      let file = path.join(DIST_OC, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST_OC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_OC, "index.html");
      let body = fs.readFileSync(file);
      if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${ocExtra}</script>`);
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

/** The open menu's item labels, from the captured DOM. */
function menuItems(html) {
  const menu = html.match(/role="menu"[\s\S]*$/)?.[0] ?? "";
  return [...menu.matchAll(/role="menuitem"[^>]*>([\s\S]*?)<\/(?:div|button)>/g)].map((m) => m[1].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
}

const pngArtifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });

function compare(name, a, b) {
  const res = {};
  const fa = path.join(tmp, `shell-menus-a-${name}.json`);
  const fb = path.join(tmp, `shell-menus-b-${name}.json`);
  fs.writeFileSync(fa, JSON.stringify(pngArtifact(a)));
  fs.writeFileSync(fb, JSON.stringify(pngArtifact(b)));
  for (const t of [0, 24]) {
    const p = spawnSync(REA, ["compare-web-screenshots", fa, fb, "--channel-threshold", String(t), "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    const j = JSON.parse(p.stdout);
    const nr = j.normalized_result ?? j;
    res[`t${t}`] = { evidence_id: j.evidence_id ?? null, changed_pixels: nr.changed_pixels ?? null, total_pixels: nr.total_pixels ?? null, changed_ratio: nr.changed_ratio ?? null };
  }
  return res;
}

function capture(out, name, url, steps) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: url.includes("conductor.localhost") ? 6000 : 3000 }];
  steps.forEach((s, i) => {
    const locator = s.click ?? s.rclick;
    actions.push({ step_id: `c${i}`, action: "click", locator, ...(s.rclick ? { button: "right" } : {}), timeout_ms: 8000 });
    actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: s.settle ?? 600 });
  });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url", "dom"], events: ["page-errors"] },
  };
  const file = path.join(tmp, `shell-menus-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try {
    ev = JSON.parse(res.stdout);
  } catch {
    throw new Error(`${name}: ${(res.stderr || res.stdout || `exit ${res.status}`).slice(0, 400)}`);
  }
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
  if (art.screenshot?.state !== "captured") throw new Error(`${name}: screenshot ${art.screenshot?.state} ${JSON.stringify(ev.normalized_result?.issues ?? ev.issues ?? ev.details ?? "").slice(0, 600)}`);
  const png = Buffer.from(art.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${name}.png`), png);
  const v = art.dom?.value;
  const html = typeof v === "string" ? v : (v?.text ?? v?.html ?? "");
  return { png, evidence_id: ev.evidence_id, png_sha256: sha256(png), final_url: art.url?.value?.url ?? art.url?.value ?? null, menu_items: menuItems(html), dom: visibleText(html) };
}

async function main(out) {
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { env: process.env, stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "shell-menus-ipc") },
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
  fs.mkdirSync(out, { recursive: true });
  const manifest = {};
  const record = RECORD && fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : { states: {} };
  const laneCaptures = JSON.parse(fs.readFileSync(path.join(repoRoot, "parity/ui-map/oc-captures.json"), "utf8"));
  const head = spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() || null;
  let failures = 0;
  try {
    for (const [state, spec] of Object.entries(STATES)) {
      try {
        const { png: refPng, ...ref } = capture(out, `ref-${state}`, `http://conductor.localhost:${REF_PORT}/?oc_scenario=populated&oc_theme=dark`, spec.ref);
        const { png: ocPng, ...oc } = capture(out, `oc-${state}`, `http://localhost:${OC_PORT}/?demo=1`, spec.oc);
        manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref: { ...ref, dom: undefined }, oc: { ...oc, dom: undefined } };
        let line = `${state}: ref ${ref.evidence_id} ${JSON.stringify(ref.menu_items)} | oc ${oc.evidence_id} ${JSON.stringify(oc.menu_items)}`;
        if (RECORD) {
          const cmp = compare(state, refPng, ocPng);
          record.states[spec.uiMap] = {
            lane: "tools/side-by-side/shell-menus.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, ?demo=1) in Chromium",
            openconductor_commit: head,
            viewport: VIEWPORT,
            image: `side-by-side/${spec.image}`,
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
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify(manifest, null, 1) + "\n");
    if (RECORD) fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
    refServer.kill();
    ocServer.kill();
  }
  process.exit(failures ? 1 : 0);
}

// REA runs synchronously in main(), so the page server is its own process.
if (process.argv[2] === "--serve-oc") serveOc();
else await main(path.resolve(process.argv[2] ?? ".oc-tmp/shell-menus"));
