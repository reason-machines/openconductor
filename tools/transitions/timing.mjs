// Click-to-content timing of every screen switch in the built OpenConductor app
// (WebKitGTK through tauri-driver, the tests/e2e lane), cold and warm.
//
// Each launch starts the debug app on a throwaway HOME, adds a fixture repository
// with two workspaces, then walks STEPS once (cold: first visit after launch) and
// WARM more times (warm). For every step the page logs each animation frame from
// the input to 1.2 s after it: whether the target content is there, loaders
// ("Loading…" text, placeholders, spinners, skeletons, aria-busy), a blank main
// area, and the boxes of the main landmarks (sidebar, main, header, tabs, right
// panel, composer, settings page). From that log:
//
//   contentMs   input to the first frame from which the target content stays on screen
//   flips       times the content showed and then went away again (wrong content first)
//   settledMs   input to the last frame in which anything above still changed
//   loaderMs    how long a loader was on screen (0 = no flash)
//   blankFrames frames with an empty main area after the input
//   shifts      frames after the content showed in which a landmark box moved
//   maxFrameMs  longest frame between input and settle (jank)
//
//   xvfb-run -a -s "-screen 0 1440x900x24" node tools/transitions/timing.mjs <app> <out.json>
//
// Env: LAUNCHES (default 3), WARM (warm passes per launch, default 3), TAURI_DRIVER,
// TX_RUN (scratch dir, default /tmp/oc-timing-run), OC_E2E_SIZE (window, default 1440x900),
// FILM=<dir> records the Xvfb screen with ffmpeg during the first launch (see
// filmstrip.py), STEPS=id,id runs a subset.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";

const [appArg, outArg] = process.argv.slice(2);
const app = resolve(appArg ?? "src-tauri/target/debug/openconductor");
const outFile = resolve(outArg ?? "timing.json");
const run = resolve(process.env.TX_RUN ?? "/tmp/oc-timing-run");
const LAUNCHES = Number(process.env.LAUNCHES ?? 3);
const WARM = Number(process.env.WARM ?? 3);
const FILM = process.env.FILM ? resolve(process.env.FILM) : null;
const SIZE = process.env.OC_E2E_SIZE ?? "1440x900";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe" });
const META = "\uE03D", ALT = "\uE00A", ESC = "\uE00C";

function makeRepo(base, name) {
  mkdirSync(base, { recursive: true });
  const bare = join(base, `${name}.git`);
  const repo = join(base, name);
  git(base, "init", "--bare", "-b", "main", bare);
  git(base, "clone", bare, name);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "README.md"), `# ${name}\n`);
  for (let i = 0; i < 40; i++) writeFileSync(join(repo, "src", `module${i}.ts`), `export const v${i} = ${i};\n`.repeat(20));
  git(repo, "add", ".");
  git(repo, "-c", "user.name=OC", "-c", "user.email=oc@example.com", "commit", "-m", "Initial commit");
  git(repo, "push", "origin", "HEAD:main");
  return repo;
}

/** Worktrees the app made under HOME (a `.git` file, not a directory). */
function worktrees(home) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 7) return;
    let names;
    try { names = readdirSync(dir); } catch { return; }
    try { if (names.includes(".git") && statSync(join(dir, ".git")).isFile()) return void found.push(dir); } catch {}
    for (const n of names) {
      if (n === "node_modules" || n === ".cache") continue;
      const p = join(dir, n);
      try { if (statSync(p).isDirectory()) walk(p, depth + 1); } catch {}
    }
  };
  walk(home, 0);
  return found;
}

