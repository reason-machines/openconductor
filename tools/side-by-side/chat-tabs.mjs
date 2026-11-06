// Side-by-side evidence for the chat area on one shared fixture (UI map states
// workspace-chat, workspace-tool-calls, menu-chat-tab, menu-model-picker,
// dialog-rename-chat and the Review button's "Edit before sending" menu,
// menu-review-edit): Conductor 0.87.6's extracted frontend
// (tools/screens harness, Tauri IPC mocked, the "lisbon" workspace) and
// OpenConductor's built frontend (dist/, tests/e2e/right-panel-fixture.mjs's
// fake backend with the same repos, workspaces and lisbon turn), both driven
// by REA capture-browser-scenario at the UI map's size (1280x820, dark).
//
//   npm run build && (cd tools/screens && npm ci) && DIST_REF=<decoded Conductor dist> TMPDIR=/tmp/t \
//     UIMAP_RECORD=parity/ui-map/side-by-side.json node tools/side-by-side/chat-tabs.mjs <out-dir> [state ...]
//
// Writes <out>/{ref,oc}-<state>.png and <out>/captures.json; with UIMAP_RECORD
// each pair is scored with REA compare-web-screenshots at channel thresholds 0
// and 24 and recorded under its UI map state id (tools/ui-map/README.md), and
// the pair is composed into parity/side-by-side/chat-tabs-<state>.png.
//
// The OpenConductor workspace chat carries Conductor's session title for the
// same chat ("Fix login redirect loop", tools/screens/seed-data.js) as its
// stored chat title, so both tabs read the same.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, WT, fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";
import { LISBON, lisbonBlocks } from "../chat/lisbon.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const REF_PORT = Number(process.env.REF_PORT ?? 4357);
const OC_PORT = Number(process.env.OC_PORT ?? 4358);
const DIST_REF = path.resolve(process.env.DIST_REF ?? path.join(repoRoot, ".rea-work/dist"));
const DIST_OC = path.resolve(repoRoot, "dist");
const VIEWPORT = { width: 1280, height: 820 };
const RECORD = process.env.UIMAP_RECORD ? path.resolve(process.env.UIMAP_RECORD) : null;
const tmp = process.env.TMPDIR ?? "/tmp";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const css = (selector) => ({ kind: "css", selector });
const right = (selector) => ({ locator: css(selector), button: "right" });

// The repos and workspaces of tools/screens/seed-data.js's populated scenario, lisbon open.
const ws = (id, name, branch, path) => ({ id, name, branch, path: path ?? `/Users/demo/code/${name}` });
const SHELL = {
  repos: [
    { id: "r1", name: "tide-web", path: "/Users/demo/code/tide-web", defaultBranch: "main", workspaces: [ws("w1", "lisbon", "ada/fix-login-redirect", WT), ws("w2", "osaka", "ada/dark-mode-tokens"), ws("w3", "quito", "ada/settings-search")] },
    { id: "r2", name: "tide-api", path: "/Users/demo/code/tide-api", defaultBranch: "main", workspaces: [ws("w4", "tallinn", "ada/rate-limit-headers"), ws("w5", "accra", "ada/pagination-cursor")] },
    { id: "r3", name: "dotfiles", path: "/Users/demo/code/dotfiles", defaultBranch: "main", workspaces: [ws("w6", "bergen", "ada/zsh-prompt")] },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "w1" },
};
const at = (s) => new Date(LISBON.startedAt + s * 1000).toISOString();
const turn = { status: "completed", startedAt: at(0), endedAt: at(LISBON.durationSeconds) };
const MESSAGES = [
  { id: "w1:t1:user", sessionId: "w1", turnId: "w1:t1", role: "user", createdAt: at(0), blocks: [{ type: "text", text: LISBON.prompt }], turn },
  { id: "w1:t1:assistant", sessionId: "w1", turnId: "w1:t1", role: "assistant", createdAt: at(2), blocks: lisbonBlocks("claude") },
].map((m) => JSON.stringify(m));

/** Runs in the page after fakeBackend: the lisbon transcript and its chat title. */
function extras({ messages, chatTitle }) {
  const inner = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "chat_messages_load") return { messages: args.chatId === "w1" ? messages : [], agentSessionId: null };
    if (cmd === "db_list_workspaces") return (await inner(cmd, args)).map((w) => (w.id === "w1" ? { ...w, chatTitle } : w));
    if (["local_storage_get_entry", "db_set_chat_unread", "db_open_chat_tab", "checkpoint_exists", "session_statuses"].includes(cmd)) return cmd === "local_storage_get_entry" ? null : cmd === "session_statuses" ? [] : cmd === "checkpoint_exists" ? false : undefined;
    if (cmd === "local_storage_set_entry") return { success: true };
    return inner(cmd, args);
  };
}

