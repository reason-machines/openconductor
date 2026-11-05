// Screen check for the chat and diff areas: captures OpenConductor's Vite build
// with REA capture-browser-scenario in the same setup as evidence/screens
// (Chromium, 1440x900, scale 1, en-US, UTC), then compares each capture with its
// Conductor reference using REA compare-web-screenshots at thresholds 0 and 24.
//
//   npm ci && npx vite build
//   TMPDIR=/tmp/t node tools/parity_chat_diff_pr_screens.mjs
//
// Writes evidence/parity/chat-diff-pr/screens/ours-*.png and screens.json.
// Seed data is synthetic (one repo, one workspace) and is injected into
// localStorage before the app boots. Verifier tooling only, no feature code.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repoRoot, "dist");
const outDir = path.join(repoRoot, "evidence/parity/chat-diff-pr/screens");
const refDir = path.join(repoRoot, "evidence/screens");
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4329);
const TMP = process.env.TMPDIR ?? "/tmp";

const SEED = {
  repos: [
    {
      id: "r1",
      name: "tide-web",
      path: "/Users/ada/src/tide-web",
      defaultBranch: "main",
      workspaces: [
        {
          id: "w1",
          name: "lisbon",
          branch: "ada/fix-login-redirect",
          status: "needs-review",
          diff: { added: 15, removed: 1 },
          createdAt: 1762300000000,
          path: "/Users/ada/conductor/workspaces/tide-web/lisbon",
        },
      ],
    },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};
const seedScript = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;

const sendMessage = [
  { step_id: "type_message", action: "fill", locator: { kind: "css", selector: ".composer textarea" }, value: { source: "literal", value: "Signed-in users with an expired session loop between the login page and the dashboard. Find out why and fix it." } },
  { step_id: "send", action: "press", locator: { kind: "css", selector: ".composer textarea" }, key: "Enter", timeout_ms: 3000 },
];
const SHOTS = [
  { name: "ours-chat--transcript--dark", theme: "dark", ref: "chat--transcript-collapsed-tools--dark.png", actions: sendMessage },
  { name: "ours-chat--transcript--light", theme: "light", ref: "chat--transcript-collapsed-tools--light.png", actions: sendMessage },
  { name: "ours-diff--file-unified--dark", theme: "dark", ref: "diff--file-unified--dark.png", actions: [] },
  { name: "ours-diff--file-unified--light", theme: "light", ref: "diff--file-unified--light.png", actions: [] },
  {
    name: "ours-diff--file-split--dark",
    theme: "dark",
    ref: "diff--file-split--dark.png",
    actions: [{ step_id: "split", action: "click", locator: { kind: "css", selector: ".oc-diff-toolbar button:has-text('Split')" }, timeout_ms: 5000 }],
  },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seedScript}`));
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const artifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });
function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}
fs.mkdirSync(outDir, { recursive: true });
const results = [];
for (const shot of SHOTS) {
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://127.0.0.1:${PORT}/` },
    environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: shot.theme, locale: "en-US", timezone: "UTC" },
    actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 2500 }, ...shot.actions, { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 1200 }],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(TMP, `rea-ours-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const cap = await runAsync(["capture-browser-scenario", inputFile, "--format", "json"]);
  const ev = JSON.parse(cap);
  const png = Buffer.from(findBase64(ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot) ?? findBase64(ev.normalized_result), "base64");
  fs.writeFileSync(path.join(outDir, `${shot.name}.png`), png);
  const ref = fs.readFileSync(path.join(refDir, shot.ref));
  const compare = {};
  for (const t of [0, 24]) {
    const a = path.join(TMP, `a-${shot.name}.json`);
    const b = path.join(TMP, `b-${shot.name}.json`);
    fs.writeFileSync(a, JSON.stringify(artifact(ref)));
    fs.writeFileSync(b, JSON.stringify(artifact(png)));
    const out = JSON.parse(await runAsync(["compare-web-screenshots", a, b, "--channel-threshold", String(t), "--format", "json"]));
    const n = out.normalized_result ?? out;
    compare[`threshold_${t}`] = { evidence_id: out.evidence_id, ...pick(n) };
  }
  results.push({ name: shot.name, file: `screens/${shot.name}.png`, reference: `evidence/screens/${shot.ref}`, theme: shot.theme, png_sha256: sha256(png), capture_evidence_id: ev.evidence_id, page_errors: JSON.stringify(ev.normalized_result?.events ?? []).split('"page-error').length - 1, compare });
  console.log(shot.name, JSON.stringify(compare));
}
server.close();
fs.writeFileSync(
  path.join(outDir, "screens.json"),
  JSON.stringify({ tool: "rea-agents 6.8.0: capture-browser-scenario + compare-web-screenshots", browser: "Chromium headless, 1440x900, scale 1, en-US, UTC", results }, null, 2) + "\n",
);

function pick(n) {
  const o = {};
  for (const k of ["changed_pixels", "total_pixels", "changed_ratio", "changed_pixel_ratio", "identical", "dimensions_match", "bounding_box", "changed_bounds"]) if (k in n) o[k] = n[k];
  if (Object.keys(o).length === 0) o.raw = JSON.stringify(n).slice(0, 600);
  return o;
}
function runAsync(args) {
  return new Promise((resolve, reject) => {
    {
      const p = spawn(REA, args, { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (out.trim().startsWith("{") ? resolve(out) : reject(new Error(`rea ${args[0]} exit ${code}: ${(err || out).slice(0, 1500)}`))));
    }
  });
}