// In-page frame recorder. __tm.start(pred) arms it; the step's input then sets
// __tm.t0 (a click does it itself; a key is caught by the capture listener).
const RECORDER = `
if (!window.__tm) {
  const LOADER = '.oc-skeleton, [class*="spinner"], [class*="skeleton"], [aria-busy="true"]';
  const LANDMARKS = ['.sidebar', 'main.main', '.ws-header', '.main-tabs', '.diff', '.rp-tabs', '.composer-wrap', '.settings-nav', '.settings-page-inner', '.settings-header', '.workspace'];
  // The loader on screen, as "<class>: <text>", or "".
  const loaderOn = () => {
    const what = (el) => (el.className || el.tagName).toString().slice(0, 40) + ': ' + (el.textContent || '').trim().slice(0, 40);
    for (const el of document.querySelectorAll(LOADER)) if (el.getClientRects().length) return what(el);
    const main = document.querySelector('main.main, .settings-page');
    if (!main) return '';
    const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/^\\s*Loading/.test(n.data) && n.parentElement?.getClientRects().length) return what(n.parentElement);
    return '';
  };
  const boxes = () => LANDMARKS.map((s) => { const el = document.querySelector(s); if (!el) return s + ':-'; const r = el.getBoundingClientRect(); return s + ':' + [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
  const tm = (window.__tm = { t0: null, frames: [], on: false });
  window.addEventListener('keydown', (e) => { if (tm.on && tm.t0 === null) { tm.t0 = performance.now(); tm.wall0 = Date.now(); } }, true);
  tm.start = (pred) => { tm.pred = new Function('return (' + pred + ')'); tm.t0 = null; tm.frames = []; tm.on = true; requestAnimationFrame(tm.tick); };
  tm.tick = (ts) => {
    if (!tm.on) return;
    if (tm.t0 !== null) {
      let ok = false; try { ok = !!tm.pred(); } catch {}
      const main = document.querySelector('main.main, .settings-page');
      const blank = !main || (main.innerText || '').trim().length < 2;
      tm.frames.push({ t: ts - tm.t0, ok, loader: loaderOn(), blank, boxes: boxes().join('|') });
      if (ts - tm.t0 > 1200) { tm.on = false; return; }
    }
    requestAnimationFrame(tm.tick);
  };
  tm.click = (css, text) => {
    const el = Array.from(document.querySelectorAll(css)).find((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/^\\d+/, '').startsWith(text));
    if (!el) throw new Error('no ' + css + ' ' + text);
    tm.t0 = performance.now();
    tm.wall0 = Date.now();
    el.click();
  };
}`;

function summarize(frames) {
  // Content counts from the first frame after which it stays: a frame that shows it and
  // then a loader (the previous workspace's list under the new header) is not content.
  let first = frames.length;
  while (first > 0 && frames[first - 1].ok) first--;
  if (first === frames.length) first = -1;
  let flips = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i - 1].ok && !frames[i].ok) flips++;
  const moved = [];
  let settled = first >= 0 ? frames[first].t : null, shifts = 0, loaderMs = 0, blankFrames = 0, maxFrameMs = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], prev = frames[i - 1];
    const dt = prev ? f.t - prev.t : Math.max(0, f.t);
    if (f.loader) loaderMs += prev ? dt : 16.7;
    if (f.blank) blankFrames++;
    const changed = prev && (f.boxes !== prev.boxes || f.ok !== prev.ok || f.loader !== prev.loader);
    if (changed) settled = Math.max(settled ?? 0, f.t);
    if (changed && first >= 0 && i > first && f.boxes !== prev.boxes) {
      shifts++;
      const a = prev.boxes.split("|"), b = f.boxes.split("|");
      for (let j = 0; j < b.length; j++) if (a[j] !== b[j] && moved.length < 6) moved.push(`${Math.round(f.t)}ms ${a[j]} -> ${b[j].split(":")[1]}`);
    }
  }
  for (let i = 0; i < frames.length; i++) {
    const dt = i ? frames[i].t - frames[i - 1].t : Math.max(0, frames[i].t);
    if (settled === null || frames[i].t <= settled) maxFrameMs = Math.max(maxFrameMs, dt);
  }
  return { moved, flips, contentMs: first >= 0 ? +frames[first].t.toFixed(1) : null, settledMs: settled === null ? null : +settled.toFixed(1), loaderMs: +loaderMs.toFixed(1), blankFrames, shifts, maxFrameMs: +maxFrameMs.toFixed(1), frames: frames.length };
}

