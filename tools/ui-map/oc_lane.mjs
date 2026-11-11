// OpenConductor side of the UI map: drives the built debug app through
// tauri-driver (the headless e2e lane, tests/e2e) and, for every state in
// states.json, saves a window screenshot and the rendered DOM text.
//
//   xvfb-run -a node tools/ui-map/oc_lane.mjs [state-id ...]
//
// Env: OC_APP (debug binary, default src-tauri/target/debug/openconductor),
// TAURI_DRIVER (default "tauri-driver"), UIMAP_OUT (default parity/ui-map),
// UIMAP_RUN (scratch dir for the isolated HOME and fixture repos).
//
// States with oc_fake_reason chat with tools/reason-acp/fake_reason_acp.py as
// `reason` (Conductor's reference turns "lisbon" and "tallinn").
//
// Every state starts from a fresh app session on a copy of one seeded HOME:
// onboarding done, repos tide-web, tide-api and dotfiles added with 3, 2 and 1
// workspaces like the reference fixture (a tide-web one open), git identity Ada
// Demo <ada@example.com>, theme dark. The app's HOME is pointed at the scratch dir, so
// conductor.db, settings.toml and worktrees never touch the real home.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WebDriver } from "../../tests/e2e/webdriver.mjs";

const here = new URL(".", import.meta.url).pathname;
const repoRoot = resolve(here, "../..");
const app = resolve(process.env.OC_APP ?? join(repoRoot, "src-tauri/target/debug/openconductor"));
const out = resolve(process.env.UIMAP_OUT ?? join(repoRoot, "parity/ui-map"));
const run = resolve(process.env.UIMAP_RUN ?? "/tmp/oc-uimap-run");
const states = JSON.parse(readFileSync(join(here, "states.json"), "utf8")).states;
const only = process.argv.slice(2);
const home = join(run, "home");
const template = join(run, "home.template");
// The fixture repositories, kept like HOME: a state that archives a workspace (sidebar-after-archive)
// removes its git worktree from them, which would break every later state on that workspace.
const repos = join(run, "repos");
const reposTemplate = join(run, "repos.template");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe" });

const KEY = { Escape: "\uE00C", Enter: "\uE007", Meta: "\uE03D", Control: "\uE009", Shift: "\uE008", Alt: "\uE00A", ArrowDown: "\uE015", ArrowUp: "\uE013", Tab: "\uE004" };
const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";

async function wdCall(wd, method, path, body) {
  const r = await fetch(`${wd.base}/session/${wd.sessionId}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j?.value?.message ?? ""}`);
  return j.value;
}

/** First element matching css (and exact trimmed textContent or aria-label when `text` is given). */
async function find(wd, step) {
  const ids = await wd.findAll(step.css);
  if (step.text === undefined) return ids[step.nth ?? 0];
  const i = await wd.execute(
    `const els = Array.from(document.querySelectorAll(arguments[0]));
     const want = arguments[1];
     const m = els.map((e, i) => [i, (e.getAttribute('aria-label') || '').trim(), e.textContent.trim()])
       .filter(([, a, t]) => a === want || t === want || t.startsWith(want + '⌘') || t.startsWith(want + '\\n'));
     return m.length > (arguments[2] || 0) ? m[arguments[2] || 0][0] : -1;`,
    [step.css, step.text, step.nth ?? 0],
  );
  return i >= 0 ? ids[i] : undefined;
}

async function pointer(wd, id, button, kind) {
  const actions = [{ type: "pointerMove", duration: 0, origin: { [ELEMENT]: id }, x: 0, y: 0 }];
  if (kind !== "hover") actions.push({ type: "pointerDown", button }, { type: "pointerUp", button });
  await wdCall(wd, "POST", "/actions", { actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions }] });
  await wdCall(wd, "DELETE", "/actions").catch(() => undefined);
}

