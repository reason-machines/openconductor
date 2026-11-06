// Sidebar alignment sweep: measures every control of the sidebar's rows with
// getBoundingClientRect in Conductor (tools/screens: its extracted frontend with
// the mocked IPC) and in OpenConductor (tools/sidebar-screens: our Vite build with
// seeded data), at the same 1440x900 window and the environment REA's
// capture-browser-scenario uses (dark, en-US, UTC, reduced motion, no service
// workers). Both apps show the "populated" scenario with tide-web and tide-api
// expanded, as in evidence/screens/sidebar--repos-expanded--dark.png.
//
//   npm run build && TMPDIR=/tmp/t node tools/sidebar-screens/measure-alignment.mjs [OUT_DIR]
//
// Needs Conductor's renderer at .rea-work/dist (C_DIST; never committed); ours is
// read from dist/ (O_DIST, e.g. a build of the base branch for a before shot). Writes
// <OUT_DIR>/measurements.json, table.md and conductor.png / ours.png (full
// window). OUT_DIR defaults to .oc-tmp/align. Exits 1 when a part differs from
// Conductor by more than TOLERANCE px (default 1) in y, height or vertical centre.
//
// Clicks are dispatched as DOM click events: a real pointer click on Conductor's
// repo header is taken by its drag-and-drop handle (@hello-pangea/dnd) in plain
// Playwright, while REA's capture expands it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, ".oc-tmp/align"));
const TOLERANCE = Number(process.env.TOLERANCE ?? 1);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each row: a root element and named parts inside it. A part is an element
// (its border box) or `text:` (the line box of its first text node, which is
// where the glyphs sit). Selectors run in the page.
const SPECS = {
  conductor: {
    header: { root: "[data-sidebar=header]", parts: { toggle: "[data-sidebar=trigger]", toggleIcon: "[data-sidebar=trigger] svg", back: "[aria-label='Go back']", backIcon: "[aria-label='Go back'] svg", forward: "[aria-label='Go forward']", forwardIcon: "[aria-label='Go forward'] svg" } },
    account: { root: "[aria-label='Account menu']", parts: { avatar: ":scope > span:first-child", label: "text:span.truncate", chevron: ":scope > svg" } },
    home: { root: "row:Home", parts: { icon: "svg", label: "text:span" } },
    create: { root: "row:Create", parts: { icon: "svg", label: "text:span" } },
    search: { root: "row:Search", parts: { icon: "svg", label: "text:span" } },
    sectionHeader: { root: "section:My workspaces", parts: { label: "text:span", chevron: "svg", more: "^[aria-label='My workspaces actions']" } },
    repoExpanded: { root: "[data-rfd-drag-handle-draggable-id=repo-tide-web]", parts: { icon: "div.h-4.w-4", name: "text:span.font-semibold", add: "button[aria-label='Create workspace']", addIcon: "button[aria-label='Create workspace'] svg", more: "^[aria-label='tide-web actions']" } },
    repoCollapsed: { root: "[data-rfd-drag-handle-draggable-id=repo-dotfiles]", parts: { icon: "div.h-4.w-4", name: "text:span.font-semibold", count: "text:span.font-mono", add: "button[aria-label='Create workspace']" } },
    workspace: { root: "a[href$='/ws-osaka']", parts: { lead: "[data-testid=workspace-leading-visual]", statusIcon: "[data-testid=workspace-leading-visual] svg", shortcut: "text:[data-testid=workspace-leading-visual] span", title: "text:span.truncate", titleBox: "span.truncate" } },
    workspaceDiff: { root: "a[href$='/ws-lisbon']", parts: { statusIcon: "[data-testid=workspace-leading-visual] svg", title: "text:span.truncate", titleBox: "span.truncate", added: "text:diff+", removed: "text:diff-" } },
    footer: { root: "[data-sidebar=footer] > div", parts: { plan: "[aria-label='View pricing'] > div", help: "button[aria-haspopup=dialog] svg", settings: "[aria-label=Settings] svg" } },
  },
  ours: {
    header: { root: ".sb-header", parts: { toggle: ".sb-toggle", toggleIcon: ".sb-toggle svg", back: "[aria-label='Go back']", backIcon: "[aria-label='Go back'] svg", forward: "[aria-label='Go forward']", forwardIcon: "[aria-label='Go forward'] svg" } },
    account: { root: "[aria-label='Account menu']", parts: { avatar: ".sb-avatar", label: "text:.sb-computer-name", chevron: ":scope > svg, :scope > span:last-child svg" } },
    home: { root: "row:Home", parts: { icon: "svg", label: "text:.sb-row-label" } },
    create: { root: "row:Create", parts: { icon: "svg", label: "text:.sb-row-label" } },
    search: { root: "row:Search", parts: { icon: "svg", label: "text:.sb-row-label" } },
    sectionHeader: { root: "section:My workspaces", parts: { label: "text:.sb-section-label", chevron: ".sb-section-chevron svg", more: "^.sb-section-menu .sb-menu-trigger" } },
    repoExpanded: { root: "repo:tide-web", parts: { icon: ".sb-repo-initial, .repo-icon", name: "text:.sb-repo-name", add: ".sb-repo-add", addIcon: ".sb-repo-add svg", more: "^^.sb-repo-menu .sb-menu-trigger" } },
    repoCollapsed: { root: "repo:dotfiles", parts: { icon: ".sb-repo-initial, .repo-icon", name: "text:.sb-repo-name", count: "text:.sb-repo-count", add: ".sb-repo-add" } },
    workspace: { root: "ws:Ada/dark mode tokens", parts: { lead: "[data-testid=workspace-leading-visual]", statusIcon: "[data-testid=workspace-status-icon] svg", shortcut: "text:.sb-ws-hint", title: "text:.sb-ws-name", titleBox: ".sb-ws-name" } },
    workspaceDiff: { root: "ws:Ada/fix login redirect", parts: { statusIcon: "[data-testid=workspace-status-icon] svg", title: "text:.sb-ws-name", titleBox: ".sb-ws-name", added: "text:diff+", removed: "text:diff-" } },
    footer: { root: ".sb-footer", parts: { plan: ".sb-plan-badge", help: ".sb-help svg", settings: "[aria-label=Settings] svg" } },
  },
};

