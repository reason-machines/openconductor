// Right-click menu evidence for the chat, diff and PR screens: opens each menu
// in Conductor's extracted frontend (tools/screens/server.mjs, mocked IPC) and
// in OpenConductor's Vite build, with REA capture-browser-scenario, then
// renders a Conductor | OpenConductor side-by-side of the menu region through
// REA as well and records REA compare-web-screenshots for each pair.
//
//   npx vite build
//   DIST=~/conductor-fe/dist TMPDIR=/tmp/t node tools/context-menus/capture.mjs [shot-name ...]
//
// Shots are in tools/context-menus/shots.json; output goes to
// parity/side-by-side/chat-diff-pr/context-menus/ (conductor-*.png, ours-*.png,
// sbs-*.png, captures.json). Conductor's dist is third-party code and never
// lives in this repository. Evidence tooling only, no feature code.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const ourDist = path.join(repoRoot, "dist");
const conductorDist = path.resolve(process.env.DIST ?? path.join(process.env.HOME, "conductor-fe/dist"));
const outDir = path.join(repoRoot, "parity/side-by-side/chat-diff-pr/context-menus");
const REA = process.env.REA ?? [".npm-global/bin/rea", ".rea/node_modules/.bin/rea"].map((p) => path.join(process.env.HOME, p)).find((p) => fs.existsSync(p)) ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const C_PORT = Number(process.env.C_PORT ?? 4471);
const O_PORT = Number(process.env.O_PORT ?? 4472);
const TMP = process.env.TMPDIR ?? "/tmp";

const { seed, shots: allShots } = JSON.parse(fs.readFileSync(path.join(here, "shots.json"), "utf8"));
const only = process.argv.slice(2);
const shots = only.length ? allShots.filter((s) => only.includes(s.name)) : allShots;
const seedScript = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(seed))});</script>`;

// OpenConductor's build with the seed injected, plus /__sbs, the side-by-side page.
const ours = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__sbs") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(sbsPage(url.searchParams));
    return;
  }
  if (url.pathname.startsWith("/__img/")) {
    const f = path.join(outDir, path.basename(url.pathname));
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fs.readFileSync(f));
    return;
  }
  let file = path.join(ourDist, decodeURIComponent(url.pathname));
  if (!file.startsWith(ourDist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ourDist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seedScript}`));
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => ours.listen(O_PORT, "127.0.0.1", r));

// The extracted dist has no Geist files (only the Nerd Font notes), so Conductor
// would render in a fallback font. Serve it through a symlinked overlay that adds
// OpenConductor's byte-identical Geist files (src/fonts.css); the shared dist is untouched.
const overlay = path.join(TMP, "cm-conductor-dist");
fs.rmSync(overlay, { recursive: true, force: true });
fs.mkdirSync(path.join(overlay, "fonts"), { recursive: true });
for (const e of fs.readdirSync(conductorDist)) if (e !== "fonts") fs.symlinkSync(path.join(conductorDist, e), path.join(overlay, e));
for (const dir of [path.join(conductorDist, "fonts"), path.join(repoRoot, "public/fonts")])
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (!fs.existsSync(path.join(overlay, "fonts", f))) fs.symlinkSync(path.join(dir, f), path.join(overlay, "fonts", f));

const conductor = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, DIST: overlay, PORT: String(C_PORT) }, stdio: "ignore" });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${C_PORT}/__health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

