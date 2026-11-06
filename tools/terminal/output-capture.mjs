import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const out = path.resolve(process.argv[2] ?? "evidence/terminal/output");
const port = process.env.PORT ?? "4398";
const rea = process.env.REA ?? "rea";
const css = (selector) => ({ kind: "css", selector });
fs.mkdirSync(out, { recursive: true });
const cases = {
  reference: {
    url: `http://conductor.localhost:${port}/?oc_scenario=populated&oc_theme=dark&oc_setup_script=npm%20install&oc_run_script=npm%20run%20dev&oc_script_output=1`,
    selectors: ["text=tide-web", "text=Ada/dark mode tokens", "[role=tab] >> text=Setup", "button:text-is('Run setup')"],
  },
  openconductor: {
    url: `http://localhost:${port}/?kind=setup&running=1`,
    selectors: ["[role=tab] >> text=Setup"],
  },
};
const captures = {};
for (const [name, scenario] of Object.entries(cases)) {
  const actions = [{ step_id: "loaded", action: "wait_for_timeout", duration_ms: 2500 }];
  scenario.selectors.forEach((selector, i) => {
    actions.push({ step_id: `click-${i}`, action: "click", locator: css(selector), timeout_ms: 5000 });
    actions.push({ step_id: `settle-${i}`, action: "wait_for_timeout", duration_ms: 800 });
  });
  actions.push({ step_id: "output", action: "wait_for", locator: css(".xterm-rows"), state: "visible", timeout_ms: 5000 });
  const input = {
    browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
    start_url: { url: scenario.url },
    environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
    actions,
    capture: { at_end: ["screenshot", "dom", "url"], events: ["console", "page-errors"] },
  };
  const file = path.join(out, `${name}-scenario.json`);
  fs.writeFileSync(file, JSON.stringify(input, null, 2) + "\n");
  const result = spawnSync(rea, ["capture-browser-scenario", file, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 27 });
  const evidence = JSON.parse(result.stdout);
  const artifact = evidence.normalized_result?.steps?.at(-1)?.artifacts;
  if (artifact?.screenshot?.state !== "captured") {
    fs.writeFileSync(path.join(out, `${name}-failure.json`), JSON.stringify(evidence, null, 2));
    throw new Error(`${name} capture failed; inspect ${name}-failure.json`);
  }
  const png = Buffer.from(artifact.screenshot.value.data_base64, "base64");
  fs.writeFileSync(path.join(out, `${name}.png`), png);
  const dom = artifact.dom?.value;
  fs.writeFileSync(path.join(out, `${name}-dom.json`), JSON.stringify(dom));
  captures[name] = { evidence_id: evidence.evidence_id, sha256: createHash("sha256").update(png).digest("hex"), scenario: `${name}-scenario.json`, screenshot: `${name}.png`, url: artifact.url?.value, issues: evidence.normalized_result?.issues ?? [] };
  console.log(name, captures[name].evidence_id);
}
fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify({ tool: "REA capture-browser-scenario", viewport: { width: 1280, height: 820 }, state: "setup-running-ansi-output", captures }, null, 2) + "\n");
