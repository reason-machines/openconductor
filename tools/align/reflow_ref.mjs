// Conductor side of the resize-reflow check: renders Conductor's extracted
// frontend (tools/screens harness, Tauri IPC mocked) in the "workspace-chat"
// state at several window widths, captures each with REA
// capture-browser-scenario, then measures the layout boxes in Chromium.
//
//   DIST=<conductor dist> CHROMIUM=<chromium> node tools/align/reflow_ref.mjs <out-dir> [widths...]
//
// Writes <out-dir>/ref-<width>.png (REA screenshots) and <out-dir>/ref-geometry.json.
// Needs REA (`rea` on PATH or REA=...), `npm ci` in tools/screens and playwright-core.
// Verifier tooling only; Conductor's dist is third-party code and never committed.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const here = new URL(".", import.meta.url).pathname;
const repoRoot = resolve(here, "../..");
const out = resolve(process.argv[2] ?? "reflow-ref");
const widths = process.argv.slice(3).map(Number).filter(Boolean);
const WIDTHS = widths.length ? widths : [900, 1280, 1600, 2100];
const HEIGHT = 900;
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4327);
const HOST = "conductor.localhost";
const tmp = process.env.TMPDIR ?? "/tmp";
const URL_ = `http://${HOST}:${PORT}/?oc_scenario=populated&oc_theme=dark`;
// Same steps as the workspace-chat state in tools/ui-map/states.json.
const CLICKS = ["tide-web", "Ada/fix login redirect"];

mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, [join(repoRoot, "tools/screens/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), DIST: resolve(process.env.DIST ?? join(repoRoot, ".rea-work/dist")), LOG_DIR: join(tmp, "reflow-ipc") },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

function reaCapture(width) {
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: URL_ },
    environment: { viewport: { width, height: HEIGHT, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 4000 },
      { step_id: "w0", action: "wait_for", locator: { kind: "css", selector: `text=${CLICKS[0]}` }, state: "visible", timeout_ms: 10000 },
      ...CLICKS.flatMap((t, i) => [
        { step_id: `c${i}`, action: "click", locator: { kind: "css", selector: `text=${t}` }, timeout_ms: 5000 },
        { step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 700 },
      ]),
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 1500 },
    ],
    capture: { at_end: ["screenshot", "url"], events: ["page-errors"] },
  };
  const file = join(tmp, `reflow-ref-${width}.json`);
  writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const ev = JSON.parse(res.stdout);
  const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
  if (art.screenshot?.state !== "captured") throw new Error(`REA screenshot ${art.screenshot?.state}: ${(res.stderr || res.stdout).slice(0, 400)}`);
  writeFileSync(join(out, `ref-${width}.png`), Buffer.from(art.screenshot.value.data_base64, "base64"));
  return { evidence_id: ev.evidence_id, browser: `${ev.normalized_result?.browser?.product ?? ""} ${ev.normalized_result?.browser?.version ?? ""}`.trim() };
}

// Geometry: Playwright input does not reach Conductor's renderer in this harness
// (team note), so clicks are DOM events dispatched in the page.
async function measure(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT }, colorScheme: "dark" });
  await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === HOST ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  await page.addInitScript(() => (window.close = () => {}));
  await page.goto(URL_);
  await page.waitForTimeout(6000);
  for (const t of CLICKS) {
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent.trim() === text);
      if (!el) throw new Error(`no element with text ${text}`);
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const C = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        el.dispatchEvent(new C(type, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
      }
    }, t);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(1500);
  const g = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, width: Math.round(b.width * 10) / 10, top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10 };
    };
    const main = document.getElementById("main-content");
    const textarea = main?.querySelector('[contenteditable="true"], textarea');
    let composer = textarea;
    while (composer && composer !== main && !/rounded-xl/.test(composer.className ?? "")) composer = composer.parentElement;
    const turns = main ? [...main.querySelectorAll('[class*="max-w-4xl"]')].map(box).slice(0, 6) : [];
    const header = [...document.querySelectorAll('[data-tauri-drag-region]')].find((e) => /\bh-10\b/.test(e.className) && /justify-between/.test(e.className) && e.querySelector("button"));
    const sbTop = document.querySelector('aside[data-sidebar="sidebar"] [data-tauri-drag-region]');
    return {
      viewport: window.innerWidth,
      sidebar: box(document.querySelector('aside[data-sidebar="sidebar"]')),
      sidebar_topbar: box(sbTop),
      main_content: box(main),
      right_panel: box(document.getElementById("right-panel")),
      header: box(header),
      header_class: header?.className ?? null,
      composer: box(composer),
      max_w_4xl: turns,
      doc_scroll_width: document.documentElement.scrollWidth,
    };
  });
  await page.screenshot({ path: join(out, `ref-${width}-pw.png`) });
  await ctx.close();
  return g;
}

const report = {};
try {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  for (const w of WIDTHS) {
    report[w] = { rea: reaCapture(w), geometry: await measure(browser, w) };
    console.log(w, JSON.stringify(report[w].geometry));
  }
  await browser.close();
} finally {
  server.kill();
}
writeFileSync(join(out, "ref-geometry.json"), JSON.stringify(report, null, 1) + "\n");
