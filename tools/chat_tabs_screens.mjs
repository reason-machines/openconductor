// Chat tab strip side-by-side: captures OpenConductor's Vite build with REA
// capture-browser-scenario in the setup Conductor's references use (Chromium
// headless, 1440x900, scale 1, en-US, UTC, dark), in three states: the "+"
// tooltip (keyboard focus), after a click on "+", and after ⌘T. Conductor's
// side comes from tools/screens/shots/08-chat-tabs.json (same steps against
// Conductor's extracted frontend). Writes parity/side-by-side/chat-tabs/.
//
//   npx vite build --outDir /tmp/oc-dist
//   DIST=/tmp/oc-dist TMPDIR=/tmp/t node tools/chat_tabs_screens.mjs
//
// Seed data is synthetic: one repo, one workspace. Verifier tooling only.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST ?? path.join(repoRoot, "dist"));
const outDir = path.join(repoRoot, "parity/side-by-side/chat-tabs/openconductor");
const REA = process.env.REA ?? path.join(process.env.HOME, ".npm-global/bin/rea");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4393);
const TMP = process.env.TMPDIR ?? "/tmp";

const SEED = {
  repos: [
    {
      id: "r1",
      name: "tide-web",
      path: "/Users/ada/src/tide-web",
      defaultBranch: "main",
      workspaces: [
        { id: "w1", name: "Move colors to design tokens", directoryName: "osaka", branch: "ada/dark-mode-tokens", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1762300000000, path: "/Users/ada/conductor/workspaces/tide-web/osaka" },
      ],
    },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
  sidebarVisible: true,
};
const seedScript = `<script>localStorage.setItem("openconductor.shell.v1", ${JSON.stringify(JSON.stringify(SEED))});</script>`;

const pause = (ms, step) => ({ step_id: step, action: "wait_for_timeout", duration_ms: ms });
const firstTab = ".main-tabs [role=tab]";
const SHOTS = [
  {
    name: "tooltip",
    actions: [
      { step_id: "focus_tab", action: "click", locator: { kind: "css", selector: firstTab }, timeout_ms: 5000 },
      { step_id: "tab_to_plus", action: "press", locator: { kind: "css", selector: firstTab }, key: "Tab", timeout_ms: 5000 },
    ],
  },
  { name: "plus", actions: [{ step_id: "click_plus", action: "click", locator: { kind: "css", selector: ".main-tab-new-button" }, timeout_ms: 5000 }] },
  { name: "cmdt", actions: [{ step_id: "cmd_t", action: "press", locator: { kind: "css", selector: "body" }, key: "Meta+t", timeout_ms: 5000 }] },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) body = Buffer.from(body.toString().replace("<head>", `<head>${seedScript}`));
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
fs.mkdirSync(outDir, { recursive: true });

function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}
const evidence = {};
for (const shot of SHOTS) {
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://127.0.0.1:${PORT}/` },
    environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions: [pause(2500, "settle"), ...shot.actions, pause(1500, "final_settle")],
    capture: { at_end: ["screenshot", "url"], events: ["console", "page-errors"] },
  };
  const inputFile = path.join(TMP, `rea-chat-tabs-${shot.name}.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const ev = JSON.parse(await run(["capture-browser-scenario", inputFile, "--format", "json"]));
  const failed = (ev.normalized_result?.steps ?? []).find((s) => s.status === "failed");
  if (failed) throw new Error(`${shot.name}: step ${failed.step_id} failed`);
  fs.writeFileSync(path.join(outDir, `${shot.name}.png`), Buffer.from(findBase64(ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot) ?? findBase64(ev.normalized_result), "base64"));
  evidence[shot.name] = ev.evidence_id;
  console.log(shot.name, ev.evidence_id);
}
server.close();
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(REA, args, { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (out.trim().startsWith("{") ? resolve(out) : reject(new Error(`rea ${args[0]} exit ${code}: ${(err || out).slice(0, 1500)}`))));
  });
}
