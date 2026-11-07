import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const out = path.resolve(process.argv[2] ?? "evidence/terminal/tabs");
const port = process.env.PORT ?? "4404";
const rea = process.env.REA ?? "rea";
const target = process.env.CAPTURE_TARGET;
const css = (selector) => ({ kind: "css", selector });
fs.mkdirSync(out, { recursive: true });
const captures = {};
for (const app of ["reference", "openconductor"]) {
  if (target && target !== app) continue;
  for (const state of ["single", "renumbered"]) {
    const name = `${app}-${state}`;
    const actions = [{ step_id: "loaded", action: "wait_for_timeout", duration_ms: 2000 }];
    const click = (id, selector) => {
      actions.push({ step_id: id, action: "click", locator: css(selector), timeout_ms: 5000 });
      actions.push({ step_id: `${id}-settled`, action: "wait_for_timeout", duration_ms: 350 });
    };
    if (app === "reference") {
      click("repository", "text=tide-web");
      click("workspace", "text=Ada/dark mode tokens");
    }
    click("terminal-one", "button[aria-label='New terminal']");
    if (state === "renumbered") {
      click("terminal-two", "button[aria-label='New terminal']");
      click("terminal-three", "button[aria-label='New terminal']");
      click("close-middle", app === "reference" ? "[role=tab][aria-label='Terminal 2'] [role=button]" : ".term-tab:nth-of-type(2) button[aria-label='Close terminal']");
    }
    actions.push({ step_id: "screen", action: "wait_for", locator: css(".xterm-rows:visible >> nth=0"), state: "visible", timeout_ms: 5000 });
    click("focus-screen", ".xterm-screen:visible >> nth=0");
    actions.push({ step_id: "settled", action: "wait_for_timeout", duration_ms: 400 });
    const input = {
      browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
      start_url: { url: app === "reference" ? `http://conductor.localhost:${port}/?oc_scenario=populated&oc_theme=dark&oc_script_output=1` : `http://localhost:${port}/?kind=setup&palette=stone` },
      environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions,
      capture: { at_end: ["screenshot", "dom", "url"], events: ["console", "page-errors"] },
    };
    const scenario = path.join(out, `${name}-scenario.json`);
    fs.writeFileSync(scenario, JSON.stringify(input, null, 2) + "\n");
    const result = spawnSync(rea, ["capture-browser-scenario", scenario, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 27 });
    const evidence = JSON.parse(result.stdout);
    const artifact = evidence.normalized_result?.steps?.at(-1)?.artifacts;
    if (artifact?.screenshot?.state !== "captured") {
      fs.writeFileSync(path.join(out, `${name}-failure.json`), JSON.stringify(evidence, null, 2));
      throw new Error(`${name} capture failed`);
    }
    const png = Buffer.from(artifact.screenshot.value.data_base64, "base64");
    fs.writeFileSync(path.join(out, `${name}.png`), png);
    captures[name] = { evidence_id: evidence.evidence_id, sha256: createHash("sha256").update(png).digest("hex"), scenario: `${name}-scenario.json`, screenshot: `${name}.png`, url: artifact.url?.value, issues: evidence.normalized_result?.issues ?? [] };
    fs.writeFileSync(path.join(out, `${target ?? "all"}-captures.json`), JSON.stringify({ tool: "REA capture-browser-scenario", captures }, null, 2) + "\n");
    console.log(name, captures[name].evidence_id);
  }
}
