import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const out = path.resolve(process.argv[2] ?? "evidence/terminal/lifecycle");
const port = process.env.PORT ?? "4404";
const captures = {};
fs.mkdirSync(out, { recursive: true });
for (const app of ["reference", "openconductor"]) {
  for (const state of ["starting", "exited"]) {
    const actions = [{ step_id: "loaded", action: "wait_for_timeout", duration_ms: 1800 }];
    const click = (step_id, selector) => actions.push({ step_id, action: "click", locator: { kind: "css", selector }, timeout_ms: 5000 });
    if (app === "reference") {
      click("repository", "text=tide-web");
      click("workspace", "text=Ada/dark mode tokens");
    }
    click("terminal", "button[aria-label='New terminal']");
    actions.push({ step_id: "settled", action: "wait_for_timeout", duration_ms: 1600 });
    const input = {
      browser: { mode: "launch", executable_path: "/usr/bin/chromium", headless: true },
      start_url: { url: app === "reference"
        ? `http://conductor.localhost:${port}/?oc_scenario=populated&oc_theme=dark&oc_script_output=1&oc_terminal_lifecycle=${state}`
        : `http://localhost:${port}/?kind=setup&palette=stone&terminalLifecycle=${state}` },
      environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions,
      capture: { at_end: ["screenshot", "dom", "url"], events: ["console", "page-errors"] },
    };
    const name = `${app}-${state}`;
    const scenario = path.join(out, `${name}-scenario.json`);
    fs.writeFileSync(scenario, JSON.stringify(input, null, 2) + "\n");
    const result = spawnSync(process.env.REA ?? "rea", ["capture-browser-scenario", scenario, "--format", "json"], { encoding: "utf8", maxBuffer: 1 << 27 });
    const evidence = JSON.parse(result.stdout);
    const artifact = evidence.normalized_result?.steps?.at(-1)?.artifacts;
    if (artifact?.screenshot?.state !== "captured") throw new Error(`${name}: capture failed: ${result.stderr}`);
    const dom = artifact.dom?.value?.text ?? "";
    if (state === "exited" && !dom.includes(app === "reference" ? "fill-muted-foreground text-muted-foreground" : 'aria-label="Exited (code 0)"')) {
      throw new Error(`${name}: exited indicator was not rendered`);
    }
    const png = Buffer.from(artifact.screenshot.value.data_base64, "base64");
    fs.writeFileSync(path.join(out, `${name}.png`), png);
    fs.writeFileSync(path.join(out, `${name}-dom.json`), JSON.stringify(artifact.dom, null, 2));
    captures[name] = { evidence_id: evidence.evidence_id, sha256: createHash("sha256").update(png).digest("hex"), url: artifact.url?.value, issues: evidence.normalized_result?.issues ?? [] };
    fs.writeFileSync(path.join(out, "captures.json"), JSON.stringify(captures, null, 2) + "\n");
    console.log(name, captures[name].evidence_id);
  }
}
