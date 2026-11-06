// One supervised preview, one REA browser at a time. No real agent or user data.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const lane = process.env.SETTINGS_LANE ?? "oc";
const out = path.resolve(process.env.SETTINGS_OUT ?? "evidence/settings/local-pages");
const port = Number(process.env.PORT ?? 51749);
const rea = process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea";
const only = process.env.ONLY_SETTINGS?.split(",");
const pages = ["general", "appearance", "models", "git", "environment", "experimental", "advanced"].map((id) => ({ id, route: `/settings/user/${id}` }));
pages.push(
  { id: "appearance-lower", route: "/settings/user/appearance", actions: [{ action: "click", locator: { kind: "css", selector: 'text="Markdown Style"' } }] },
  { id: "agents-claude", route: "/settings/user/providers", actions: lane === "oc" ? [{ action: "click", locator: { kind: "css", selector: 'text="Claude Code"' } }] : [] },
  { id: "agents-codex", route: "/settings/user/providers", actions: [{ action: "click", locator: { kind: "css", selector: 'text="Codex"' } }] },
  { id: "terminal", route: lane === "ref" ? "/settings/user/experimental" : "/settings/user/terminal", actions: lane === "ref" ? [{ action: "click", locator: { kind: "css", selector: "#big-terminal-mode" } }, { action: "click", locator: { kind: "css", selector: 'text="Big terminal"' } }] : [] },
  ...["environment", "git", "scripts", "actions", "misc"].map((id) => ({ id: `repo-${id}`, route: `/settings/repos/repo-tide-web/${id}` })),
);
fs.mkdirSync(out, { recursive: true });
const scratch = path.resolve(".oc-tmp/settings-captures");
fs.mkdirSync(scratch, { recursive: true });
const manifestFile = path.join(out, `${lane}.json`);
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile)) : {};
let failed = false;
for (const page of pages) {
  if (only && !only.includes(page.id)) continue;
  const input = {
    browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
    start_url: { url: `http://${lane === "ref" ? "conductor.localhost" : "localhost"}:${port}${page.route}?oc_scenario=populated&oc_theme=dark${page.query ?? ""}` },
    environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions: [
      { step_id: "settle", action: "wait_for_timeout", duration_ms: 3000 },
      ...(page.actions ?? []).flatMap((action, index) => [{ step_id: `action-${index}`, timeout_ms: 7000, ...action }, { step_id: `settle-${index}`, action: "wait_for_timeout", duration_ms: 400 }]),
      { step_id: "ready", action: "wait_for_timeout", duration_ms: 1000 },
    ],
    capture: { at_end: ["screenshot", "url", "dom"], events: ["page-errors"] },
  };
  const spec = path.join(scratch, `${lane}-${page.id}.scenario.json`);
  fs.writeFileSync(spec, JSON.stringify(input));
  try {
    const { stdout } = await exec(rea, ["capture-browser-scenario", spec, "--format", "json"], { maxBuffer: 1 << 27, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    const evidence = JSON.parse(stdout);
    const art = evidence.normalized_result?.steps?.at(-1)?.artifacts;
    if (art?.screenshot?.state !== "captured") throw new Error(`screenshot ${art?.screenshot?.state}`);
    if (lane === "oc" && page.id.startsWith("agents-")) {
      const tab = page.id === "agents-claude" ? "Claude Code" : "Codex";
      if (!art.dom?.value?.text?.includes(`aria-label="${tab}"`)) throw new Error(`Wrong active agent tab: expected ${tab}`);
    }
    const png = Buffer.from(art.screenshot.value.data_base64, "base64");
    const image = `${lane}-${page.id}.png`;
    fs.writeFileSync(path.join(out, image), png);
    fs.writeFileSync(path.join(scratch, `${lane}-${page.id}.dom.html`), art.dom?.value?.text ?? "");
    manifest[page.id] = { evidence_id: evidence.evidence_id, final_url: art.url?.value?.url, png: image, sha256: createHash("sha256").update(png).digest("hex"), viewport: input.environment.viewport, status: "captured", events: evidence.normalized_result?.events };
    console.log(`SETTINGS_CAPTURE ${lane} ${page.id} ${evidence.evidence_id}`);
  } catch (error) {
    failed = true;
    manifest[page.id] = { status: "failed", error: String(error).slice(0, 1000) };
    console.error(`SETTINGS_CAPTURE_FAILED ${lane} ${page.id}`, String(error).slice(0, 500));
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(failed ? "SETTINGS_CAPTURES_PARTIAL" : "SETTINGS_CAPTURES_COMPLETE");
if (failed) throw new Error("One or more settings states failed to capture");
