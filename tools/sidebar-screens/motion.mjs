// Side-by-side motion frames of the sidebar: Conductor (its extracted renderer served by
// tools/screens with the mocked IPC) on the left, OpenConductor (our build served by
// tools/sidebar-screens with the same invented data) on the right.
//
//   npm run build && (cd tools/screens && npm ci) && TMPDIR=/tmp/t node tools/sidebar-screens/motion.mjs [scene ...]
//
// Frames are deterministic: Playwright's clock drives JS animation (framer-motion, rAF),
// and every CSS animation/transition on the page is paused and seeked to the frame time
// (document.getAnimations()). Writes parity/side-by-side/sidebar/motion/<scene>.png (a
// strip of labelled frames) and <scene>.mp4 (the frames at their real timing, 30fps).
// Conductor's renderer is third-party and never lives in this repository.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const out = path.join(repoRoot, "parity/side-by-side/sidebar/motion");
const scratch = path.join(process.env.TMPDIR ?? "/tmp", "oc-motion");
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORTS = { conductor: 4337, ours: 4338 };
const only = process.argv.slice(2);
const CROP = { x: 0, y: 0, width: 300, height: 560 };


const servers = [
  spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, PORT: String(PORTS.conductor) }, stdio: "ignore" }),
  spawn(process.execPath, [path.join(here, "server.mjs")], { env: { ...process.env, PORT: String(PORTS.ours) }, stdio: "ignore" }),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

/**
 * Pauses every animation on the page and seeks it to `ms` after the trigger. CSS animations and
 * transitions start on the real timeline at the trigger, so they seek from their currentTime then.
 * framer-motion's WAAPI animations (plain `Animation`: opacity) get a start time from the fake
 * clock and sit at a negative currentTime; they start on the first animation frame after they are
 * created, so they seek from (the frame time they were first seen at - one 16ms frame).
 */
async function seekCss(page, ms) {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      const css = a instanceof CSSAnimation || a instanceof CSSTransition;
      if (a.__ocT0 === undefined) a.__ocT0 = css ? t - (a.currentTime ?? 0) : Math.max(0, t - 16);
      a.pause();
      // Clamp just before the end: framer-motion's WAAPI animations (fill none) only commit their
      // final value on finish, so a paused animation past its end would show the start value.
      const end = a.effect?.getComputedTiming().endTime;
      const at = Math.max(0, t - a.__ocT0);
      a.currentTime = Number.isFinite(end) ? Math.min(at, end - 0.01) : at;
    }
  }, ms);
}

/** Frames at `times` (ms after the trigger): JS animation by clock, CSS by seeking. */
async function frames(page, times, file, clip = CROP) {
  const shots = [];
  let now = 0;
  for (const t of times) {
    if (t > now) await page.clock.runFor(t - now);
    now = t;
    await seekCss(page, t);
    const p = `${file}-${String(t).padStart(4, "0")}.png`;
    await page.screenshot({ path: p, clip, animations: "allow" });
    shots.push({ t, p });
  }
  return shots;
}

// Input is dispatched as DOM events in the page for both apps: in the tools/screens
// harness, Playwright's CDP mouse and keyboard input never reaches Conductor's renderer
// (no event arrives at document, though REA's own clicks do), so neither app gets it.
const dom = {
  /** Element by CSS selector plus exact text of a descendant (or itself). */
  /** `text` matches an element's own text, or the start of a menu item's ("Pin" in "PinP"). */
  async find(page, selector, text) {
    const h = await page.evaluateHandle(([sel, t]) => [...document.querySelectorAll(sel)].find((el) => !t || [...el.querySelectorAll("*"), el].some((c) => c.textContent?.trim() === t) || (el.getAttribute("role") === "menuitem" && el.textContent.trim().startsWith(t))) ?? null, [selector, text]);
    if (!(await h.evaluate((el) => el !== null))) throw new Error(`not found: ${selector} ${text ?? ""}`);
    return h;
  },
  async fire(page, handle, types, extra = {}) {
    await page.evaluate(([el, ts, x]) => {
      const r = el.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, composed: true, clientX: r.x + Math.min(20, r.width / 2), clientY: r.y + r.height / 2, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...x };
      for (const t of ts) {
        const E = t.startsWith("pointer") ? PointerEvent : MouseEvent;
        el.dispatchEvent(new E(t, { ...at, buttons: t.endsWith("up") || t === "click" ? 0 : at.buttons }));
      }
    }, [handle, types, extra]);
  },
  click(page, handle) { return this.fire(page, handle, ["pointerover", "pointerenter", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]); },
  context(page, handle) { return this.fire(page, handle, ["pointerdown", "mousedown", "contextmenu"], { button: 2, buttons: 2 }); },
  hover(page, handle) { return this.fire(page, handle, ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"], { buttons: 0 }); },
  escape(page) { return page.evaluate(() => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }))); },
};

