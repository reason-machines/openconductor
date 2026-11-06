import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT ?? 4398);
const out = path.resolve(process.argv[2] ?? ".oc-tmp/changes-panel");
const reference = process.env.REF_URL ?? "http://conductor.localhost:4397/?oc_scenario=populated&oc_theme=dark";
const rea = process.env.REA ?? "rea";
const seed = fs.readFileSync("tools/sidebar-screens/seed.js", "utf8");
const backend = fs.readFileSync("tools/side-by-side/git-review-backend.js", "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(root, "dist", decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "dist/index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html") && !url.pathname.startsWith("/__e2e")) body = body.toString().replace("<head>", `<head><script>${seed}</script><script>${backend}</script>`);
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  res.end(body);
});

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(rea, args, { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => { stdout += b; });
    child.stderr.on("data", (b) => { stderr += b; });
    child.on("error", reject);
    child.on("exit", (code) => {
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`${code}: ${(stderr || stdout).slice(0, 600)}`)); }
    });
  });
}
const click = (selector) => ({ action: "click", locator: { kind: "css", selector }, timeout_ms: 5000 });
const settle = { action: "wait_for_timeout", duration_ms: 1200 };
const refStart = [click("text=tide-web"), settle, click("text=Ada/fix login redirect"), settle];
const specs = {
  flat: { ref: [], oc: [] },
  tree: { ref: [click('[aria-label="Show folder hierarchy"]')], oc: [click('[aria-label="Show folder hierarchy"]')] },
  collapsed: { ref: [click('[aria-label="Show folder hierarchy"]'), settle, click('button:has-text("src / lib")')], oc: [click('[aria-label="Show folder hierarchy"]'), settle, click('button:has-text("src / lib")')] },
  options: { ref: [click('button:has(svg.lucide-ellipsis-vertical)')], oc: [click('[aria-label="Changes options"]')] },
  "diff-unified": { ref: [click('text=auth.ts >> nth=-1')], oc: [click("button.oc-change[title='Open src/lib/auth.ts']")] },
  "diff-split": { ref: [click('text=auth.ts >> nth=-1'), settle, click("role=button[name='Split view']")], oc: [click("button.oc-change[title='Open src/lib/auth.ts']"), settle, click("role=button[name='Split view']")] },
  "diff-entire-file": { ref: [click('text=auth.ts >> nth=-1'), settle, click("role=button[name='Entire file']")], oc: [click("button.oc-change[title='Open src/lib/auth.ts']"), settle, click("role=button[name='Entire file']")] },
};

async function capture(side, state, steps) {
  const ready = { action: "wait_for", locator: { kind: "css", selector: "text=2 files changed" }, state: "visible", timeout_ms: 10000 };
  const actions = [{ action: "wait_for_timeout", duration_ms: 5000 }, ...(side === "ref" ? refStart : []), ready, ...steps, settle].map((a, i) => ({ step_id: `s${i}`, ...a }));
  const input = {
    browser: { mode: "launch", executable_path: "/usr/bin/chromium", headless: true },
    start_url: { url: side === "ref" ? reference : `http://localhost:${port}/?oc_scenario=populated&oc_theme=dark` },
    environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "dom"], events: ["page-errors"] },
  };
  const inputFile = path.join(out, `${side}-${state}-input.json`);
  fs.writeFileSync(inputFile, JSON.stringify(input));
  const ev = await run(["capture-browser-scenario", inputFile, "--format", "json"]);
  const nr = ev.normalized_result;
  const failed = nr?.steps?.filter((s) => s.status === "failed") ?? [];
  if (failed.length) throw new Error(`${side}-${state}: ${JSON.stringify(failed[0]).slice(0, 500)}`);
  const artifacts = nr?.steps?.at(-1)?.artifacts;
  if (artifacts?.screenshot?.state !== "captured") throw new Error(`${side}-${state}: ${JSON.stringify(ev).slice(0, 600)}`);
  const screenshot = artifacts.screenshot.value;
  fs.writeFileSync(path.join(out, `${side}-${state}.png`), Buffer.from(screenshot.data_base64, "base64"));
  const dom = artifacts.dom?.value?.text ?? artifacts.dom?.value ?? "";
  const domText = typeof dom === "string" ? dom : JSON.stringify(dom);
  if (!domText.includes("files changed") || !domText.includes("auth.test.ts")) throw new Error(`${side}-${state}: not the populated Changes screen`);
  fs.writeFileSync(path.join(out, `${side}-${state}.dom.txt`), domText);
  const artifactPath = path.join(out, `${side}-${state}-artifact.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(screenshot));
  return { evidence_id: ev.evidence_id, png_sha256: createHash("sha256").update(Buffer.from(screenshot.data_base64, "base64")).digest("hex"), artifactPath };
}
async function prove() {
  const report = { source_commit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), build_index_sha256: createHash("sha256").update(fs.readFileSync("dist/index.html")).digest("hex") };
  for (const [state, spec] of Object.entries(specs)) {
    if (process.env.STATES && !process.env.STATES.split(",").includes(state)) continue;
    try {
      const ref = await capture("ref", state, spec.ref);
      const oc = await capture("oc", state, spec.oc);
      const cmp = await run(["compare-web-screenshots", ref.artifactPath, oc.artifactPath, "--channel-threshold", "24", "--format", "json"]);
      const nr = cmp.normalized_result ?? cmp;
      report[state] = { reference: ref, openconductor: oc, compare: { evidence_id: cmp.evidence_id, changed_pixels: nr.changed_pixels, total_pixels: nr.total_pixels, changed_ratio: nr.changed_ratio } };
      console.log(`${state}: t24 ${(nr.changed_ratio * 100).toFixed(2)}%, ref ${ref.evidence_id}, oc ${oc.evidence_id}`);
    } catch (e) { report[state] = { error: String(e) }; console.error(String(e)); }
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  console.log("Changes panel proof finished");
}
const refServer = spawn(process.execPath, ["tools/screens/server.mjs"], {
  env: { ...process.env, DIST: process.env.DIST_REF ?? "/home/runner/conductor-ref/dist", PORT: "4397", HOST: "127.0.0.1" },
  stdio: "inherit",
});
process.on("exit", () => refServer.kill());
server.listen(port, "0.0.0.0", () => {
  console.log(`Changes panel preview on ${port}`);
  if (process.env.E2E === "1") {
    const tests = spawn(process.execPath, ["--test", "tests/e2e/right-panel.e2e.mjs"], { env: { ...process.env, OC_E2E_BASE: `http://localhost:${port}/__e2e` }, stdio: "inherit" });
    tests.on("exit", (code) => console.log(`Right-panel e2e exited ${code}`));
  }
  if (process.env.CAPTURE === "1") prove().catch(console.error);
});
