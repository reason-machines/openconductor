// Frame strips of OpenConductor's screen transitions in the built debug app
// (WebKitGTK through tauri-driver, the tests/e2e lane). For each interaction
// it holds every animation the page starts, then seeks them to fixed times
// and takes a window screenshot at each, so mid-transition frames are exact
// even though a WebDriver screenshot takes longer than the transition.
// A build without the transition shows its end state in every frame.
//
//   xvfb-run -a -s "-screen 0 1440x900x24" node tools/transitions/built_app.mjs <app binary> <out dir>
//
// Env: TAURI_DRIVER (default "tauri-driver"), TX_RUN (scratch dir for the
// isolated HOME and fixture repos, default /tmp/oc-tx-run). Writes
// <out>/<id>-<ms>.png and <out>/frames.json (animations held per step).
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";

const [appArg, outArg] = process.argv.slice(2);
const app = resolve(appArg ?? "src-tauri/target/debug/openconductor");
const out = resolve(outArg ?? "tx-frames");
const run = resolve(process.env.TX_RUN ?? "/tmp/oc-tx-run");
const home = join(run, "home");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe" });
const META = "\uE03D", ALT = "\uE00A", ESC = "\uE00C";

function makeRepo(name) {
  const base = join(run, "repos");
  mkdirSync(base, { recursive: true });
  const bare = join(base, `${name}.git`);
  const repo = join(base, name);
  git(base, "init", "--bare", "-b", "main", bare);
  git(base, "clone", bare, name);
  writeFileSync(join(repo, "README.md"), `# ${name}\n`);
  git(repo, "add", ".");
  git(repo, "-c", "user.name=OC", "-c", "user.email=oc@example.com", "commit", "-m", "Initial commit");
  git(repo, "push", "origin", "HEAD:main");
  return repo;
}

// Holds every animation as soon as it starts (paused near 0 ms), until __txRelease().
const HOLD = `
window.__txHeld = [];
window.__txOn = true;
const tick = () => {
  if (!window.__txOn) return;
  for (const a of document.getAnimations()) {
    if (window.__txHeld.includes(a) || a.effect?.getTiming().iterations === Infinity) continue;
    a.pause();
    window.__txHeld.push(a);
  }
  requestAnimationFrame(tick);
};
tick();`;
const SEEK = `
const t = arguments[0];
window.__txOn = false;
for (const a of window.__txHeld) a.currentTime = Math.min(t, a.effect.getTiming().duration);
const done = arguments[arguments.length - 1];
requestAnimationFrame(() => requestAnimationFrame(() => done(window.__txHeld.map((a) => ({
  name: a.animationName ?? a.transitionProperty, duration: a.effect.getTiming().duration,
  easing: a.effect.getTiming().easing, target: (a.effect.target?.className || '').toString().split(' ').slice(0, 2).join('.'),
})))));`;
async function executeAsync(wd, script, args) {
  const res = await fetch(`${wd.base}/session/${wd.sessionId}/execute/async`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ script, args }) });
  const json = await res.json();
  if (!res.ok) throw new Error(`execute/async -> ${res.status} ${json?.value?.message ?? ""}`);
  return json.value;
}
const RELEASE = "for (const a of window.__txHeld ?? []) a.play(); window.__txHeld = []; window.__txOn = false;";

const clickText = (wd, css, text) =>
  wd.execute(
    `const el = Array.from(document.querySelectorAll(arguments[0])).find((e) => (e.getAttribute('aria-label') || e.textContent).trim().startsWith(arguments[1]));
     if (!el) throw new Error('no ' + arguments[0] + ' ' + arguments[1]); el.click();`,
    [css, text],
  );