function measureInPage(spec) {
  const r = (b) => ({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), cy: +(b.y + b.height / 2).toFixed(2) });
  const aside = document.querySelector("aside");
  const findRoot = (sel) => {
    const [kind, ...rest] = sel.split(":");
    const text = rest.join(":");
    const all = (s) => Array.from(aside.querySelectorAll(s));
    if (kind === "row") return all("[data-sidebar=header] .group, .sb-primary .sb-row").find((e) => e.textContent.trim().startsWith(text));
    if (kind === "section") return all("button").find((e) => e.textContent.trim() === text);
    if (kind === "repo") return all(".sb-repo-header").find((e) => e.querySelector(".sb-repo-name")?.textContent === text);
    if (kind === "ws") return all(".sb-ws").find((e) => e.querySelector(".sb-ws-name")?.textContent === text);
    return aside.querySelector(sel);
  };
  const out = {};
  for (const [row, { root, parts }] of Object.entries(spec)) {
    const el = findRoot(root);
    if (!el) { out[row] = { missing: root }; continue; }
    const res = { row: r(el.getBoundingClientRect()), parts: {} };
    for (const [name, sel0] of Object.entries(parts)) {
      let sel = sel0, scope = el;
      while (sel.startsWith("^")) { scope = scope.parentElement; sel = sel.slice(1); }
      const isText = sel.startsWith("text:");
      if (isText) sel = sel.slice(5);
      let node;
      if (sel === "diff+" || sel === "diff-") {
        const re = sel === "diff+" ? /^\+\d+$/ : /^-\d+$/;
        node = Array.from(scope.querySelectorAll("span")).find((e) => e.children.length === 0 && re.test(e.textContent.trim()));
      } else node = scope.querySelector(sel);
      if (!node) { res.parts[name] = null; continue; }
      let box = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      const info = {};
      if (isText) {
        const t = Array.from(node.childNodes).find((c) => c.nodeType === 3 && c.textContent.trim()) ?? document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
        if (t) { const range = document.createRange(); range.selectNodeContents(t); box = range.getBoundingClientRect(); }
        Object.assign(info, { text: node.textContent.trim().slice(0, 24), font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}` });
      }
      let op = 1;
      for (let e = node; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      res.parts[name] = { ...r(box), ...info, ...(op < 1 ? { opacity: +op.toFixed(2) } : {}) };
    }
    out[row] = res;
  }
  return out;
}

const servers = [
  spawn(process.execPath, [path.join(repoRoot, "tools/screens/server.mjs")], { env: { ...process.env, PORT: process.env.C_PORT ?? "4791", DIST: process.env.C_DIST ?? path.join(repoRoot, ".rea-work/dist") }, stdio: "ignore" }),
  spawn(process.execPath, [path.join(here, "server.mjs")], { env: { ...process.env, PORT: process.env.O_PORT ?? "4792", DIST: process.env.O_DIST ?? path.join(repoRoot, "dist") }, stdio: "ignore" }),
];
await sleep(1500);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const results = {};
try {
  for (const [app, url] of [
    ["conductor", `http://conductor.localhost:${process.env.C_PORT ?? 4791}/?oc_scenario=populated&oc_theme=dark`],
    ["ours", `http://localhost:${process.env.O_PORT ?? 4792}/?oc_scenario=populated&oc_theme=dark`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(url);
    await sleep(6000);
    for (const repo of ["tide-web", "tide-api"]) {
      await page.locator(`aside >> text=${repo}`).first().dispatchEvent("click");
      await sleep(800);
    }
    await page.mouse.move(1000, 450);
    await sleep(1200);
    await page.screenshot({ path: path.join(outDir, `${app}.png`) });
    results[app] = await page.evaluate(measureInPage, SPECS[app]);
    // Hover states, for the crops: the repo and section "..." buttons only show on hover.
    for (const [name, text] of [["hover-repo", "tide-api"], ["hover-section", "My workspaces"]]) {
      await page.locator(`aside >> text=${text}`).first().hover();
      await sleep(400);
      await page.screenshot({ path: path.join(outDir, `${app}-${name}.png`) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  servers.forEach((s) => s.kill());
}

fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(results, null, 2));
const fmt = (p) => (p ? `${p.y} / ${p.h} / ${p.cy}` : "absent");
const lines = ["| Row | Part | Conductor y / h / centre | Ours y / h / centre | Δ centre | Δ h | x+w Conductor → ours |", "|---|---|---|---|---|---|---|"];
let failures = 0;
for (const row of Object.keys(SPECS.conductor)) {
  const c = results.conductor[row], o = results.ours[row];
  if (!c?.row || !o?.row) { lines.push(`| ${row} | (row) | ${c?.row ? fmt(c.row) : "missing"} | ${o?.row ? fmt(o.row) : "missing"} | | | |`); failures++; continue; }
  for (const part of ["(row)", ...Object.keys(SPECS.conductor[row].parts)]) {
    const cp = part === "(row)" ? c.row : c.parts[part];
    const op = part === "(row)" ? o.row : o.parts[part];
    const dcy = cp && op ? +(op.cy - cp.cy).toFixed(2) : null;
    const dh = cp && op ? +(op.h - cp.h).toFixed(2) : null;
    const bad = (cp && !op) || (dcy !== null && (Math.abs(dcy) > TOLERANCE || Math.abs(dh) > TOLERANCE));
    if (bad) failures++;
        const xw = (p) => `${p.x}+${p.w}`;
    lines.push(`| ${row} | ${part} | ${fmt(cp)} | ${fmt(op)} | ${dcy ?? ""}${bad ? " ✗" : ""} | ${dh ?? ""} | ${cp && op ? `${xw(cp)} → ${xw(op)}` : ""} |`);
  }
}
fs.writeFileSync(path.join(outDir, "table.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\n${failures} part(s) off by more than ${TOLERANCE}px`);
process.exit(failures ? 1 : 0);