// `act` performs the input; `done` is a page expression that is true once the target content shows.
const has = (css) => `!!document.querySelector(${JSON.stringify(css)})`;
const text = (css, t) => `Array.from(document.querySelectorAll(${JSON.stringify(css)})).some((e) => e.textContent.toLowerCase().includes(${JSON.stringify(t.toLowerCase())}))`;
const click = (css, label) => (wd) => wd.execute(`window.__tm.click(arguments[0], arguments[1]);`, [css, label]);
// A workspace is there once its header, composer and changes list (not its loader) show.
const inWorkspace = (name) => `${has(".workspace .composer-wrap")} && ${text(".ws-header", name)} && ${has(".diff .oc-changes, .diff .oc-diff-list .placeholder")} && !${text(".diff", "Loading")}`;
const changed = { before: "window.__tmBefore = document.querySelector('.app')?.innerHTML", done: "document.querySelector('.app')?.innerHTML !== window.__tmBefore" };
const NAV = ".settings-nav button, .settings-nav a";
const STEPS = [
  { id: "route-home", kind: "route", what: "Workspace to Home (sidebar Home)", act: click(".sb-row", "Home"), done: `${has(".home, .allws")} && !${has(".workspace")}` },
  { id: "route-workspace", kind: "route", what: "Home to workspace A (sidebar row)", act: (wd, c) => click(".sb-ws", c.wsA)(wd), done: (c) => inWorkspace(c.wsA) },
  { id: "ws-switch", kind: "route", what: "Workspace A to workspace B (sidebar row)", act: (wd, c) => click(".sb-ws", c.wsB)(wd), done: (c) => inWorkspace(c.wsB) },
  { id: "ws-switch-back", kind: "route", what: "Workspace B to workspace A (sidebar row)", act: (wd, c) => click(".sb-ws", c.wsA)(wd), done: (c) => inWorkspace(c.wsA) },
  { id: "rp-files", kind: "tab", what: "Right panel: All files", act: click(".rp-tab", "All files"), done: `${text(".diff", "README.md")} && ${text(".diff", "src")}` },
  { id: "rp-changes", kind: "tab", what: "Right panel: Changes", act: click(".rp-tab", "Changes"), done: `${text(".diff", "README.md")} && !${text(".diff", "Loading")}` },
  { id: "rp-checks", kind: "tab", what: "Right panel: Checks", act: click(".rp-tab", "Checks"), done: `(document.querySelector('.rp-tab.active')?.textContent ?? '').startsWith('Checks') && !${text(".diff", "Loading")}` },
  { id: "rp-back", kind: "tab", what: "Right panel: back to Changes", act: click(".rp-tab", "Changes"), done: `${text(".diff", "README.md")} && !${text(".diff", "Loading")}` },
  { id: "panel-left-hide", kind: "panel", what: "Left sidebar hide (⌘B)", act: (wd) => wd.chord([META], "b"), done: `!${has(".sidebar")}` },
  { id: "panel-left-show", kind: "panel", what: "Left sidebar show (⌘B)", act: (wd) => wd.chord([META], "b"), done: has(".sidebar .sb-ws") },
  { id: "panel-right-hide", kind: "panel", what: "Right panel hide (⌥⌘B)", act: (wd) => wd.chord([META, ALT], "b"), done: `!${has(".rp-tabs")}` },
  { id: "panel-right-show", kind: "panel", what: "Right panel show (⌥⌘B)", act: (wd) => wd.chord([META, ALT], "b"), done: has(".rp-tabs") },
  { id: "panel-terminal", kind: "panel", what: "Terminal toggle (⌘J)", act: (wd) => wd.chord([META], "j"), ...changed },
  { id: "panel-terminal-back", kind: "panel", what: "Terminal toggle back (⌘J)", act: (wd) => wd.chord([META], "j"), ...changed },
  { id: "dialog-palette", kind: "dialog", what: "Command palette open (⌘K)", act: (wd) => wd.chord([META], "k"), done: has("[data-dialog-motion=cmdk] input"), close: (wd) => wd.keys(ESC) },
  { id: "dialog-quickopen", kind: "dialog", what: "Quick open (⌘P)", act: (wd) => wd.chord([META], "p"), done: `${has("[data-dialog-motion=cmdk] input")} && ${text("[data-dialog-motion=cmdk]", "README")}`, close: (wd) => wd.keys(ESC) },
  { id: "dialog-shortcuts", kind: "dialog", what: "Keyboard shortcuts open (⌥⌘/)", act: (wd) => wd.chord([META, ALT], "/"), done: has("[data-dialog-motion=dialog]"), close: (wd) => wd.keys(ESC) },
  { id: "dialog-create", kind: "dialog", what: "New workspace open (⌘N)", act: (wd) => wd.chord([META], "n"), done: has("form.create-ws"), close: (wd) => wd.keys(ESC) },
  { id: "route-settings", kind: "route", what: "App to Settings (sidebar Settings)", act: click("button", "Settings"), done: `${has(".settings .settings-header")}` },
  { id: "settings-appearance", kind: "settings", what: "Settings page: Appearance", act: click(NAV, "Appearance"), done: text(".settings-header", "Appearance") },
  { id: "settings-git", kind: "settings", what: "Settings page: Git", act: click(NAV, "Git"), done: text(".settings-header", "Git") },
  { id: "settings-models", kind: "settings", what: "Settings page: Default models", act: click(NAV, "Default models"), done: `${text(".settings-header", "Default models")} && !${text(".settings-page", "Loading")}` },
  { id: "settings-agents", kind: "settings", what: "Settings page: Agents", act: click(NAV, "Agents"), done: `${text(".settings-header", "Agents")} && !${text(".settings-page", "Loading")}` },
  { id: "settings-env", kind: "settings", what: "Settings page: Environment", act: click(NAV, "Environment"), done: `${text(".settings-header", "Environment")} && !${text(".settings-page", "Loading")}` },
  { id: "settings-repo", kind: "settings", what: "Settings: repository tide-web", act: click(NAV, "tide-web"), done: `${has(".settings-repo.open")} && !${text(".settings-page", "Loading")}` },
  { id: "settings-repo-misc", kind: "settings", what: "Settings: repository Misc", act: click(NAV, "Misc"), done: has(".settings-misc-remove-btn") },
  { id: "settings-general", kind: "settings", what: "Settings page: General", act: click(NAV, "General"), done: `${text(".settings-header", "General")} && !${text(".settings-page", "Loading")}` },
  { id: "route-back", kind: "route", what: "Settings back to workspace A (Back)", act: click(".settings-back", "Back"), done: (c) => inWorkspace(c.wsA) },
];
const only = process.env.STEPS?.split(",");
const steps = only ? STEPS.filter((s) => only.includes(s.id)) : STEPS;