const DIALOG = [0, 50, 100, 150, 200];
const CMDK_IN = [0, 45, 90, 135, 180];
const CMDK_OUT = [0, 33, 65, 98, 130];
const STEPS = [
  { id: "route-home", what: "Route: workspace to Home (sidebar)", act: (wd) => clickText(wd, "button, a, [role=button]", "Home"), frames: DIALOG },
  { id: "route-workspace", what: "Route: Home to a workspace (sidebar row)", act: (wd) => clickText(wd, ".sb-ws", ""), frames: DIALOG },
  { id: "sidebar-hide", what: "Panel: left sidebar hide (⌘B)", act: (wd) => wd.chord([META], "b"), frames: DIALOG },
  { id: "sidebar-show", what: "Panel: left sidebar show (⌘B)", act: (wd) => wd.chord([META], "b"), frames: DIALOG },
  { id: "palette-open", what: "Dialog: command palette open (⌘K)", act: (wd) => wd.chord([META], "k"), frames: CMDK_IN },
  { id: "palette-close", what: "Dialog: command palette close (Escape)", keepFocus: true, act: (wd) => wd.keys(ESC), frames: CMDK_OUT },
  { id: "shortcuts-open", what: "Dialog: keyboard shortcuts open (⌥⌘/)", act: (wd) => wd.chord([META, ALT], "/"), frames: DIALOG },
  { id: "shortcuts-close", what: "Dialog: keyboard shortcuts close (Escape)", keepFocus: true, act: (wd) => wd.keys(ESC), frames: DIALOG },
  { id: "create-open", what: "Dialog: new workspace open (⌘N)", act: (wd) => wd.chord([META], "n"), frames: DIALOG },
  { id: "create-close", what: "Dialog: new workspace close (Escape)", keepFocus: true, act: (wd) => wd.keys(ESC), frames: DIALOG },
  { id: "route-settings", what: "Route: app to Settings (sidebar gear)", act: (wd) => clickText(wd, "button", "Settings"), frames: DIALOG },
  { id: "settings-page", what: "Tab: settings page switch (Appearance)", act: (wd) => clickText(wd, "button, a", "Appearance"), frames: DIALOG },
  { id: "settings-repo", what: "Tab: settings repository page (tide-web)", act: (wd) => clickText(wd, "button, a", "tide-web"), frames: DIALOG },
  { id: "settings-misc", what: "Tab: repository Misc page", act: (wd) => clickText(wd, "button, a", "Misc"), frames: DIALOG },
  { id: "alert-open", what: "Dialog: confirmation open (Remove tide-web?)", act: (wd) => clickText(wd, ".settings-misc-remove-btn", ""), frames: DIALOG },
  { id: "alert-close", what: "Dialog: confirmation close (Cancel)", act: (wd) => clickText(wd, ".modal button", "Cancel"), frames: DIALOG },
  { id: "route-back", what: "Route: Settings back to the app (Back)", act: (wd) => clickText(wd, "button", "Back"), frames: DIALOG },
];

rmSync(run, { recursive: true, force: true });
mkdirSync(join(home, ".openconductor"), { recursive: true });
writeFileSync(join(home, ".openconductor", "settings.toml"), '[general]\ntheme = "dark"\n');
mkdirSync(out, { recursive: true });
const driver = spawn(process.env.TAURI_DRIVER ?? "tauri-driver", [], {
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, HOME: home, XDG_DATA_HOME: join(home, ".local/share"), XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache") },
});
const wd = new WebDriver();
const report = [];
try {
  await wd.waitFor("tauri-driver on :4444", async () => (await fetch("http://127.0.0.1:4444/status")).ok, 20000);
  await wd.newSession(app);
  await wd.waitFor("first-run onboarding", async () => (await wd.findAll(".onb-continue")).length > 0, 30000);
  await wd.click((await wd.findAll(".onb-continue"))[0]);
  await wd.waitFor("Home", async () => (await wd.findAll(".home")).length > 0);
  await wd.execute("window.__OC_E2E_PICK_FOLDER__ = arguments[0];", [makeRepo("tide-web")]);
  await wd.click((await wd.findAll(".home-card"))[0]);
  await wd.waitFor("tide-web in the sidebar", () => wd.execute("return Array.from(document.querySelectorAll('.sb-repo-name'), (e) => e.textContent.trim()).includes('tide-web');", []));
  await wd.click((await wd.findAll('.sb-repo-add[aria-label="Create workspace in tide-web"]'))[0]);
  const [submit] = await wd.waitFor("Create workspace dialog", () => wd.findAll('form.create-ws button[type="submit"]').then((ids) => ids.length && ids));
  await wd.click(submit);
  await wd.waitFor("workspace view", async () => (await wd.findAll(".workspace")).length > 0, 60000);
  await sleep(2500);
  for (const s of STEPS) {
    const rec = { id: s.id, what: s.what, frames: [] };
    try {
      // Leave text fields so a chord reaches the app; Escape goes to the focused dialog.
      if (!s.keepFocus) await wd.execute("document.activeElement?.blur?.();", []).catch(() => {});
      await wd.execute(HOLD, []);
      await s.act(wd);
      await sleep(250);
      for (const t of s.frames) {
        rec.held = await executeAsync(wd, SEEK, [t]);
        const file = `${s.id}-${t}.png`;
        writeFileSync(join(out, file), await wd.screenshot());
        rec.frames.push({ t, file });
      }
    } catch (e) {
      rec.error = String(e?.message ?? e).slice(0, 300);
    }
    await wd.execute(RELEASE, []).catch(() => {});
    await sleep(900);
    console.log(`${s.id}: ${rec.error ?? `${rec.held?.length ?? 0} animations held`}`);
    report.push(rec);
  }
} finally {
  writeFileSync(join(out, "frames.json"), JSON.stringify({ app, steps: report }, null, 1) + "\n");
  await wd.deleteSession().catch(() => undefined);
  driver.kill();
}