const LISBON_REF = [css("text=tide-web"), css("text=Ada/fix login redirect")];
const REF_TAB = right("[role=tab][aria-label^='Close chat']");
const OC_TAB = right(".main-tabs [role=tab]");
const STATES = {
  "workspace-chat": { ref: LISBON_REF, oc: [] },
  "workspace-tool-calls": { ref: [...LISBON_REF, css("text=4 tool calls, 2 messages")], oc: [css("text=4 tool calls, 2 messages")] },
  "menu-chat-tab": { ref: [...LISBON_REF, REF_TAB], oc: [OC_TAB] },
  "menu-model-picker": { ref: [...LISBON_REF, css("text=Opus 5 >> nth=-1")], oc: [css(".composer .oc-model-chip")] },
  "dialog-rename-chat": { ref: [...LISBON_REF, REF_TAB, css("[role=menuitem] >> text=Rename chat")], oc: [OC_TAB, css("[role=menuitem] >> text=Rename chat")] },
  "menu-review-edit": { ref: [...LISBON_REF, right("button:has-text('Review') >> nth=0")], oc: [right(".review-button")] },
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serveOc() {
  const init = `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES })});(${extras})(${JSON.stringify({ messages: MESSAGES, chatTitle: "Fix login redirect loop" })});`;
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

function capture(out, name, url, clicks) {
  const actions = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 5000 }];
  clicks.forEach((c, i) => {
    const click = c.kind ? { locator: c } : c;
    actions.push({ step_id: `c${i}`, action: "click", ...click, timeout_ms: 8000 });
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
  const file = path.join(tmp, `chat-tabs-${name}.json`);
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
  const fa = path.join(tmp, `chat-tabs-a-${name}.json`);
  const fb = path.join(tmp, `chat-tabs-b-${name}.json`);
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
  const [outArg = ".oc-tmp/chat-tabs", ...only] = process.argv.slice(2);
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  // REA runs synchronously, so each page server is its own process.
  const ocServer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve-oc"], { stdio: ["ignore", "ignore", "inherit"] });
  const refServer = spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], {
    env: { ...process.env, PORT: String(REF_PORT), DIST: DIST_REF, LOG_DIR: path.join(tmp, "chat-tabs-ipc") },
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
        const { png: refPng, ...ref } = capture(out, `ref-${state}`, `http://conductor.localhost:${REF_PORT}/?oc_scenario=populated&oc_theme=dark`, spec.ref);
        const { png: ocPng, ...oc } = capture(out, `oc-${state}`, `http://localhost:${OC_PORT}/`, spec.oc);
        manifest[state] = { ref: { evidence_id: ref.evidence_id, png_sha256: ref.png_sha256 }, oc: { evidence_id: oc.evidence_id, png_sha256: oc.png_sha256 } };
        let line = `${state}: ref ${ref.evidence_id} | oc ${oc.evidence_id}`;
        if (RECORD) {
          const image = `chat-tabs-${state}.png`;
          spawnSync("python3", [path.join(here, "compose_pair.py"), path.join(out, `ref-${state}.png`), path.join(out, `oc-${state}.png`), path.join(repoRoot, "parity/side-by-side", image)], { stdio: "inherit" });
          const cmp = compare(state, refPng, ocPng);
          record.states[state] = {
            lane: "tools/side-by-side/chat-tabs.mjs: REA capture-browser-scenario of Conductor's extracted frontend (tools/screens harness) and of OpenConductor's built frontend (dist/, Tauri IPC mocked) in Chromium",
            openconductor_commit: head,
            viewport: VIEWPORT,
            image: `side-by-side/${image}`,
            supersedes_oc_png_sha256: lane[state]?.png_sha256 ?? null,
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
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify({ tool: "rea capture-browser-scenario", viewport: VIEWPORT, theme: "dark", captures: manifest }, null, 1) + "\n");
    if (RECORD) fs.writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
    refServer.kill();
    ocServer.kill();
  }
  process.exit(failures ? 1 : 0);
}
