// Composer screen check: captures OpenConductor's Vite build in the composer
// states Conductor's references show (tools/screens/shots/07-composer.json plus
// the chat and model-picker shots in evidence/screens), with REA
// capture-browser-scenario in the same setup (Chromium, 1440x900, scale 1,
// en-US, UTC), then compares each with its Conductor reference using REA
// compare-web-screenshots on the full frame and on the composer crop.
//
//   npm ci && npx vite build
//   DEMO_OUT=/tmp/t/demo npx vite build -c tools/composer/vite.demo.config.ts
//   TMPDIR=/tmp/t DEMO_OUT=/tmp/t/demo node tools/composer_screens.mjs [shot ...]
//
// "demo-" shots load tools/composer/demo.html (the real Composer mounted where
// Conductor's sits, with a chosen agent's slash commands) from DEMO_OUT.
//
// Writes evidence/chat/composer/ours-*.png, crops and composer.json. Seed data
// is synthetic (one repo, one workspace with one finished turn). Verifier
// tooling only, no feature code.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repoRoot, "dist");
const outDir = path.join(repoRoot, "evidence/chat/composer");
const refDir = path.join(repoRoot, "evidence/screens");
const REA =
  process.env.REA ??
  [".npm-global/bin/rea", ".rea/node_modules/.bin/rea"].map((p) => path.join(process.env.HOME, p)).find((p) => fs.existsSync(p)) ??
  "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4331);
const DEMO = path.resolve(process.env.DEMO_OUT ?? "/tmp/oc-composer-demo");
const TMP = process.env.TMPDIR ?? "/tmp";
// The composer box in Conductor's references at 1440x900 with both side panels open
// (left 256 px sidebar, right panel from x=1045): x 272..1029, y 732..884. The crop
// adds the menus that open above it.
const CROP = { x: 256, y: 380, w: 790, h: 520 };

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

const box = ".composer [contenteditable], .composer textarea";
const fill = (value, step = "type") => ({ step_id: step, action: "fill", locator: { kind: "css", selector: box }, value: { source: "literal", value }, timeout_ms: 5000 });
const click = (selector, step) => ({ step_id: step, action: "click", locator: { kind: "css", selector }, timeout_ms: 5000 });
const pause = (ms, step = "pause") => ({ step_id: step, action: "wait_for_timeout", duration_ms: ms });

const SHOTS = [
  { name: "ours-composer--empty--dark", ref: "chat--new-empty-session--dark.png", actions: [] },
  { name: "ours-composer--typed--dark", ref: ".rea-ref/composer--typed--dark.png", actions: [fill("Also add a test for the expired-session redirect.")] },
  { name: "ours-composer--slash-menu--dark", ref: ".rea-ref/composer--slash-menu--dark.png", actions: [fill("/")] },
  { name: "ours-composer--mention-menu--dark", ref: ".rea-ref/composer--mention-menu--dark.png", actions: [fill("@")] },
  { name: "ours-composer--model-picker--dark", ref: "menu--model-picker--dark.png", actions: [click("[data-testid='composer-model-button']", "model")] },
  { name: "ours-composer--light", theme: "light", ref: "chat--transcript-collapsed-tools--light.png", actions: [] },
  // The stand-in agent works for 2.5 s after a send; capture while it runs.
  {
    name: "ours-composer--working--dark",
    ref: ".rea-ref/composer--working--dark.png",
    actions: [fill("Find out why the login redirect loops."), { step_id: "send", action: "press", locator: { kind: "css", selector: box }, key: "Enter", timeout_ms: 3000 }, pause(300)],
    finalSettle: 100,
  },
  {
    name: "ours-composer--working-typed--dark",
    ref: ".rea-ref/composer--working-typed--dark.png",
    actions: [fill("Find out why the login redirect loops."), { step_id: "send", action: "press", locator: { kind: "css", selector: box }, key: "Enter", timeout_ms: 3000 }, pause(200), fill("Then update the docs.", "type2")],
    finalSettle: 100,
  },
  { name: "demo-composer--slash-menu--dark", url: "/demo/demo.html?agent=claude", ref: ".rea-ref/composer--slash-menu--dark.png", actions: [fill("/")] },
  { name: "demo-composer--typed--dark", url: "/demo/demo.html?agent=claude", ref: ".rea-ref/composer--typed--dark.png", actions: [fill("Also add a test for the expired-session redirect.")] },
  {
    name: "demo-composer--model-picker--dark",
    url: "/demo/demo.html?agent=claude",
    ref: ".rea-ref/composer--model-picker--dark.png",
    actions: [click("[data-testid='composer-model-button']", "model")],
  },
  {
    name: "demo-composer--effort-submenu--dark",
    url: "/demo/demo.html?agent=claude",
    ref: ".rea-ref/composer--effort-submenu--dark.png",
    actions: [click("[data-testid='composer-model-button']", "model"), pause(300, "pause1"), click(".oc-model-sub > button", "effort")],
  },
  { name: "ours-composer--plus-menu--dark", ref: ".rea-ref/composer--plus-menu--dark.png", actions: [click("[aria-label='Add']", "plus")] },
  {
    name: "ours-composer--effort-submenu--dark",
    ref: ".rea-ref/composer--effort-submenu--dark.png",
    actions: [click("[data-testid='composer-model-button']", "model"), pause(300, "pause1"), click(".oc-model-sub > button", "effort")],
  },
];

