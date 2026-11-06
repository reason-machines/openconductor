// Side-by-side evidence for Settings › Organization (/settings/organization/*):
// Conductor 0.87.6's extracted frontend in the tools/screens harness as a
// member of a cloud organization (?oc_org=cloud, tools/screens/org-fixtures.js)
// and OpenConductor's built frontend (dist/, seeded like tools/sidebar-screens)
// with a Reason workspace as the active organization and `reason_api_call`
// answered in the public Reason API's shapes (src/org/api.ts). Both are opened
// at the route and captured by REA capture-browser-scenario with the same
// viewport and theme. Data on both sides is invented; Reason's members carry
// no names, so only the signed-in person's own name shows on our side.
//
//   npm run build && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t REA=<rea> \
//     node tools/side-by-side/org-settings.mjs <out-dir> [state ...]
//
// Writes <out>/ref-<state>.png, <out>/oc-<state>.png and <out>/captures.json.
// VIEWPORT=1280x820 and UIMAP_RECORD=parity/ui-map/side-by-side.json record
// each pair under its UI map state (settings-org-<page>).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const [outArg = ".oc-tmp/org-settings", ...only] = process.argv[2] === "--serve-oc" ? [] : process.argv.slice(2);
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

/** The workspace OpenConductor has active (stored like src/org/organization.ts does). */
const ORG = { id: "org_demo_0001", slug: "tide-labs", name: "Tide Labs", role: "admin" };
/** Answers of `reason_api_call`, in the public Reason API's shapes (`reason tools`, CLI 0.2.699). */
const API = {
  getSelf: { principal_type: "user", user_id: "u-ada", user_name: "Ada Demo", email: "ada@example.com", org_id: ORG.id, organization_name: ORG.name, organization_slug: ORG.slug },
  listOrganizations: { items: [{ id: ORG.id, slug: ORG.slug, name: ORG.name, membership_role: "admin" }], total: 1, has_next_page: false, end_cursor: null },
  listMembers: {
    items: [
      { user_id: "u-ada", email: "ada@example.com", role: "admin", avatar_url: null, created_at: "2026-01-15T09:00:00.000Z" },
      { user_id: "u-grace", email: "grace@example.com", role: "member", avatar_url: null, created_at: "2026-02-03T10:30:00.000Z" },
      { user_id: "u-linus", email: "linus@example.com", role: "member", avatar_url: null, created_at: "2026-03-21T14:05:00.000Z" },
    ],
    total: 3, has_next_page: false, end_cursor: null, invites: [],
  },
  listMcpServers: { items: [], total: 0, has_next_page: false, end_cursor: null },
  // Reason's catalog (listConnections): the services Conductor recommends that Reason also connects through MCP,
  // in Conductor's order, none connected. Shapes from `reason tools`; descriptions invented.
  listConnections: {
    services: ["Granola", "Notion", "Airtable", "Linear", "Asana", "PostHog", "Hex", "Sentry", "Slack", "Stripe", "Supabase", "Vercel", "Cloudflare", "Neon", "PlanetScale", "Atlassian", "Context7", "Exa"].map((name) => ({
      id: name.toLowerCase(), name, icon: null, description: "", status: "not_connected", reason: "", connections: [],
      offerings: [{ id: name.toLowerCase() + "-mcp", adapter: "mcp", providerId: name.toLowerCase(), name, connectable: true, reason: null }],
    })),
  },
  listRepositories: {
    items: [
      { id: "ri-1", full_name: "tide-labs/tide-web", account_login: "tide-labs", grant: "team", host: "github.com", archived: false },
      { id: "ri-2", full_name: "tide-labs/tide-api", account_login: "tide-labs", grant: "team", host: "github.com", archived: false },
    ],
  },
};

/**
 * Per state: the route on both sides, what each side waits for, its UI map state and committed image
 * (parity/side-by-side/). The Cloud computer page shows tide-web twice on Conductor's side (nav and chip),
 * so its reference waits for the page's own copy (REA gap 12).
 */
const COMPUTER_WAIT = "text=Configure your organization's shared cloud computer.";
const STATES = {
  "org-computer": { path: "/settings/organization/computer", refWait: COMPUTER_WAIT, ocWait: ".org-chips", uiMap: "settings-org-computer", image: "settings-org-03-computer.png" },
  "org-github": { path: "/settings/organization/github", refWait: COMPUTER_WAIT, ocWait: ".org-chips", uiMap: "settings-org-github", image: "settings-org-03-computer.png" },
  "org-members": { path: "/settings/organization/members", uiMap: "settings-org-members", image: "settings-org-04-members.png" },
  "org-preferences": { path: "/settings/organization/preferences", uiMap: "settings-org-preferences", image: "settings-org-05-preferences.png" },
  "org-environment": { path: "/settings/organization/environment", uiMap: "settings-org-environment", image: "settings-org-06-environment.png" },
  "org-mcp": { path: "/settings/organization/mcp", uiMap: "settings-org-mcp", image: "settings-org-07-mcp.png" },
  "org-prompts": { path: "/settings/organization/prompts", uiMap: "settings-org-prompts", image: "settings-org-08-prompts.png" },
};

// OpenConductor: dist/ with the sidebar-screens seed, the Reason workspace stored as the active
// organization, and a Tauri shell that answers `reason_api_call` (above) and nothing else.
const ocSeed = fs.readFileSync(path.join(repoRoot, "tools/sidebar-screens/seed.js"), "utf8");
const ocExtra = `(function () {
  localStorage.setItem("openconductor.organization.v1", ${JSON.stringify(JSON.stringify(ORG))});
  const api = ${JSON.stringify(API)};
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 0,
    async invoke(cmd, args) {
      if (cmd === "execute_shell_command_cancellable" || cmd === "execute_shell_command") return { stdout: "", stderr: "", exitCode: 0, signal: null, cancelled: false, truncated: false };
      if (cmd === "reason_api_call" && api[args.operation]) return api[args.operation];
      throw new Error("not mocked: " + cmd + (args && args.operation ? " " + args.operation : ""));
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
  env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "org-settings-ipc") },
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
  const fa = path.join(tmp, `org-settings-a-${name}.json`);
  const fb = path.join(tmp, `org-settings-b-${name}.json`);
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

function capture(name, url, wait = "text=tide-web") {
  const actions = [
    { step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 },
    { step_id: "ready", action: "wait_for", locator: { kind: "css", selector: wait }, state: "visible", timeout_ms: 15000 },
    { step_id: "final", action: "wait_for_timeout", duration_ms: 1200 },
  ];
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...VIEWPORT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "url", "dom"], events: ["console", "page-errors"] },
  };
  const file = path.join(tmp, `org-settings-${name}.json`);
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
  // REA's DOM artifact is {sha256, bytes, text} (REA gap 43).
  const dom = art.dom?.value?.text ?? art.dom?.value?.html ?? "";
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
      const { png: refPng, ...ref } = capture(`ref-${state}`, `http://conductor.localhost:${REF_PORT}${spec.path}?${q}&oc_org=cloud`, spec.refWait);
      const { png: ocPng, ...oc } = capture(`oc-${state}`, `http://localhost:${OC_PORT}${spec.path}?${q}`, spec.ocWait);
      manifest[state] = { tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", ref, oc };
      let line = `${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id}`;
      if (RECORD && spec.uiMap) {
        const cmp = compare(state, refPng, ocPng);
        record.states[spec.uiMap] = {
          lane: "tools/side-by-side/org-settings.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness, ?oc_org=cloud) and of OpenConductor's built frontend (dist/, reason_api_call mocked like the Reason API) in Chromium",
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
