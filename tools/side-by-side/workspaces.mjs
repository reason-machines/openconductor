// Side-by-side evidence for the workspaces area of the UI map: the command
// palette's Workspaces tab (filters, rows, empty state) and the sidebar's
// workspace menus. Conductor 0.87.6's extracted frontend (tools/screens
// harness, Tauri IPC mocked, populated scenario) beside OpenConductor's built
// frontend (dist/, tests/e2e/right-panel-fixture.mjs's fake backend seeded with
// the same three repos and six workspaces as tools/screens/seed-data.js), both
// driven by REA capture-browser-scenario at the UI map's size (1280x820, dark).
//
//   npm run build && (cd tools/screens && npm ci) && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     UIMAP_RECORD=parity/ui-map/side-by-side.json node tools/side-by-side/workspaces.mjs <out-dir> [state ...]
//
// Writes <out>/{ref,oc}-<state>.png and <out>/captures.json; with UIMAP_RECORD
// each pair is scored with REA compare-web-screenshots at channel thresholds 0
// and 24, recorded under its UI map state id (tools/ui-map/README.md) and
// composed into parity/side-by-side/workspaces-<state>.png.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";

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
const css = (selector) => ({ kind: "css", selector });

// tools/screens/seed-data.js's populated scenario: [id, repo, directory, branch, minutes ago, unread, PR title].
const SEED = [
  ["w1", "r1", "lisbon", "ada/fix-login-redirect", 12, false, null],
  ["w2", "r1", "osaka", "ada/dark-mode-tokens", 3, false, null],
  ["w3", "r1", "quito", "ada/settings-search", 95, true, "Add search to settings"],
  ["w4", "r2", "tallinn", "ada/rate-limit-headers", 6, true, null],
  ["w5", "r2", "accra", "ada/pagination-cursor", 1440, false, "Cursor pagination for /events"],
  ["w6", "r3", "bergen", "ada/zsh-prompt", 300, false, null],
];
const REPOS = [
  ["r1", "tide-web"],
  ["r2", "tide-api"],
  ["r3", "dotfiles"],
];
const SHELL = {
  repos: REPOS.map(([id, name]) => ({
    id,
    name,
    path: `/Users/demo/code/${name}`,
    defaultBranch: "main",
    workspaces: SEED.filter((w) => w[1] === id).map(([wid, , dir, branch]) => ({ id: wid, name: dir, branch, path: `/Users/demo/code/${name}/${dir}` })),
  })),
  selection: { kind: "root" },
};
const ROWS = SEED.map(([id, , , , ago, unread, prTitle], i) => ({ id, ago, unread, prTitle, number: i + 1 }));

/** Runs in the page after fakeBackend: Conductor's row data (no stored names, PR titles, unread, ages, numbers). */
function extras({ rows }) {
  // Conductor's populated scenario opens with every repository collapsed; the menu states expand tide-web.
  const prefs = JSON.parse(localStorage.getItem("openconductor.shell.prefs.v1"));
  localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ ...prefs, collapsed: ["r1", "r2", "r3"] }));
  const inner = window.__TAURI_INTERNALS__.invoke;
  const now = Date.now();
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "db_list_workspaces") {
      const list = await inner(cmd, args);
      return list.map((w) => {
        const r = rows.find((x) => x.id === w.id);
        if (!r) return w;
        const at = (m) => new Date(now - m * 60000).toISOString();
        return { ...w, workspaceName: null, prTitle: r.prTitle, prDescription: null, unread: r.unread, number: r.number, intendedTargetBranch: "main", createdAt: at(r.ago + 60), updatedAt: at(r.ago) };
      });
    }
    // The harness's repos have GitHub remotes (seed-data.js), which sets the rows' git status icon.
    if (cmd === "db_list_repos") return (await inner(cmd, args)).map((r) => ({ ...r, remoteUrl: `git@github.com:tide-labs/${r.name}.git` }));
    if (cmd === "db_list_sections" || cmd === "session_statuses" || cmd === "db_list_archived_workspaces") return [];
    // Create project's parent folder: no saved location, so the default (the harness shows /Users/demo/conductor/repos).
    if (cmd === "default_clone_directory") return "/Users/demo/openconductor/repos";
    if (cmd === "local_storage_get_entry") return null;
    if (cmd === "local_storage_set_entry") return { success: true };
    return inner(cmd, args);
  };
}