/** Forces :hover/:active on an element through CDP (CSS.forcePseudoState). */
async function forceState(page, handle, states) {
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate((el) => el.setAttribute("data-oc-force", ""), handle);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-oc-force]" });
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
  return cdp;
}

const SEL = {
  sectionHeader: { conductor: ".group\\/section-header", ours: ".sb-section-header" },
  repoHeader: { conductor: "[data-rfd-drag-handle-draggable-id]", ours: ".sb-repo-header" },
  row: '[data-testid="left-sidebar-workspace-item"]',
  pinned: { conductor: 'section[aria-label="Pinned workspaces"]', ours: '.sb-group[data-group="Pinned"]' },
};

const SCENES = {
  // Header "..." menu: open, then Escape (Base UI data-starting-style / data-ending-style, 100ms).
  "menu-open-close": {
    times: [0, 25, 50, 75, 100, 150],
    async run(page, app, file) {
      await dom.hover(page, await dom.find(page, SEL.sectionHeader[app], "My workspaces"));
      await page.clock.runFor(200);
      await dom.click(page, await dom.find(page, 'button[aria-label="My workspaces actions"]'));
      const open = await frames(page, this.times, `${file}-open`);
      await dom.escape(page);
      const close = await frames(page, this.times, `${file}-close`);
      return [...open.map((f) => ({ ...f, label: `open +${f.t}ms` })), ...close.map((f) => ({ ...f, label: `close +${f.t}ms` }))];
    },
  },
  // Pressing a ghost button (repo "+"): 97% over 150ms ease-out. Hover and :active forced through CDP.
  "ghost-press": {
    times: [0, 50, 100, 150],
    async run(page, app, file) {
      const plus = await dom.find(page, 'button[aria-label="Create workspace"]:not([data-sidebar]), button[aria-label="Create workspace in tide-web"]');
      const cdp = await forceState(page, plus, ["hover"]);
      await page.clock.runFor(200);
      await page.evaluate(() => { for (const a of document.getAnimations()) a.finish?.(); });
      const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-oc-force]" });
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover", "active"] });
      const r = await plus.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      const shots = await frames(page, this.times, file, { x: r.x - 12, y: r.y - 8, width: r.w + 24, height: r.h + 16 });
      // The pressed state as computed, for the PR table (logged, not asserted).
      console.log(`[ghost-press] ${app}:`, JSON.stringify(await plus.evaluate((el) => { const c = getComputedStyle(el); return { scale: c.scale, transition: `${c.transitionProperty} ${c.transitionDuration} ${c.transitionTimingFunction}`, willChange: c.willChange }; })));
      return shots.map((f) => ({ ...f, label: `press +${f.t}ms` }));
    },
  },
  // Lifting a repository to reorder it: accent fill, rounded-md, shadow-md (@hello-pangea/dnd).
  "repo-drag": {
    times: [0, 100, 200, 300],
    async run(page, app, file) {
      const header = await dom.find(page, SEL.repoHeader[app], "tide-api");
      await dom.fire(page, header, ["pointerdown", "mousedown"]);
      // Move past pangea's 5px sloppy-click threshold, upward, in small steps on window.
      await page.evaluate(async (el) => {
        const r = el.getBoundingClientRect();
        const x = r.x + 60, y0 = r.y + r.height / 2;
        for (let i = 1; i <= 8; i++) window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y0 - i * 4, button: 0, buttons: 1 }));
      }, header);
      await page.clock.runFor(50);
      const shots = await frames(page, this.times, file);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true })));
      return shots.map((f) => ({ ...f, label: `lifted +${f.t}ms` }));
    },
  },
  // Pinning a row while Pinned exists: the row rises 12px into Pinned and collapses out of its repo.
  "row-pin": {
    times: [0, 40, 80, 120, 160, 200, 260],
    async run(page, app, file) {
      // Pins the first two rows of the list, by label (a row leaving its repo group is still in the DOM).
      const labels = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((r) => r.textContent.trim()), SEL.row);
      const pin = async (label) => {
        const row = await page.evaluateHandle(([rowSel, pinnedSel, l]) => [...document.querySelectorAll(rowSel)].find((r) => !r.closest(pinnedSel) && r.textContent.trim() === l), [SEL.row, SEL.pinned[app], label]);
        await dom.context(page, row);
        await page.clock.runFor(300);
        await dom.click(page, await dom.find(page, '[role="menuitem"]', "Pin"));
      };
      await pin(labels[0]);
      // framer-motion runs opacity/transform on WAAPI (real time) and the rest on rAF (the clock).
      await page.clock.runFor(800);
      await page.waitForTimeout(600);
      await pin(labels[1]);
      const shots = await frames(page, this.times, file);
      return shots.map((f) => ({ ...f, label: `pin +${f.t}ms` }));
    },
  },
};