async function runStep(wd, step) {
  // {click|rclick|hover|wait: css, text?, nth?}, {type: text, css}, {keys}, {chord, key}, {exec}, {sleep}
  const to = step.timeout ?? 8000;
  if (step.sleep) return sleep(step.sleep);
  if (step.exec) return wd.execute(step.exec, step.args ?? []);
  if (step.keys) {
    const text = step.keys.replace(/\{(\w+)\}/g, (_, k) => KEY[k] ?? "");
    return wd.keys(text);
  }
  if (step.chord) return wd.chord(step.chord.map((k) => KEY[k]), step.key.length === 1 ? step.key : KEY[step.key]);
  step = { ...step, css: step.css ?? step.click ?? step.rclick ?? step.hover ?? step.wait };
  const id = await wd.waitFor(`${step.css}${step.text ? ` "${step.text}"` : ""}`, () => find(wd, step), to);
  if (step.wait) return;
  if (step.click) return wd.click(id);
  if (step.rclick) return pointer(wd, id, 2, "click");
  if (step.hover) return pointer(wd, id, 0, "hover");
  if (step.type) {
    await wd.click(id);
    return wd.keys(step.type);
  }
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

function makeRepo(name) {
  const base = join(run, "repos");
  mkdirSync(base, { recursive: true });
  const bare = join(base, `${name}.git`);
  const repo = join(base, name);
  git(base, "init", "--bare", "-b", "main", bare);
  git(base, "clone", bare, name);
  writeFileSync(join(repo, "README.md"), `# ${name}\n`);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "index.ts"), "export const hello = () => 'hello';\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Initial commit");
  git(repo, "push", "origin", "HEAD:main");
  return repo;
}

async function session(wd, fn) {
  await wd.newSession(app);
  try {
    return await fn();
  } finally {
    await wd.deleteSession();
  }
}

async function seed(wd) {
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(home, ".openconductor"), { recursive: true });
  writeFileSync(join(home, ".openconductor", "settings.toml"), '[general]\ntheme = "dark"\n');
  // The reference fixture's person (tools/screens/fixtures.js): the sidebar's Account row reads
  // "<git user.name>'s Mac" and its menu heads with git user.email when the OS account has no name.
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = Ada Demo\n\temail = ada@example.com\n");
  await session(wd, async () => {
    await wd.waitFor("first-run onboarding", async () => (await wd.findAll(".onb-continue")).length > 0, 30000);
    await wd.click((await wd.findAll(".onb-continue"))[0]);
    await wd.waitFor("Home", async () => (await wd.findAll(".home")).length > 0);
    for (const name of ["tide-web", "tide-api", "dotfiles"]) {
      await wd.execute("window.__OC_E2E_PICK_FOLDER__ = arguments[0];", [makeRepo(name)]);
      await wd.click((await wd.findAll(".home-card"))[0]);
      await wd.waitFor(`${name} in the sidebar`, () => wd.execute("return Array.from(document.querySelectorAll('.sb-repo-name'), (e) => e.textContent.trim()).includes(arguments[0]);", [name]));
    }
    // As many workspaces per repository as the reference fixture (tools/screens/seed-data.js:
    // tide-web 3, tide-api 2, dotfiles 1), so folded groups show the same counts. tide-web's
    // last one is created last and stays open.
    const trees = (name) => git(join(run, "repos", name), "worktree", "list", "--porcelain").toString().match(/^worktree (.+)$/gm).map((l) => l.slice(9));
    const create = async (name) => {
      const before = trees(name);
      const [add] = await wd.findAll(`.sb-repo-add[aria-label="Create workspace in ${name}"]`);
      await wd.click(add);
      const [submit] = await wd.waitFor("Create workspace dialog", () => wd.findAll('form.create-ws button[type="submit"]').then((ids) => ids.length && ids));
      await wd.click(submit);
      const tree = await wd.waitFor(`a new ${name} worktree`, async () => trees(name).find((p) => !before.includes(p)), 60000);
      await wd.waitFor("workspace view", async () => (await wd.findAll(".workspace")).length > 0, 60000);
      await sleep(1000);
      return tree;
    };
    for (const name of ["dotfiles", "tide-api", "tide-api", "tide-web", "tide-web"]) await create(name);
    // Uncommitted changes in the open worktree, so the Changes panel and diff views have content.
    const tree = await create("tide-web");
    if (tree) {
      mkdirSync(join(tree, "src", "lib"), { recursive: true });
      writeFileSync(join(tree, "src", "lib", "auth.ts"), "export function redirectAfterLogin(next?: string) {\n  return next && next.startsWith('/') ? next : '/';\n}\n");
      writeFileSync(join(tree, "README.md"), "# tide-web\n\nLogin redirects now keep the original path.\n");
    }
    await sleep(1500);
  });
  cpSync(home, template, { recursive: true });
  cpSync(repos, reposTemplate, { recursive: true });
}