const only = process.argv.slice(2);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const demo = url.pathname.startsWith("/demo/");
  const root = demo ? DEMO : dist;
  let file = path.join(root, decodeURIComponent(demo ? url.pathname.slice(5) : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, demo ? "demo.html" : "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seedScript}`));
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
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
function crop(src, dst) {
  const py = `from PIL import Image\nim=Image.open(${JSON.stringify(src)}).convert('RGB')\nim.crop((${CROP.x},${CROP.y},${CROP.x + CROP.w},${CROP.y + CROP.h})).save(${JSON.stringify(dst)})`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}
async function compare(refPng, ourPng, name) {
  const out = {};
  for (const t of [0, 24]) {
    const a = path.join(TMP, `a-${name}.json`);
    const b = path.join(TMP, `b-${name}.json`);
    fs.writeFileSync(a, JSON.stringify(artifact(refPng)));
    fs.writeFileSync(b, JSON.stringify(artifact(ourPng)));
    const res = JSON.parse(await runAsync(["compare-web-screenshots", a, b, "--channel-threshold", String(t), "--format", "json"]));
    const n = res.normalized_result ?? res;
    out[`threshold_${t}`] = { evidence_id: res.evidence_id, ...pick(n) };
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
const resultsPath = path.join(outDir, "composer.json");
const prev = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, "utf8")).results : [];
const results = new Map(prev.map((r) => [r.name, r]));
for (const shot of SHOTS.filter((s) => only.length === 0 || only.includes(s.name))) {
  const theme = shot.theme ?? "dark";
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://127.0.0.1:${PORT}${shot.url ?? "/"}` },
    environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: theme, locale: "en-US", timezone: "UTC" },
    actions: [pause(shot.url ? 1200 : 2500, "settle"), ...shot.actions, pause(shot.finalSettle ?? 1000, "final_settle")],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(TMP, `rea-ours-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const ev = JSON.parse(await runAsync(["capture-browser-scenario", inputFile, "--format", "json"]));
  const failedStep = (ev.normalized_result?.steps ?? []).find((s) => s.status === "failed");
  if (failedStep) {
    console.log(shot.name, "FAILED step", failedStep.step_id, JSON.stringify(failedStep.error ?? failedStep).slice(0, 400));
    results.set(shot.name, { name: shot.name, failed_step: failedStep.step_id });
    continue;
  }
  const png = Buffer.from(findBase64(ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot) ?? findBase64(ev.normalized_result), "base64");
  const ours = path.join(outDir, `${shot.name}.png`);
  fs.writeFileSync(ours, png);
  const refPath = shot.ref.startsWith(".rea-ref/") ? path.join(repoRoot, "evidence/chat/composer", shot.ref.slice(".rea-ref/".length)) : path.join(refDir, shot.ref);
  const ref = fs.readFileSync(refPath);
  const oursCrop = path.join(outDir, `${shot.name}.crop.png`);
  const refCrop = path.join(TMP, `${shot.name}.ref.crop.png`);
  crop(ours, oursCrop);
  crop(refPath, refCrop);
  const full = await compare(ref, png, shot.name);
  const composer = await compare(fs.readFileSync(refCrop), fs.readFileSync(oursCrop), `${shot.name}-crop`);
  results.set(shot.name, {
    name: shot.name,
    file: path.relative(repoRoot, ours),
    reference: path.relative(repoRoot, refPath),
    theme,
    png_sha256: sha256(png),
    capture_evidence_id: ev.evidence_id,
    page_errors: JSON.stringify(ev.normalized_result?.events ?? []).split('"page-error').length - 1,
    full,
    composer_crop: { rect: CROP, ...composer },
  });
  console.log(shot.name, "full", ratio(full), "crop", ratio(composer));
}
server.close();
fs.writeFileSync(
  resultsPath,
  JSON.stringify({ tool: "rea-agents 6.8.0: capture-browser-scenario + compare-web-screenshots", browser: "Chromium headless, 1440x900, scale 1, en-US, UTC", results: [...results.values()] }, null, 2) + "\n",
);

function ratio(c) {
  return Object.entries(c)
    .map(([k, v]) => `${k}=${v.changed_ratio ?? v.changed_pixel_ratio ?? JSON.stringify(v).slice(0, 120)}`)
    .join(" ");
}
function pick(n) {
  const o = {};
  for (const k of ["changed_pixels", "total_pixels", "changed_ratio", "changed_pixel_ratio", "identical", "dimensions_match", "bounding_box", "changed_bounds"]) if (k in n) o[k] = n[k];
  if (Object.keys(o).length === 0) o.raw = JSON.stringify(n).slice(0, 600);
  return o;
}
function runAsync(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(REA, args, { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (out.trim().startsWith("{") ? resolve(out) : reject(new Error(`rea ${args[0]} exit ${code}: ${(err || out).slice(0, 1500)}`))));
  });
}