async function capture(app, scene) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", locale: "en-US", timezoneId: "UTC" });
  await page.clock.install();
  // conductor.localhost: Conductor treats "localhost" as a dev host (tools/screens/capture.mjs).
  await page.goto(`http://${app === "conductor" ? "conductor.localhost" : "localhost"}:${PORTS[app]}/?oc_scenario=populated&oc_theme=dark`);
  // The fake clock flows in real time while the app loads (Conductor's mocked IPC and sql.js
  // need ~6s, settle_ms 6000 in tools/screens/shots), then pauses and only moves by runFor.
  await page.waitForTimeout(7000);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 5000));
  // Expand the first two repositories, as in the static sidebar captures (same click steps).
  const rows = page.locator(SEL.row);
  // A loaded sidebar: wait (real time, the CPU may be busy) for the repo headers.
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(([sel]) => [...document.querySelectorAll(sel)].some((e) => e.textContent.includes("tide-api")), [SEL.repoHeader[app]])) break;
    await page.waitForTimeout(500);
  }
  for (const name of ["tide-web", "tide-api"]) {
    const before = await rows.count();
    await dom.click(page, await dom.find(page, SEL.repoHeader[app], name));
    for (let i = 0; i < 40 && (await rows.count()) === before; i++) await page.clock.runFor(100);
    await page.clock.runFor(600);
  }
  if ((await rows.count()) === 0) throw new Error(`${app}: no workspace rows after expanding`);
  const file = path.join(scratch, `${scene}-${app}`);
  try {
    return await SCENES[scene].run(page, app, file);
  } finally {
    await browser.close();
  }
}

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });
const results = {};
try {
  for (const scene of Object.keys(SCENES).filter((s) => !only.length || only.includes(s))) {
    const timed = (app) => Promise.race([capture(app, scene), sleep(180000).then(() => { throw new Error("timed out after 180s"); })]).catch((e) => ({ error: String(e) }));
    console.log(`[${scene}] conductor…`);
    const left = await timed("conductor");
    console.log(`[${scene}] ours…`);
    const right = await timed("ours");
    if (left.error || right.error) {
      console.error(`[${scene}] conductor: ${left.error ?? "ok"} | ours: ${right.error ?? "ok"}`);
      results[scene] = { conductor: left.error ?? "ok", ours: right.error ?? "ok" };
      continue;
    }
    const spec = path.join(scratch, `${scene}.json`);
    fs.writeFileSync(spec, JSON.stringify({ scene, frames: left.map((l, i) => ({ label: l.label, t: l.t, left: l.p, right: right[i].p })) }));
    const r = spawnSync("python3", [path.join(here, "motion_compose.py"), spec, out], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    console.log(r.stdout.trim());
    results[scene] = "ok";
  }
} finally {
  for (const s of servers) s.kill();
}
console.log(JSON.stringify(results));
