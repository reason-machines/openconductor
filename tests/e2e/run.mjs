// Headless end-to-end run of the debug OpenConductor build through tauri-driver.
// Env: OC_APP (path to the debug binary), TAURI_DRIVER (default "tauri-driver"),
// E2E_OUT (artifacts dir, default "e2e-artifacts").
// After each flow it saves <flow>.png; a screenshot that fails or passes its 20 s
// bound (WebDriver.screenshot) is reported in results.json, not skipped silently.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WebDriver } from "./webdriver.mjs";
import { flows } from "./flows.mjs";

const app = resolve(process.env.OC_APP ?? "src-tauri/target/debug/openconductor");
const out = resolve(process.env.E2E_OUT ?? "e2e-artifacts");
await mkdir(out, { recursive: true });

const driver = spawn(process.env.TAURI_DRIVER ?? "tauri-driver", [], { stdio: ["ignore", "inherit", "inherit"] });
const wd = new WebDriver();
const results = [];
const ctx = {}; // shared between flows, e.g. the fixture repo add-repo created
let failed = 0;

try {
  await wd.waitFor("tauri-driver on :4444", async () => (await fetch("http://127.0.0.1:4444/status")).ok, 20000);
  // Fixtures a flow needs before the app starts (e.g. stand-in app bundles).
  for (const flow of flows) await flow.setup?.(ctx);
  await wd.newSession(app);
  for (const flow of flows) {
    const started = Date.now();
    try {
      await flow.run(wd, ctx);
      results.push({ flow: flow.name, status: "pass", ms: Date.now() - started });
      console.log(`PASS ${flow.name}`);
    } catch (e) {
      failed++;
      results.push({ flow: flow.name, status: "fail", ms: Date.now() - started, error: String(e?.message ?? e) });
      console.log(`FAIL ${flow.name}: ${e?.message ?? e}`);
    }
    const shotStarted = Date.now();
    await wd
      .screenshot()
      .then((png) => writeFile(join(out, `${flow.name}.png`), png))
      .catch((e) => {
        results.at(-1).screenshot = String(e?.message ?? e);
        console.log(`no ${flow.name}.png: ${e?.message ?? e}`);
      });
    const shotMs = Date.now() - shotStarted;
    if (shotMs > 2000) console.log(`${flow.name}.png took ${shotMs} ms`);
  }
} catch (e) {
  failed++;
  results.push({ flow: "session", status: "fail", error: String(e?.message ?? e) });
  console.log(`FAIL session: ${e?.message ?? e}`);
} finally {
  await wd.deleteSession();
  driver.kill();
  for (const flow of flows) await Promise.resolve(flow.teardown?.(ctx)).catch((e) => console.log(`teardown ${flow.name}: ${e?.message ?? e}`));
}

await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.flow} | ${r.status} | ${r.ms ?? ""} | ${(r.error ?? "").replace(/\|/g, "\\|")} |`);
  await writeFile(process.env.GITHUB_STEP_SUMMARY, ["| Flow | Result | ms | Error |", "|---|---|---|---|", ...rows, ""].join("\n"), { flag: "a" });
}
process.exit(failed ? 1 : 0);
