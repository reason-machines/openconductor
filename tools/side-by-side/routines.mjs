// Side-by-side evidence for Routines: Conductor 0.87.6's /routines and
// /routines/new (extracted frontend, tools/screens harness, Tauri IPC mocked)
// beside OpenConductor's built frontend (dist/, seeded like tools/sidebar-screens)
// with `reason_api_call` answered like the Reason API (and `reason_account_status`
// signed in, which shows the sidebar's Routines row), both captured with REA
// capture-browser-scenario at the same viewport and theme.
//
//   npm run build && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     node tools/side-by-side/routines.mjs <out-dir> [state ...]
//
// The harness has no Conductor cloud organization, so Conductor's routine list
// query never runs and /routines shows its header, a loading spinner and the
// suggestions. OpenConductor is captured in the same data state for the scored
// pair (its Reason call left pending). The `oc-only` states show OpenConductor
// with Loops answered (table, editor of a saved routine); they have no reference.
//
// VIEWPORT=1280x820 captures at the UI map's size. With UIMAP_RECORD=<file>
// (parity/ui-map/side-by-side.json) each scored pair is recorded under its UI map
// state id for tools/ui-map/build_map.py.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const [outArg = ".oc-tmp/routines", ...only] = process.argv[2] === "--serve-oc" ? [] : process.argv.slice(2);
const out = path.resolve(outArg);
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4347);
const OC_PORT = Number(process.env.OC_PORT ?? 4348);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const [vw, vh] = (process.env.VIEWPORT ?? "1280x820").split("x").map(Number);
const VIEWPORT = { width: vw, height: vh };
const RECORD = process.env.UIMAP_RECORD ? path.resolve(process.env.UIMAP_RECORD) : null;
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const css = (selector) => ({ kind: "css", selector });

/**
 * Per state: the reference path (null: OpenConductor only), OpenConductor's path and
 * Reason API mode, clicks on OpenConductor, its UI map id and committed image name.
 */
const STATES = {
  "route-routines": { ref: "/routines", oc: "/routines", api: "pending", uiMap: "route-routines", image: "routines-01-list.png" },
  // The harness renders the editor without a cloud organization (no sidebar Routines row), so the account check is
  // left unanswered here too (mode "api-only") while the Loop calls answer.
  "route-routines-new": { ref: "/routines/new", oc: "/routines/new", api: "api-only", uiMap: "route-routines-new", image: "routines-02-new.png" },
  "oc-routines-table": { ref: null, oc: "/routines", api: "loops", clicks: [css("button[aria-pressed=false] >> text=Team")], image: "routines-03-oc-table.png" },
  "oc-routine-edit": { ref: null, oc: "/routines/l-weekly?reason=r-main", api: "loops", image: "routines-04-oc-edit.png" },
  "oc-routine-add-trigger": { ref: null, oc: "/routines/new/daily-herald", api: "loops", clicks: [css("text=Add trigger"), css("[role=menuitem] >> text=GitHub")], image: "routines-05-oc-add-trigger.png" },
};