function sbsPage(q) {
  const [x, y, w, h] = (q.get("crop") ?? "0,0,1440,900").split(",").map(Number);
  const panel = (label, img) => `<figure><figcaption>${label}</figcaption><div class="crop" style="width:${w}px;height:${h}px;background-image:url('/__img/${img}');background-position:-${x}px -${y}px"></div></figure>`;
  return `<!doctype html><html><head><style>
    body{margin:0;padding:16px;background:#d9d6d3;font:600 14px -apple-system,system-ui,sans-serif;color:#2c2826;display:flex;gap:16px;align-items:flex-start}
    figure{margin:0} figcaption{margin:0 0 8px}
    .crop{background-repeat:no-repeat;outline:1px solid #0003}
  </style></head><body>${panel("Conductor 0.87.6", q.get("left"))}${panel("OpenConductor", q.get("right"))}</body></html>`;
}

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}
// Async: OpenConductor's build is served from this same process.
function rea(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(REA, args, { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => (out.trim().startsWith("{") ? resolve(JSON.parse(out)) : reject(new Error(`rea ${args[0]}: ${(err || out).slice(0, 1500)}`))));
  });
}
async function capture(name, url, theme, actions, viewport = { width: 1440, height: 900 }) {
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url },
    environment: { viewport: { ...viewport, device_scale_factor: 1 }, color_scheme: theme, locale: "en-US", timezone: "UTC" },
    actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 7000 }, ...actions, { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 600 }],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(TMP, `rea-cm-${name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const ev = await rea(["capture-browser-scenario", inputFile, "--format", "json"]);
  const b64 = findBase64(ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot) ?? findBase64(ev.normalized_result);
  const steps = (ev.normalized_result?.steps ?? []).map((s) => `${s.step_id}:${s.status}${s.error ? ` (${String(s.error).slice(0, 200)})` : ""}`);
  if (!b64) throw new Error(`${name}: no screenshot; steps ${steps.join(", ") || JSON.stringify(ev).slice(0, 600)}`);
  const png = Buffer.from(b64, "base64");
  fs.writeFileSync(path.join(outDir, `${name}.png`), png);
  const failed = steps.filter((s) => !/:(completed|succeeded|ok)$/.test(s));
  return { file: `${name}.png`, sha256: sha256(png), evidence_id: ev.evidence_id, failed_steps: failed };
}
const artifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });

fs.mkdirSync(outDir, { recursive: true });
const indexPath = path.join(outDir, "captures.json");
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : {};
for (const shot of shots) {
  const theme = shot.theme ?? "dark";
  const q = new URLSearchParams({ oc_scenario: shot.conductor.scenario ?? "populated", oc_theme: theme });
  const entry = { theme, crop: shot.crop };
  if (shot.conductor.actions) entry.conductor = await capture(`conductor-${shot.name}`, `http://conductor.localhost:${C_PORT}${shot.conductor.path ?? "/"}?${q}`, theme, shot.conductor.actions);
  if (shot.ours?.actions) entry.ours = await capture(`ours-${shot.name}`, `http://127.0.0.1:${O_PORT}/`, theme, shot.ours.actions);
  if (entry.conductor && entry.ours) {
    const a = path.join(TMP, `cm-a-${shot.name}.json`);
    const b = path.join(TMP, `cm-b-${shot.name}.json`);
    fs.writeFileSync(a, JSON.stringify(artifact(fs.readFileSync(path.join(outDir, entry.conductor.file)))));
    fs.writeFileSync(b, JSON.stringify(artifact(fs.readFileSync(path.join(outDir, entry.ours.file)))));
    const cmp = await rea(["compare-web-screenshots", a, b, "--channel-threshold", "24", "--format", "json"]);
    const n = cmp.normalized_result ?? cmp;
    entry.compare_t24 = { evidence_id: cmp.evidence_id, changed_pixel_ratio: n.changed_pixel_ratio ?? n.changed_ratio, changed_bounds: n.changed_bounds ?? n.bounding_box };
    const crop = (shot.crop ?? [0, 0, 1440, 900]).join(",");
    const sbsQ = new URLSearchParams({ left: entry.conductor.file, right: entry.ours.file, crop });
    const [, , w, h] = shot.crop ?? [0, 0, 1440, 900];
    entry.sbs = await capture(`sbs-${shot.name}`, `http://127.0.0.1:${O_PORT}/__sbs?${sbsQ}`, "light", [], { width: w * 2 + 48, height: h + 60 });
  }
  index[shot.name] = entry;
  console.log(shot.name, JSON.stringify({ c: entry.conductor?.failed_steps, o: entry.ours?.failed_steps, cmp: entry.compare_t24?.changed_pixel_ratio }));
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
conductor.kill();
ours.close();