const REF_PALETTE = [{ press: "Meta+k" }, css("[role=dialog] >> text=Workspaces")];
const OC_PALETTE = [css(".sb-primary .sb-row:has-text('Search')"), css(".palette [role=tab]:has-text('Workspaces')")];
// One input in Conductor's dialog is the archive Select's hidden one, so match on the placeholder.
const SEARCH = "[role=dialog] input[placeholder]";
const both = (extra) => ({ ref: [...REF_PALETTE, ...extra], oc: [...OC_PALETTE, ...extra] });
const STATES = {
  "palette-workspaces": both([]),
  "palette-workspaces-projects": both([css("[role=dialog] button:has-text('All projects')")]),
  "palette-workspaces-archive-filter": both([css("[role=dialog] button:has-text('Hiding archived')")]),
  "palette-workspaces-empty": both([{ fill: [SEARCH, "zzzz"] }]),
  // Home's Quick start card: the Create project dialog.
  "dialog-create-project": { ref: [css("text=Quick start")], oc: [css(".home-card:has-text('Quick start')")] },
  // The lisbon row's right-click menu, and its Set status submenu.
  "menu-workspace-context": {
    ref: [css("text=tide-web"), { right: "text=Ada/fix login redirect" }],
    oc: [css(".sb-repo-name:has-text('tide-web')"), { right: ".sb-ws-name:has-text('Ada/fix login redirect')" }],
  },
  "menu-workspace-status": {
    ref: [css("text=tide-web"), { right: "text=Ada/fix login redirect" }, css("[role=menu] >> text=Set status")],
    oc: [css(".sb-repo-name:has-text('tide-web')"), { right: ".sb-ws-name:has-text('Ada/fix login redirect')" }, css("[role=menu] [role=menuitem]:has-text('Set status')")],
  },
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  const init = `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES })});(${extras})(${JSON.stringify({ rows: ROWS })});`;
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

function step(a, i) {
  if (a.press) return { step_id: `k${i}`, action: "press", locator: css("body"), key: a.press, timeout_ms: 8000 };
  if (a.fill) return { step_id: `f${i}`, action: "fill", locator: css(a.fill[0]), value: { source: "literal", value: a.fill[1] }, timeout_ms: 8000 };
  if (a.right) return { step_id: `r${i}`, action: "click", locator: css(a.right), button: "right", timeout_ms: 8000 };
  return { step_id: `c${i}`, action: "click", locator: a, timeout_ms: 8000 };
}

function capture(out, name, url, actions0) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 5000 }];
  actions0.forEach((a, i) => {
    actions.push(step(a, i));
    actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 800 });
  });
  actions.push({ step_id: "final", action: "wait_for_timeout", duration_ms: 600 });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] },
  };
  const file = path.join(tmp, `workspaces-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  let ev;
  try {
    ev = JSON.parse(res.stdout);
  } catch {
    throw new Error(`${name}: ${(res.stderr || res.stdout || `exit ${res.status}`).slice(0, 600)}`);
  }
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
  if (art.screenshot?.state !== "captured") throw new Error(`${name}: screenshot ${art.screenshot?.state} ${JSON.stringify(ev.normalized_result?.issues ?? ev.issues ?? ev.details ?? "").slice(0, 600)}`);
  const png = Buffer.from(art.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${name}.png`), png);
  const dom = art.dom?.value?.html ?? art.dom?.value?.text ?? art.dom?.value?.content ?? "";
  return { png, evidence_id: ev.evidence_id, png_sha256: sha256(png), final_url: art.url?.value?.url ?? art.url?.value ?? null, dom: visibleText(typeof dom === "string" ? dom : JSON.stringify(dom)) };
}

const pngArtifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });
function compare(name, a, b) {
  const res = {};
  const fa = path.join(tmp, `workspaces-a-${name}.json`);
  const fb = path.join(tmp, `workspaces-b-${name}.json`);
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

if (process.argv[2] === "--serve-oc") {
  serveOc();
} else {
  const [outArg = ".oc-tmp/workspaces", ...only] = process.argv.slice(2);
  const refOnly = only[0] === "--oc-only" ? (only.shift(), false) : true;
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  // REA runs synchronously, so each page server is its own process.
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "workspaces-ipc") },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const record = RECORD && fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : { states: {} };
  const lane = JSON.parse(fs.readFileSync(path.join(repoRoot, "parity/ui-map/oc-captures.json"), "utf8"));
  const head = spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() || null;
  const manifest = {};
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
    for (const [state, spec] of Object.entries(STATES)) {
      if (only.length && !only.includes(state)) continue;
      try {
        // With --oc-only, reuse <out>/ref-<state>.png from an earlier run (iterating on OpenConductor).
        const refFile = path.join(out, `ref-${state}.png`);
        const reuse = !refOnly && fs.existsSync(refFile) && fs.existsSync(refFile + ".json");
        const { png: refPng, ...ref } = reuse
          ? { png: fs.readFileSync(refFile), ...JSON.parse(fs.readFileSync(refFile + ".json", "utf8")) }
          : capture(out, `ref-${state}`, `http://conductor.localhost:${REF_PORT}/?oc_scenario=populated&oc_theme=dark`, spec.ref);
        if (!reuse) fs.writeFileSync(refFile + ".json", JSON.stringify(ref));
        const { png: ocPng, ...oc } = capture(out, `oc-${state}`, `http://localhost:${OC_PORT}/`, spec.oc);
        manifest[state] = { ref: { evidence_id: ref.evidence_id, png_sha256: ref.png_sha256 }, oc: { evidence_id: oc.evidence_id, png_sha256: oc.png_sha256 } };
        let line = `${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id}`;
        const cmp = compare(state, refPng, ocPng);
        line += ` | t24 ${(cmp.t24.changed_ratio * 100).toFixed(1)}%`;
        const image = `workspaces-${state}.png`;
        spawnSync("python3", [path.join(here, "compose_pair.py"), path.join(out, `ref-${state}.png`), path.join(out, `oc-${state}.png`), RECORD ? path.join(repoRoot, "parity/side-by-side", image) : path.join(out, image)], { stdio: "inherit" });
        if (RECORD) {
          record.states[state] = {
            lane: "tools/side-by-side/workspaces.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, Tauri IPC mocked) in Chromium",
            openconductor_commit: head,
            viewport: VIEWPORT,
            image: `side-by-side/${image}`,
            supersedes_oc_png_sha256: lane[state]?.png_sha256 ?? null,
            reference: { evidence_id: ref.evidence_id, png_sha256: ref.png_sha256, final_url: ref.final_url, dom: ref.dom },
            openconductor: { evidence_id: oc.evidence_id, png_sha256: oc.png_sha256, dom: oc.dom },
            compare: cmp,
          };
        }
        console.log(line);
      } catch (e) {
        failures++;
        console.error(String(e));
      }
    }
  } finally {
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify({ tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", captures: manifest }, null, 1) + "\n");
    if (RECORD) fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
    refServer.kill();
    ocServer.kill();
  }
  process.exit(failures ? 1 : 0);
}