async function launch(n, film) {
  const root = join(run, `launch-${n}`);
  const home = join(root, "home");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(home, ".openconductor"), { recursive: true });
  writeFileSync(join(home, ".openconductor", "settings.toml"), '[general]\ntheme = "dark"\n');
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: join(home, ".local/share"), XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), OC_E2E_SIZE: SIZE };
  const driver = spawn(process.env.TAURI_DRIVER ?? "tauri-driver", [], { stdio: ["ignore", "ignore", "inherit"], env });
  const wd = new WebDriver();
  const results = [];
  let rec = null;
  try {
    await wd.waitFor("tauri-driver on :4444", async () => (await fetch("http://127.0.0.1:4444/status")).ok, 20000);
    const t = Date.now();
    await wd.newSession(app);
    await wd.waitFor("first-run onboarding", async () => (await wd.findAll(".onb-continue")).length > 0, 30000);
    const bootMs = Date.now() - t;
    await wd.click((await wd.findAll(".onb-continue"))[0]);
    await wd.waitFor("Home", async () => (await wd.findAll(".home")).length > 0);
    await wd.execute("window.__OC_E2E_PICK_FOLDER__ = arguments[0];", [makeRepo(join(root, "repos"), "tide-web")]);
    await wd.click((await wd.findAll(".home-card"))[0]);
    await wd.waitFor("tide-web in the sidebar", () => wd.execute("return Array.from(document.querySelectorAll('.sb-repo-name'), (e) => e.textContent.trim()).includes('tide-web');", []));
    for (let i = 0; i < 2; i++) {
      await wd.click((await wd.findAll('.sb-repo-add[aria-label="Create workspace in tide-web"]'))[0]);
      const [submit] = await wd.waitFor("Create workspace dialog", () => wd.findAll('form.create-ws button[type="submit"]').then((ids) => ids.length && ids));
      await wd.click(submit);
      await wd.waitFor(`workspace ${i + 1}`, async () => (await wd.execute("return document.querySelectorAll('.sb-ws').length", [])) >= i + 1, 60000);
      await wd.waitFor("workspace view", async () => (await wd.findAll(".workspace .composer-wrap")).length > 0, 60000);
      await sleep(1500);
    }
    // Uncommitted changes in both workspaces, so Changes and All files have content.
    for (const wt of worktrees(home)) {
      writeFileSync(join(wt, "README.md"), "# changed\n");
      writeFileSync(join(wt, "src", "added.ts"), "export const added = 1;\n");
    }
    const names = await wd.execute("return Array.from(document.querySelectorAll('.sb-ws'), (e) => (e.getAttribute('aria-label') || e.textContent).trim());", []);
    // Row text starts with the row's ⌘-number badge.
    const ctx = { wsA: names[0].replace(/^\d+/, ""), wsB: names[1].replace(/^\d+/, "") };
    await wd.execute(RECORDER, []);
    // Open each workspace once after the edits, as a user would have, so what the
    // app remembers of them is current; then start on A.
    for (const ws of [ctx.wsB, ctx.wsA]) {
      await wd.execute("window.__tm.click('.sb-ws', arguments[0]);", [ws]);
      await sleep(2500);
    }
    if (film) rec = startFilm(film);
    for (let pass = 0; pass <= WARM; pass++) {
      for (const s of steps) {
        const r = { launch: n, pass, temp: pass === 0 ? "cold" : "warm", id: s.id, kind: s.kind };
        try {
          await wd.execute("document.activeElement?.blur?.();", []).catch(() => {});
          if (s.before) await wd.execute(s.before, []);
          const done = typeof s.done === "function" ? s.done(ctx) : s.done;
          await wd.execute("window.__tm.start(arguments[0]);", [done]);
          await sleep(50);
          r.wall = Date.now();
          await s.act(wd, ctx);
          await wd.waitFor(`${s.id} recorded`, () => wd.execute("return !window.__tm.on;", []), 10000);
          const frames = await wd.execute("return window.__tm.frames;", []);
          r.inputWall = await wd.execute("return window.__tm.wall0;", []);
          Object.assign(r, summarize(frames));
          r.loaders = [...new Set(frames.map((f) => f.loader).filter(Boolean))];
          if (film && pass === 0) r.rawFrames = frames.map((f) => ({ t: +f.t.toFixed(1), ok: f.ok, loader: f.loader, blank: f.blank }));
          if (s.close) { await s.close(wd); await sleep(400); }
        } catch (e) {
          r.error = String(e?.message ?? e).slice(0, 300);
        }
        results.push(r);
        console.error(`launch ${n} ${r.temp} ${s.id}: ${r.error ?? `${r.loaders?.length ? `[${r.loaders.join(" / ")}] ` : ""}content ${r.contentMs} ms, settled ${r.settledMs} ms, loader ${r.loaderMs} ms, blank ${r.blankFrames}, flips ${r.flips}, shifts ${r.shifts}${r.moved?.length ? ` [${r.moved.join("; ")}]` : ""}, max frame ${r.maxFrameMs} ms`}`);
        await sleep(300);
      }
    }
    return { bootMs, ctx, results, film: rec ? await stopFilm(rec) : null };
  } finally {
    await wd.deleteSession().catch(() => undefined);
    driver.kill();
    if (rec && rec.proc.exitCode === null) rec.proc.kill("SIGINT");
  }
}

