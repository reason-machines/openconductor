// Conductor side of parity/side-by-side/resize-reflow: measures how Conductor
// 0.87.6's own frontend (extracted from the app, served by tools/screens with
// its Tauri mock and the "populated" scenario) lays out the workspace chat at
// 900, 1280, 1600 and 2100 px wide windows: sidebar, main column, right panel,
// each turn, the composer, and whether anything overflows. The screenshots
// for the same widths are REA captures (tools/screens/shots/09-resize-reflow.json);
// this script only reads geometry.
//
//   DIST=<conductor dist> TMPDIR=/tmp/t node tools/side-by-side/resize-reflow-conductor.mjs > conductor.json
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4318);
const WIDTHS = (process.env.WIDTHS ?? "900,1280,1600,2100").split(",").map(Number);
const executablePath = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => p && existsSync(p));

const server = spawn(process.execPath, [path.join(here, "../screens/server.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
  } catch {}
  await sleep(100);
}

// Runs in the page: boxes of the layout's parts, rounded to the pixel.
function measure() {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const scroller = (el) => {
    for (let p = el?.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > 0) return p;
    return null;
  };
  const turns = [...document.querySelectorAll("[data-turn-index]")];
  const list = scroller(turns[0]);
  const anchor = document.querySelector(".max-w-4xl.mx-auto.relative.pointer-events-auto");
  const composer = anchor?.querySelector(".rounded-xl") ?? anchor?.firstElementChild;
  const overflowing = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const s = getComputedStyle(el);
      return s.overflowX === "visible" && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && el.closest("main, [data-testid=main-content]");
    })
    .slice(0, 5)
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`);
  return {
    window: { w: innerWidth, h: innerHeight },
    sidebar: box(document.querySelector("aside")),
    main: box(document.querySelector('[data-testid="main-content"]')),
    rightPanel: box(document.querySelector('[data-testid="right-panel"]')),
    list: box(list),
    listClientWidth: list?.clientWidth ?? null,
    turns: turns.map(box),
    turnBodies: turns.map((t) => box(t.firstElementChild)),
    composerAnchor: box(anchor),
    composer: box(composer),
    horizontalOverflow: { list: list ? list.scrollWidth > list.clientWidth : null, page: document.documentElement.scrollWidth > innerWidth },
    overflowing,
  };
}

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const out = [];
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
    // As REA does: nothing leaves the machine (Sentry and CDN requests would hang Base UI).
    await context.route(/^(?!http:\/\/(conductor\.)?localhost)/, (r) => r.abort());
    const page = await context.newPage();
    await page.addInitScript(() => (window.close = () => {}));
    await page.goto(`http://conductor.localhost:${PORT}/?oc_scenario=populated&oc_theme=dark`);
    await sleep(6000);
    // Conductor's renderer ignores Playwright's CDP input in this harness; click through the DOM.
    const clickText = (t) =>
      page.evaluate((t) => {
        const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent?.trim() === t);
        if (!el) throw new Error(`no element with text ${t}`);
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }, t);
    await clickText("tide-web");
    await sleep(800);
    await clickText("Ada/fix login redirect");
    await sleep(3000);
    out.push({ width, ...(await page.evaluate(measure)) });
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify(out, null, 1));