const DOM_TEXT = `
const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0; };
const texts = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) { const n = walker.currentNode; const t = n.textContent.replace(/\\s+/g, ' ').trim(); if (t && n.parentElement && vis(n.parentElement)) texts.push(t); }
const labels = Array.from(document.querySelectorAll('[aria-label],[title],[placeholder]')).filter(vis)
  .flatMap((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('placeholder')]).filter(Boolean);
const roles = Array.from(document.querySelectorAll('[role=dialog],[role=menu],[role=listbox],[role=tooltip],[role=alertdialog],[role=status],dialog[open]')).filter(vis).map((e) => e.getAttribute('role') || e.tagName.toLowerCase());
return { texts, labels, roles, url: location.href, viewport: [innerWidth, innerHeight] };`;

// States with oc_fake_reason get tools/reason-acp/fake_reason_acp.py as `reason`
// in this folder inside the per-state HOME, first on PATH; other states leave it
// empty, so they see whatever `reason` the host has, as before.
const laneBin = join(home, ".oc-lane-bin");
const fakeReason = join(repoRoot, "tools/reason-acp/fake_reason_acp.py");
const driver = spawn(process.env.TAURI_DRIVER ?? "tauri-driver", [], {
  stdio: ["ignore", "ignore", "inherit"],
  // GIT_CONFIG_GLOBAL too: a host that sets it (Reason cloud computers do) would otherwise hand
  // the app its own git identity instead of the seeded HOME's.
  env: { ...process.env, HOME: home, XDG_DATA_HOME: join(home, ".local/share"), XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), PATH: `${laneBin}:${process.env.PATH}` },
});
const wd = new WebDriver();
const manifestPath = join(out, "oc-captures.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
mkdirSync(join(out, "oc"), { recursive: true });
let failures = 0;
try {
  await wd.waitFor("tauri-driver on :4444", async () => (await fetch("http://127.0.0.1:4444/status")).ok, 20000);
  if (!existsSync(template) || !existsSync(reposTemplate) || process.env.UIMAP_RESEED) await seed(wd);
  for (const st of states) {
    if (only.length && !only.includes(st.id)) continue;
    if (!st.oc) {
      manifest[st.id] = { status: "no-equivalent", reason: st.oc_reason ?? "no OpenConductor route to this state" };
      continue;
    }
    rmSync(home, { recursive: true, force: true });
    if (st.oc_fresh) {
      mkdirSync(join(home, ".openconductor"), { recursive: true });
      writeFileSync(join(home, ".openconductor", "settings.toml"), '[general]\ntheme = "dark"\n');
    } else {
      cpSync(template, home, { recursive: true });
      rmSync(repos, { recursive: true, force: true });
      cpSync(reposTemplate, repos, { recursive: true });
    }
    if (st.oc_fake_reason) {
      mkdirSync(laneBin, { recursive: true });
      writeFileSync(join(laneBin, "reason"), `#!/bin/sh\nexec python3 "${fakeReason}" "$@"\n`, { mode: 0o755 });
    }
    const started = Date.now();
    const rec = { status: "captured", steps: st.oc.length };
    try {
      await session(wd, async () => {
        await wd.waitFor("the app shell", async () => (await wd.findAll(st.oc_fresh ? ".onb, .app" : ".app")).length > 0, 30000);
        await sleep(st.oc_settle_ms ?? 1500);
        for (const [i, step] of st.oc.entries()) {
          try {
            await runStep(wd, step);
          } catch (e) {
            rec.status = "step-failed";
            rec.failed_step = i;
            rec.error = String(e?.message ?? e).slice(0, 300);
            break;
          }
          await sleep(step.after_ms ?? 400);
        }
        await sleep(st.final_settle_ms ?? 800);
        const png = await wd.screenshot();
        writeFileSync(join(out, "oc", `${st.id}.png`), png);
        rec.file = `oc/${st.id}.png`;
        rec.png_sha256 = sha256(png);
        rec.dom = await wd.execute(DOM_TEXT, []);
      });
    } catch (e) {
      rec.status = "session-failed";
      rec.error = String(e?.message ?? e).slice(0, 300);
      failures++;
    }
    rec.ms = Date.now() - started;
    manifest[st.id] = rec;
    console.log(`${rec.status.padEnd(14)} ${st.id}${rec.error ? `: ${rec.error}` : ""}`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
  }
} finally {
  await wd.deleteSession().catch(() => undefined);
  driver.kill();
}
writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");
process.exit(failures ? 1 : 0);