function startFilm(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "screen.mkv");
  const proc = spawn("ffmpeg", ["-y", "-loglevel", "error", "-use_wallclock_as_timestamps", "1", "-f", "x11grab", "-framerate", "60", "-video_size", SIZE, "-i", process.env.DISPLAY, "-copyts", "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", file], { stdio: ["pipe", "ignore", "inherit"] });
  return { proc, file };
}

async function stopFilm(rec) {
  rec.proc.stdin.write("q");
  await new Promise((r) => rec.proc.on("exit", r));
  // Frame timestamps are wall-clock seconds (-copyts); filmstrip.sh cuts each step at its `inputWall`.
  return { file: rec.file };
}

const all = { app, size: SIZE, launches: [] };
for (let n = 1; n <= LAUNCHES; n++) {
  all.launches.push(await launch(n, n === 1 ? FILM : null));
  writeFileSync(outFile, JSON.stringify(all, null, 1) + "\n");
}

// Medians per step: cold over launches, warm over every warm pass.
const median = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const rows = [];
for (const s of steps) for (const temp of ["cold", "warm"]) {
  const rs = all.launches.flatMap((l) => l.results).filter((r) => r.id === s.id && r.temp === temp && !r.error);
  if (!rs.length) continue;
  rows.push({ id: s.id, kind: s.kind, what: s.what, temp, runs: rs.length, contentMs: median(rs.map((r) => r.contentMs)), contentMax: Math.max(...rs.map((r) => r.contentMs ?? Infinity)), settledMs: median(rs.map((r) => r.settledMs)), loaderMs: Math.max(0, ...rs.map((r) => r.loaderMs)), blankFrames: Math.max(0, ...rs.map((r) => r.blankFrames)), flips: Math.max(0, ...rs.map((r) => r.flips)), shifts: Math.max(0, ...rs.map((r) => r.shifts)), maxFrameMs: median(rs.map((r) => r.maxFrameMs)) });
}
all.summary = rows;
writeFileSync(outFile, JSON.stringify(all, null, 1) + "\n");
console.log("| step | temp | runs | content ms (median / max) | settled ms | loader ms (max) | blank frames (max) | flips (max) | shifts (max) | longest frame ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.id} | ${r.temp} | ${r.runs} | ${r.contentMs} / ${r.contentMax} | ${r.settledMs} | ${r.loaderMs} | ${r.blankFrames} | ${r.flips} | ${r.shifts} | ${r.maxFrameMs} |`);
