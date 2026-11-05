// Conductor side of the UI map: renders Conductor's extracted frontend with
// Tauri IPC mocked from evidence (tools/screens harness) and captures every
// state in states.json with REA capture-browser-scenario: screenshot, URL,
// DOM and accessibility tree.
//
//   DIST=.rea-work/dist TMPDIR=/tmp/t node tools/ui-map/capture_ref.mjs [state-id ...]
//
// Needs REA (npm rea-agents, `rea` on PATH or REA=...), Chromium (CHROMIUM=...)
// and `npm ci` in tools/screens (sql.js). Writes UIMAP_OUT/ref/<state>.png and
// UIMAP_OUT/ref-captures.json (default parity/ui-map).
//
// REA fails a whole scenario when one locator matches nothing and does not say
// which step it was, so a failed state is retried with ever shorter action
// prefixes; the longest prefix that runs is kept and the next step is recorded
// as the failing one.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const repoRoot = resolve(here, "../..");
const out = resolve(process.env.UIMAP_OUT ?? join(repoRoot, "parity/ui-map"));
const REA = process.env.REA ?? "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4317);
const HOST = "conductor.localhost"; // not "localhost": see evidence/screens/README.md (Virtuoso license check)
const spec = JSON.parse(readFileSync(join(here, "states.json"), "utf8"));
const only = process.argv.slice(2);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const tmp = process.env.TMPDIR ?? "/tmp";

function reaAction(a, i) {
  const id = `s${i}`;
  const loc = (sel) => {
    const role = sel.match(/^role=(\w+)\[name='([^']+)'\]$/);
    return role ? { kind: "role", role: role[1], name: role[2] } : { kind: "css", selector: sel };
  };
  if (a.wait) return { step_id: id, action: "wait_for", locator: loc(a.wait), state: "visible", timeout_ms: 10000 };
  if (a.click) return { step_id: id, action: "click", locator: loc(a.click), timeout_ms: 5000 };
  if (a.rclick) return { step_id: id, action: "click", locator: loc(a.rclick), button: "right", timeout_ms: 5000 };
  if (a.hover) return { step_id: id, action: "hover", locator: loc(a.hover), timeout_ms: 5000 };
  if (a.press) return { step_id: id, action: "press", locator: { kind: "css", selector: "body" }, key: a.press, timeout_ms: 5000 };
  if (a.fill) return { step_id: id, action: "fill", locator: loc(a.fill[0]), value: { source: "literal", value: a.fill[1] }, timeout_ms: 5000 };
  throw new Error(`unknown ref action ${JSON.stringify(a)}`);
}

function capture(st, actions) {
  const q = new URLSearchParams({ oc_scenario: st.ref.scenario ?? "signed-in", oc_theme: spec.theme });
  const steps = [];
  actions.forEach((a, i) => {
    steps.push(reaAction(a, i));
    steps.push({ step_id: `p${i}`, action: "wait_for_timeout", duration_ms: 500 });
  });
  const input = {
    browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
    start_url: { url: `http://${HOST}:${PORT}${st.ref.path ?? "/"}?${q}` },
    environment: { viewport: { ...spec.viewport, device_scale_factor: 1 }, color_scheme: spec.theme, locale: "en-US", timezone: "UTC" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: st.ref.settle_ms ?? 4000 },
      ...steps,
      { step_id: "final_settle", action: "wait_for_timeout", duration_ms: st.ref.final_settle_ms ?? st.final_settle_ms ?? 1000 },
    ],
    capture: { at_end: ["screenshot", "url", "dom", "accessibility"], events: ["console", "page-errors"] },
  };
  const file = join(tmp, `uimap-ref-${st.id}.json`);
  writeFileSync(file, JSON.stringify(input));
  const res = spawnSync(REA, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  try {
    const ev = JSON.parse(res.stdout);
    const art = ev.normalized_result?.steps?.at(-1)?.artifacts ?? {};
    if (art.screenshot?.state !== "captured") return { ok: false, error: `screenshot ${art.screenshot?.state}` };
    return { ok: true, ev, art };
  } catch {
    return { ok: false, error: (res.stderr || res.stdout || `exit ${res.status}`).replace(/\s+/g, " ").slice(0, 300) };
  }
}

function visibleText(html) {
  // Text nodes and labels from the captured DOM, minus scripts and styles.
  const body = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ");
  const texts = [];
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const t = m[1].replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    if (t) texts.push(t);
  }
  const labels = [...body.matchAll(/\s(?:aria-label|title|placeholder)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
  const roles = [...body.matchAll(/\srole="(dialog|menu|listbox|tooltip|alertdialog|status)"/g)].map((m) => m[1]);
  return { texts, labels, roles };
}

const server = spawn(process.execPath, [join(repoRoot, "tools/screens/server.mjs")], {
  env: { ...process.env, PORT: String(PORT), DIST: resolve(process.env.DIST ?? join(repoRoot, ".rea-work/dist")), LOG_DIR: join(tmp, "uimap-ipc") },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/__health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

mkdirSync(join(out, "ref"), { recursive: true });
const manifestPath = join(out, "ref-captures.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
try {
  for (const st of spec.states) {
    if (only.length && !only.includes(st.id)) continue;
    if (!st.ref) {
      manifest[st.id] = { status: "no-reference", reason: st.ref_reason ?? "no reference scenario" };
      continue;
    }
    const acts = st.ref.actions ?? [];
    let n = acts.length;
    let r = capture(st, acts);
    let firstError = r.error;
    while (!r.ok && n > 0) {
      n--;
      r = capture(st, acts.slice(0, n));
    }
    const rec = { path: st.ref.path ?? "/", scenario: st.ref.scenario ?? "signed-in", actions_run: n, actions_total: acts.length };
    if (!r.ok) {
      manifest[st.id] = { ...rec, status: "capture-failed", error: firstError };
      console.log(`capture-failed ${st.id}: ${firstError}`);
      continue;
    }
    rec.status = n === acts.length ? "captured" : "step-failed";
    if (n < acts.length) {
      rec.failed_step = n;
      rec.failed_action = acts[n];
      rec.error = firstError;
    }
    const png = Buffer.from(r.art.screenshot.value.data_base64, "base64");
    writeFileSync(join(out, "ref", `${st.id}.png`), png);
    rec.file = `ref/${st.id}.png`;
    rec.png_sha256 = sha256(png);
    rec.rea = {
      tool: "capture_browser_scenario",
      evidence_id: r.ev.evidence_id,
      scenario_sha256: r.ev.parameters?.scenario_sha256 ?? null,
      browser: `${r.ev.normalized_result?.browser?.product ?? ""} ${r.ev.normalized_result?.browser?.version ?? ""}`.trim(),
      final_url: r.art.url?.value?.url ?? null,
      page_errors: (JSON.stringify(r.ev.normalized_result?.events ?? []).match(/"page-error/g) || []).length,
    };
    rec.dom = visibleText(r.art.dom?.value?.text ?? "");
    manifest[st.id] = rec;
    console.log(`${rec.status.padEnd(14)} ${st.id}${rec.error ? ` (ran ${n}/${acts.length}): ${rec.error.slice(0, 120)}` : ""}`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
  }
} finally {
  server.kill();
}
writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");
