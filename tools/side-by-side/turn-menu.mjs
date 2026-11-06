// Side-by-side evidence for the chat turn footer's "Copy final message" button and
// "Show message actions" menu: Conductor 0.87.6's extracted frontend (tools/screens
// harness, Tauri IPC mocked, the "lisbon" transcript) and OpenConductor's <Transcript>
// with the same turn (tools/chat/transcript-fixture.html), both captured by REA
// capture-browser-scenario at 1280x820, dark, menu closed and open.
//
//   (cd tools/screens && npm ci) && npm ci
//   DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t node tools/side-by-side/turn-menu.mjs <out-dir>
//
// Writes <out>/{ref,oc}-{closed,open}.png and <out>/captures.json (REA Evidence ids and
// the menu's items as each side's DOM has them). Compose with compose_pair.py.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const out = path.resolve(process.argv[2] ?? ".oc-tmp/turn-menu");
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4347);
const OC_PORT = Number(process.env.OC_PORT ?? 4348);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const tmp = process.env.TMPDIR ?? "/tmp";
const DIST_OC = path.join(tmp, "oc-turn-menu-fixture");
const VIEWPORT = { width: 1280, height: 820, device_scale_factor: 1 };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const css = (selector) => ({ kind: "css", selector });
const click = (step_id, selector) => ({ step_id, action: "click", locator: css(selector), timeout_ms: 8000 });
const wait = (step_id, duration_ms) => ({ step_id, action: "wait_for_timeout", duration_ms });

// Conductor: open the "Ada/fix login redirect" workspace (tools/screens/shots/02-workspace-chat.json).
const refOpen = [wait("settle", 6000), click("expand_tide_web", "text=tide-web"), click("open_workspace", "text=Ada/fix login redirect"), wait("load", 3000)];
const SIDES = {
  ref: { url: `http://conductor.localhost:${REF_PORT}/?oc_scenario=populated&oc_theme=dark`, setup: refOpen },
  oc: { url: `http://127.0.0.1:${OC_PORT}/tools/chat/transcript-fixture.html?theme=dark&agent=claude`, setup: [wait("settle", 1200)] },
};
const TRIGGER = '[aria-label="Show message actions"]';
const STATES = {
  closed: [],
  open: [click("open_menu", TRIGGER), wait("menu", 500)],
};

await build({ root: repoRoot, logLevel: "error", build: { outDir: DIST_OC, emptyOutDir: true, rollupOptions: { input: path.join(repoRoot, "tools/chat/transcript-fixture.html") } } });
const servers = [
  spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "turn-menu-ipc") }, stdio: ["ignore", "ignore", "inherit"] }),
  spawn(process.execPath, [path.join(repoRoot, "node_modules/vite/bin/vite.js"), "preview", "--outDir", DIST_OC, "--port", String(OC_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] }),
];
for (const url of [`http://localhost:${REF_PORT}/__health`, `http://127.0.0.1:${OC_PORT}/tools/chat/transcript-fixture.html`]) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}
function findString(o, key) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === key && typeof v === "string") return v;
    const r = findString(v, key);
    if (r) return r;
  }
}
/** The open menu's items and the trigger's attributes, read from the captured DOM. */
function menuFacts(html = "") {
  const items = [...html.matchAll(/role="menuitem"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
  const trigger = html.match(/<button[^>]*aria-label="Show message actions"[^>]*>/)?.[0] ?? null;
  return { items, trigger };
}

fs.mkdirSync(out, { recursive: true });
const captures = {};
try {
  for (const [side, cfg] of Object.entries(SIDES)) {
    for (const [state, actions] of Object.entries(STATES)) {
      const name = `${side}-${state}`;
      const input = {
        browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
        start_url: { url: cfg.url },
        environment: { viewport: VIEWPORT, color_scheme: "dark", locale: "en-US", timezone: "UTC", reduced_motion: "reduce" },
        actions: [...cfg.setup, ...actions, wait("final_settle", 400)],
        capture: { at_end: ["screenshot", "url", "dom"], events: ["page-errors"] },
      };
      const file = path.join(tmp, `rea-turn-menu-${name}.json`);
      fs.writeFileSync(file, JSON.stringify(input));
      const p = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 29, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
      let ev;
      try {
        ev = JSON.parse(p.stdout);
      } catch {
        throw new Error(`${name}: REA failed (exit ${p.status}): ${(p.stderr || p.stdout).slice(0, 1500)}`);
      }
      const last = ev.normalized_result?.steps?.at(-1)?.artifacts;
      const b64 = findBase64(last?.screenshot) ?? findBase64(ev.normalized_result);
      if (!b64) throw new Error(`${name}: no screenshot: ${JSON.stringify(ev).slice(0, 1500)}`);
      const png = Buffer.from(b64, "base64");
      fs.writeFileSync(path.join(out, `${name}.png`), png);
      const dom = findString(last?.dom, "html") ?? findString(last?.dom, "content") ?? findString(last?.dom, "text");
      captures[name] = { evidence_id: ev.evidence_id, png_sha256: sha256(png), ...menuFacts(dom), page_errors: (JSON.stringify(ev.normalized_result?.events ?? []).match(/"page-error/g) || []).length };
      console.log(name, captures[name].evidence_id, JSON.stringify(captures[name].items));
    }
  }
} finally {
  for (const s of servers) s.kill();
}
fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify({ tool: "rea-agents capture-browser-scenario", viewport: VIEWPORT, captures }, null, 2) + "\n");
