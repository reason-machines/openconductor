// Captures OpenConductor's Home screens with REA capture-browser-scenario, seeded
// like the reference fixture in evidence/screens (repos tide-web, tide-api and
// dotfiles; six workspaces last active 8m, 11m, 17m, 2h, 5h and 1d ago), so
// they can be compared with evidence/screens/home--workspace-list--*.png.
//
//   npx vite build
//   TMPDIR=/tmp/t node tools/home_capture.mjs <out-dir> [shot ...]
//
// It serves dist/ itself on PORT (default 4391) for the run, with an SPA fallback.
//
// Shots: list-dark, list-light, list-search (query "set"), list-archived-empty
// (Only archived, nothing archived), root-dark (the "/" entry cards), and
// root-light-1344 (the "/" screen in the 1344x1091 px window of
// evidence/screens/native/conductor-main.png, which Conductor drew at 110% zoom:
// a 1222x992 CSS viewport at device scale 1.1, with GitHub remotes so the
// sidebar shows owner avatars), and home-row-light-1344 (the same window, reached
// by clicking the sidebar Home row from an open workspace; for
// parity/side-by-side/home.png).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [outDir = "/tmp/home-shots", ...only] = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 4391);
const BASE = `http://localhost:${PORT}`;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const origin = new URL(BASE).origin;

const MIN = 60_000;
const now = Date.now();
const ws = (id, branch, minutesAgo, extra = {}) => ({
  id, name: id, branch, status: "idle", diff: { added: 0, removed: 0 },
  createdAt: now - minutesAgo * MIN - 1000, updatedAt: now - minutesAgo * MIN, ...extra,
});
const remote = (owner, on) => (on ? { remote: `https://github.com/${owner}/repo.git` } : {});
const state = (selection, remotes = false) => ({
  repos: [
    { id: "r-web", name: "tide-web", path: "/code/tide-web", defaultBranch: "main", ...remote("reason-machines", remotes), workspaces: [
      ws("osaka", "osaka", 8, { diff: { added: 15, removed: 1 } }),
      ws("lisbon", "lisbon", 17),
      ws("quito", "cursor-pagination", 26 * 60, { prTitle: "Cursor pagination for /events" }),
    ] },
    { id: "r-api", name: "tide-api", path: "/code/tide-api", defaultBranch: "main", ...remote("github", remotes), workspaces: [
      ws("tallinn", "tallinn", 11, { unread: true }),
      ws("lima", "add-search-to-settings", 120, { unread: true }),
    ] },
    { id: "r-dot", name: "dotfiles", path: "/code/dotfiles", defaultBranch: "main", ...remote("tauri-apps", remotes), workspaces: [ws("bergen", "bergen", 300)] },
  ],
  selection,
  sidebarVisible: true,
});

const home = { kind: "home" };
const shots = [
  { name: "list-dark", theme: "dark", selection: home },
  { name: "list-light", theme: "light", selection: home },
  { name: "list-search", theme: "dark", selection: home, actions: [
    { step_id: "type_query", action: "fill", locator: { kind: "role", role: "textbox", name: "Search workspaces" }, value: { source: "literal", value: "set" } },
  ] },
  { name: "list-archived-empty", theme: "dark", selection: home, actions: [
    { step_id: "open_archive_menu", action: "click", locator: { kind: "role", role: "button", name: "Archived workspaces" } },
    // REA's role locator has no menuitemcheckbox role, so match the third item (Only archived) by CSS.
    { step_id: "only_archived", action: "click", locator: { kind: "css", selector: ".allws-menu-pop [role=menuitemcheckbox]:nth-child(3)" } },
  ] },
  { name: "root-dark", theme: "dark", selection: { kind: "root" } },
  { name: "root-light-1344", theme: "light", selection: { kind: "root" }, viewport: { width: 1222, height: 992 }, scale: 1.1, remotes: true },
  // Same window, but it starts in workspace osaka and clicks the sidebar Home row,
  // which opens the wordmark screen (Sven's brief for #483; Conductor opens /all-workspaces).
  { name: "home-row-light-1344", theme: "light", selection: { kind: "workspace", repoId: "r-web", workspaceId: "osaka" }, viewport: { width: 1222, height: 992 }, scale: 1.1, remotes: true, actions: [
    { step_id: "click_sidebar_home", action: "click", locator: { kind: "css", selector: '.sb-primary button.sb-row[title^="Home"]' } },
  ] },
].filter((s) => only.length === 0 || only.includes(s.name));

fs.mkdirSync(outDir, { recursive: true });
const results = {};
for (const shot of shots) {
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `${BASE}${shot.selection.kind === "home" ? "/all-workspaces" : "/"}` },
    environment: { viewport: { ...(shot.viewport ?? { width: 1440, height: 900 }), device_scale_factor: shot.scale ?? 1 }, color_scheme: shot.theme, locale: "en-US", timezone: "UTC" },
    storage: {
      local_storage: [{ origin, entries: [
        { name: "openconductor.shell.v1", value: { source: "literal", value: JSON.stringify(state(shot.selection, shot.remotes)) } },
        { name: "openconductor.home.filters.v1", value: { source: "literal", value: JSON.stringify({ projects: [], archiveFilter: "active" }) } },
      ] }],
    },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 2500 },
      // REA steps wait forever without a timeout_ms.
      ...(shot.actions ?? []).map((a) => ({ timeout_ms: 5000, ...a })),
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 600 },
    ],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(process.env.TMPDIR ?? "/tmp", `rea-home-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
  const res = await run(REA, ["capture-browser-scenario", inputFile, "--format", "json"], {
    encoding: "utf8", maxBuffer: 512 * 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  let ev;
  try {
    ev = JSON.parse(res.stdout);
  } catch {
    console.error(`[${shot.name}] REA failed (exit ${res.status}): ${(res.stderr || res.stdout).slice(0, 1500)}`);
    process.exitCode = 1;
    continue;
  }
  const artifact = ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot;
  const b64 = findBase64(artifact);
  if (!b64) {
    console.error(`[${shot.name}] no screenshot: ${JSON.stringify(ev).slice(0, 1500)}`);
    process.exitCode = 1;
    continue;
  }
  const png = Buffer.from(b64, "base64");
  const file = path.join(outDir, `ours-home-${shot.name}.png`);
  fs.writeFileSync(file, png);
  // The artifact JSON is what `rea compare-web-screenshots` takes; kept outside the repo.
  if (process.env.ARTIFACT_DIR) fs.writeFileSync(path.join(process.env.ARTIFACT_DIR, `ours-home-${shot.name}.artifact.json`), JSON.stringify(artifact?.artifact ?? artifact));
  const events = JSON.stringify(ev.normalized_result?.events ?? {});
  results[shot.name] = {
    file: path.basename(file),
    evidence_id: ev.evidence_id,
    png_sha256: crypto.createHash("sha256").update(png).digest("hex"),
    page_errors: (events.match(/"page-error/g) || []).length,
  };
  console.log(`[${shot.name}] ${results[shot.name].evidence_id} ${png.length} bytes, page errors ${results[shot.name].page_errors}`);
}
fs.writeFileSync(path.join(outDir, "captures.json"), JSON.stringify(results, null, 2));
server.close();

// spawnSync would block the event loop that serves dist/ to the browser.
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: opts.env });
    const kill = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", () => clearTimeout(kill));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  if (typeof o.data_base64 === "string") return o.data_base64;
  for (const v of Object.values(o)) {
    const hit = findBase64(v);
    if (hit) return hit;
  }
  return undefined;
}
