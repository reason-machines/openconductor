import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const out = path.resolve(process.env.SHELL_OUT ?? ".oc-tmp/main-shell");
fs.mkdirSync(out, { recursive: true });
const manifest = path.join(out, "captures.json");
const captures = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")) : {};
for (const state of (process.env.SHELL_STATES ?? "home,repo-menu").split(",")) {
  for (const side of ["ref", "oc"]) {
    const name = `${side}-${state}`;
    const input = {
      browser: { mode: "launch", executable_path: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true },
      start_url: { url: `http://${side === "ref" ? "conductor.localhost" : "localhost"}:4682/?oc_scenario=populated&oc_theme=dark` },
      environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: "dark", locale: "en-US", timezone: "UTC" },
      actions: [
        { step_id: "settle", action: "wait_for_timeout", duration_ms: 3000 },
        ...(state === "repo-menu" ? [{ step_id: "menu", action: "click", locator: { kind: "css", selector: '[aria-label="tide-web actions"]' }, timeout_ms: 5000 }] : []),
        { step_id: "final", action: "wait_for_timeout", duration_ms: 500 },
      ],
      capture: { at_end: ["screenshot", "dom", "url"], events: ["console", "page-errors"] },
    };
    const inputPath = path.join(out, `${name}.input.json`);
    fs.writeFileSync(inputPath, JSON.stringify(input));
    const raw = await new Promise((resolve, reject) => {
      const child = spawn(process.env.REA ?? "/home/runner/rea/node_modules/.bin/rea", ["capture-browser-scenario", inputPath, "--format", "json"], { env: process.env });
      let stdout = "", stderr = "";
      child.stdout.on("data", (s) => stdout += s);
      child.stderr.on("data", (s) => stderr += s);
      child.on("error", reject);
      child.on("close", (code) => code ? reject(new Error(stderr)) : resolve(stdout));
    });
    const ev = JSON.parse(raw);
    const art = ev.normalized_result?.steps?.at(-1)?.artifacts;
    if (art?.screenshot?.state !== "captured") throw new Error(`${name}: screenshot not captured`);
    const png = Buffer.from(art.screenshot.value.data_base64, "base64");
    fs.writeFileSync(path.join(out, `${name}.png`), png);
    captures[name] = { evidence_id: ev.evidence_id, sha256: createHash("sha256").update(png).digest("hex"), dom: art.dom, url: art.url };
    fs.writeFileSync(manifest, JSON.stringify(captures, null, 1));
    console.log(`${name}: ${ev.evidence_id}`);
  }
}
console.log(`PASS main shell REA captures saved to ${out}`);