// OpenConductor: dist/ with the sidebar-screens seed and a Tauri shell whose only
// command is `reason_api_call`, answered like the public Reason API (CLI 0.2.673
// shapes, ids and names invented).
const ocSeed = fs.readFileSync(path.join(repoRoot, "tools/sidebar-screens/seed.js"), "utf8");
const ocMock = (mode) => `(function () {
  const now = Date.now();
  const iso = (m) => new Date(now + m * 60000).toISOString();
  const loop = (id, name, prompt, owner, extra) => Object.assign({ id, reason_id: "r-main", name, prompt, enabled: true, status: "active",
    paused_reason: null, wakes_on: [], schedule: null, event_trigger: null, slack: null, execution_mode: "new_session", session_id: null,
    latest_session_id: null, device_id: null, repository: null, model: null, notification_policy: "important_updates", until: null,
    max_runs: null, run_count: 0, last_run: null, created_by_user_id: owner, viewer_access: { edit: owner === "u-ada", stop: owner === "u-ada" } }, extra);
  const loops = [
    loop("l-weekly", "Weekly report", "Repository: tide-labs/tide-web\\n\\nRecap what I got done this week.", "u-ada", {
      wakes_on: [{ kind: "schedule", description: "0 17 * * 5" }], schedule: { kind: "cron", expression: "0 17 * * 5", every_seconds: null, timezone: "UTC", next_run_at: iso(1700) },
      run_count: 4, last_run: { status: "completed", at: iso(-8000), session_id: "s-1" }, model: "byok:anthropic:claude-opus-5-5" }),
    loop("l-health", "System health check", "Find the top three easy wins.", "u-ada", {
      wakes_on: [{ kind: "schedule", description: "0 9 * * *" }, { kind: "webhook", description: "webhook" }],
      schedule: { kind: "cron", expression: "0 9 * * *", every_seconds: null, timezone: "UTC", next_run_at: iso(300) },
      event_trigger: { kind: "webhook", url: "https://api.reasonmachines.com/v3/loops/l-health/events" }, run_count: 12, last_run: { status: "completed", at: iso(-120), session_id: "s-2" } }),
    loop("l-review", "Review merged PRs", "Repository: tide-labs/tide-api\\n\\nSummarise each merged pull request.", "u-ada", {
      enabled: false, status: "paused", wakes_on: [{ kind: "github", description: "pr_closed on tide-labs/tide-api" }], repository: "tide-labs/tide-api", event_trigger: { kind: "github", url: null } }),
    loop("l-triage", "Nightly issue triage", "Label and route new issues.", "u-grace", {
      wakes_on: [{ kind: "schedule", description: "0 2 * * *" }], schedule: { kind: "cron", expression: "0 2 * * *", every_seconds: null, timezone: "UTC", next_run_at: iso(840) },
      run_count: 30, last_run: { status: "completed", at: iso(-600), session_id: "s-3" } }),
  ];
  const answers = {
    getSelf: { principal_type: "user", user_id: "u-ada", user_name: "Ada Demo", email: "ada@example.com", org_id: "org-demo" },
    listReasons: { items: [{ id: "r-main", name: "Reason", main: true, mine: true }] },
    listMembers: { items: [{ user_id: "u-ada", email: "ada@example.com", role: "admin" }, { user_id: "u-grace", email: "grace@example.com", role: "member" }] },
    listReasonLoops: { items: loops },
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 0,
    async invoke(cmd, args) {
      if (${JSON.stringify(mode)} === "pending") return new Promise(() => {});
      if (cmd === "reason_account_status") return ${JSON.stringify(mode)} === "api-only" ? new Promise(() => {}) : { email: "ada@example.com", name: "Ada Demo", workspaces: [] };
      if (cmd !== "reason_api_call") throw new Error("not mocked: " + cmd);
      const op = args.operation;
      if (op === "getReasonLoop") return loops.find((l) => l.id === args.input.path.loopId);
      if (op === "getSelf") { const s = answers.getSelf; answers.listMembers.items[0].email = s.email; }
      if (answers[op]) return answers[op];
      throw { code: "not_mocked", message: op };
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
      if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${ocSeed}</script><script>${ocMock(url.searchParams.get("oc_api") ?? "loops")}</script>`);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    })
    .listen(OC_PORT);
}
if (process.argv[2] === "--serve-oc") {
  serveOc();
} else {
  await main();
}

async function main() {
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { env: process.env, stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "routines-ipc") },
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
    const fa = path.join(tmp, `routines-a-${name}.json`);
    const fb = path.join(tmp, `routines-b-${name}.json`);
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

  function capture(name, url, clicks = [], wait = null) {
    const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 }];
    if (wait) actions.push({ step_id: "wait", action: "wait_for", locator: wait, state: "visible", timeout_ms: 10000 });
    clicks.forEach((locator, i) => {
      actions.push({ step_id: `c${i}`, action: "click", locator, timeout_ms: 5000 });
      actions.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 600 });
    });
    actions.push({ step_id: "final", action: "wait_for_timeout", duration_ms: 800 });
    const input = {
      browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
      start_url: { url },
      environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions,
      capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] },
    };
    const file = path.join(tmp, `routines-${name}.json`);
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
        const sep = spec.oc.includes("?") ? "&" : "?";
        const { png: ocPng, ...oc } = capture(`oc-${state}`, `http://localhost:${OC_PORT}${spec.oc}${sep}${q}&oc_api=${spec.api}`, spec.clicks ?? []);
        if (!spec.ref) {
          manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", oc };
          console.log(`${state}: oc ${oc.evidence_id}`);
          continue;
        }
        const { png: refPng, ...ref } = capture(`ref-${state}`, `http://conductor.localhost:${REF_PORT}${spec.ref}?${q}`, [], css("text=tide-web"));
        manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref, oc };
        let line = `${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id}`;
        if (RECORD) {
          const cmp = compare(state, refPng, ocPng);
          record.states[spec.uiMap] = {
            lane: "tools/side-by-side/routines.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, reason_api_call mocked like the Reason API) in Chromium",
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
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
    if (RECORD) fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
    refServer.kill();
    ocServer.kill();
  }
  process.exit(failures ? 1 : 0);
}
