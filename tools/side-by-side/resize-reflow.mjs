// OpenConductor side of parity/side-by-side/resize-reflow: the built frontend
// (dist/) in Chromium on the right panel's fake Tauri backend
// (tests/e2e/right-panel-fixture.mjs), with Conductor's "lisbon" turn stored
// three times in the workspace chat (tools/chat/lisbon.ts) so the message list
// runs under the composer. At each window width it saves oc-<width>.png and
// measures the same boxes tools/side-by-side/resize-reflow-conductor.mjs
// measures in Conductor, then checks them against Conductor's rules:
//   - the sidebar keeps its width; main column and right panel split the rest 2:1
//   - each turn is min(896, column) wide and centred; below 896 it keeps a 16px right gutter
//   - the composer is min(896, column - 32) wide, centred on the same axis as the turns
//   - nothing overflows sideways or is drawn past the window edge, and the composer stays inside the main column
//
//   npm run build && TMPDIR=/tmp/t node tools/side-by-side/resize-reflow.mjs [outDir]
//
// Prints the measurements as JSON and exits 1 when a check fails.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { FILES, SHELL, fakeBackend } from "../../tests/e2e/right-panel-fixture.mjs";
import { LISBON, lisbonBlocks } from "../chat/lisbon.ts";

const out = resolve(process.argv[2] ?? "parity/side-by-side/resize-reflow");
mkdirSync(out, { recursive: true });
const WIDTHS = (process.env.WIDTHS ?? "900,1280,1600,2100").split(",").map(Number);
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(
  (p) => p && existsSync(p),
);
if (!existsSync("dist/index.html")) throw new Error("dist/ is missing; run `npm run build` first");

// chat_messages_load rows (persist.ts `full_message`): the lisbon turn, three times.
const chatId = SHELL.selection.workspaceId;
const rows = [];
for (let i = 0; i < 3; i++) {
  const turnId = `${chatId}:t${i}`;
  const start = LISBON.startedAt + i * 600_000;
  const at = (s) => new Date(start + s * 1000).toISOString();
  const turn = { status: "completed", startedAt: at(0), endedAt: at(LISBON.durationSeconds) };
  rows.push(JSON.stringify({ id: `${turnId}:user`, sessionId: chatId, turnId, role: "user", createdAt: at(0), blocks: [{ type: "text", text: LISBON.prompt }], turn }));
  rows.push(JSON.stringify({ id: `${turnId}:assistant`, sessionId: chatId, turnId, role: "assistant", createdAt: at(2), blocks: lisbonBlocks("claude") }));
}

/** Runs in the page after fakeBackend: answers the chat's own commands. */
function chatBackend(rows) {
  const inner = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "chat_messages_load") return { messages: rows, agentSessionId: null };
    if (cmd === "chat_messages_save") return;
    return inner(cmd, args);
  };
}

/** Runs in the page: boxes of the layout's parts, rounded to the pixel. */
function measure() {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const list = document.querySelector(".chat-scroll:not([hidden])");
  const turns = [...document.querySelectorAll(".oc-turn")];
  // Elements drawn past the window's right edge that no scrolling or clipping ancestor hides.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
      if (getComputedStyle(p).overflowX !== "visible" && p.getBoundingClientRect().right <= innerWidth + 0.5) return true;
    return false;
  };
  const escaping = [...document.querySelectorAll(".workspace *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 0.5 && !clipped(el);
    })
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
  return {
    window: { w: innerWidth, h: innerHeight },
    sidebar: box(document.querySelector(".sidebar")),
    main: box(document.querySelector(".chat")),
    rightPanel: box(document.querySelector(".ws-right")),
    list: box(list),
    listClientWidth: list?.clientWidth ?? null,
    turns: turns.map(box),
    turnBodies: turns.map((t) => box(t.querySelector(".oc-turn-body"))),
    composerAnchor: box(document.querySelector(".oc-composer-anchor")),
    composer: box(document.querySelector(".composer.oc-composer")),
    horizontalOverflow: { list: list ? list.scrollWidth > list.clientWidth : null, page: document.documentElement.scrollWidth > innerWidth },
    escaping: escaping.slice(0, 10),
  };
}

/** Conductor's rules (resize-reflow-conductor.mjs measurements), as failures for one width. */
function check(m) {
  const fail = [];
  const near = (a, b, what, tol = 1) => Math.abs(a - b) > tol && fail.push(`${what}: ${a} != ${b}`);
  near(m.sidebar.w, 256, "sidebar width");
  const rest = m.window.w - m.sidebar.w;
  near(m.rightPanel.w, Math.round(rest / 3), "right panel width (a third of the rest)", 2);
  near(m.main.x + m.main.w, m.rightPanel.x, "main column ends where the right panel starts", 1);
  const col = m.listClientWidth;
  const listCentre = m.list.x + col / 2;
  for (const [i, t] of m.turns.entries()) {
    near(t.w, Math.min(896, col), `turn ${i} width`);
    if (col >= 896) near(t.x + t.w / 2, listCentre, `turn ${i} centre`);
    else near(m.turnBodies[i].x + m.turnBodies[i].w, m.list.x + col - 16, `turn ${i} body right edge (16px gutter)`);
  }
  const c = m.composer;
  near(c.w, Math.min(896, m.main.w - 32), "composer width");
  near(c.x + c.w / 2, m.main.x + m.main.w / 2, "composer centre on the column", 1);
  if (m.turns[0] && col >= 896) near(c.x, m.turns[0].x, "composer left edge = turn left edge");
  if (m.turnBodies[0] && col < 896) near(c.x + c.w, m.turnBodies[0].x + m.turnBodies[0].w, "composer right edge = turn body right edge");
  if (c.x < m.main.x || c.x + c.w > m.main.x + m.main.w) fail.push("composer leaves the main column");
  if (m.horizontalOverflow.list || m.horizontalOverflow.page) fail.push(`horizontal overflow ${JSON.stringify(m.horizontalOverflow)}`);
  if (m.escaping.length) fail.push(`drawn past the window edge: ${m.escaping.join(", ")}`);
  near(m.rightPanel.x + m.rightPanel.w, m.window.w, "right panel ends at the window edge");
  return fail;
}

const server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "error" });
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`[${width}] pageerror: ${e.message}`));
    await page.addInitScript(fakeBackend, { shell: SHELL, files: FILES });
    await page.addInitScript(chatBackend, rows);
    await page.goto(base + "/");
    await page.locator(".oc-turn").first().waitFor();
    await page.locator(".composer.oc-composer").waitFor();
    await page.waitForTimeout(800);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${out}/oc-${width}.png` });
    const m = { width, ...(await page.evaluate(measure)) };
    m.failures = check(m);
    results.push(m);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
writeFileSync(`${out}/oc-measure.json`, JSON.stringify(results, null, 1) + "\n");
for (const r of results) console.log(`${r.width}px: ${r.failures.length ? r.failures.join("; ") : "ok"}`);
if (results.some((r) => r.failures.length)) process.exit(1);
