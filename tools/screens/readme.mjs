// Regenerates evidence/screens/README.md from manifest.json and gaps.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "../../evidence/screens");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const gapsFile = path.join(dir, "gaps.json");
const gaps = fs.existsSync(gapsFile) ? JSON.parse(fs.readFileSync(gapsFile, "utf8")) : [];

const rows = Object.values(manifest)
  .map(
    (m) =>
      `| [${m.file}](${m.file}) | ${m.theme} | \`${m.scenario}\` | ${m.actions.length ? m.actions.join(" → ") : "load"} | ${m.notes.replace(/\|/g, "\\|")} | \`${m.png_sha256.slice(0, 12)}\` |`,
  )
  .join("\n");
const gapRows = gaps.map((g) => `| ${g.screen} | ${g.reason.replace(/\|/g, "\\|")} |`).join("\n");

const md = `# Conductor reference screenshots

Pixel references of Conductor's screens for OpenConductor verifiers. Reference evidence only: no Conductor logos, brand assets or source are stored here, only screenshots of the running UI with invented data.

## Source build

- Conductor **0.87.6** (\`com.conductor.app\`, Team 27XN666UJ7), \`MacOS/conductor\` sha256 \`0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d\`.
- Frontend: the embedded Tauri asset table, extracted with \`tools/extract_tauri_assets.py\` (2,902 entries, 54 MB); \`index.html\` sha256 \`48b778fa0c04f73e55a744c99873cf8cafe942ba7613f24c533b0963b1cf411b\`. The dist stays outside the repository (\`.rea-work/dist\`, git-excluded).

## How they were taken

- Tool: REA (\`rea-agents@6.7.0\`) \`capture_browser_scenario\`, run as \`rea capture-browser-scenario <input.json> --format json\` with \`browser: {mode: "launch", executable_path: "/usr/bin/chromium", headless: true}\`, viewport 1440x900 at scale 1, locale en-US, timezone UTC, reduced motion. Each shot's REA \`evidence_id\` and \`scenario_sha256\` are in [manifest.json](manifest.json).
- Harness: [tools/screens](../../tools/screens) serves the dist and injects a mock of Tauri's IPC (\`window.__TAURI_INTERNALS__\`) before the app boots: \`plugin:sql\` runs on sql.js databases built from [evidence/sqlite](../sqlite) schemas plus synthetic seed rows; \`plugin:fs\` is a virtual filesystem; the keychain returns a fake token and a cached synthetic user ("Ada Demo") for signed-in scenarios. A CSP (\`connect-src 'self'\`) and a fetch guard keep the page off the network, so Sentry, PostHog, \`api.conductor.build\` and CDN requests never leave the browser.
- Theme: \`?oc_theme=light|dark\` seeds Conductor's file-backed local storage (\`melty-theme-selected-mode\`), in the layout the app itself writes when the theme is switched in Settings > Appearance.
- Shot definitions: [tools/screens/shots](../../tools/screens/shots). Rerun with \`cd tools/screens && npm i && TMPDIR=/tmp/t node capture.mjs shots/<file>.json\` (Chromium needs a short \`TMPDIR\`), then \`node readme.mjs\`.

## Known differences from the real app

- Rendered by Chromium on Linux, not WKWebView on macOS: font rasterisation differs slightly, and there are no native traffic lights or window vibrancy (the app paints the area, the OS does not).
- The Lottie logo animation needs a WASM file from a CDN, which the harness blocks, so animated logos fall back or stay blank.
- Pages load from \`http://conductor.localhost:4317\`, not \`localhost\`: Conductor bundles Virtuoso Message List, whose license check treats \`localhost\` as a development host and swaps the chat transcript for an expired-license banner (key expiry 2026-11-03). This describes the retained Chromium fixture, not a guarantee of native behavior.
- A [retained native executor AX snapshot](https://reasonmachines.com/agents/e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46) from 2026-11-08 03:47Z identifies \`com.conductor.app\` (PID 95788) and includes the expired Virtuoso Message List warning. This conflicts with the former assertion that the banner never appears in Conductor's webview. This is historical accessibility evidence, not pixel proof or a fresh native observation. Its source-build match and trigger conditions remain unverified. It does not establish an OpenConductor defect or parity target.
- Anything that needs GitHub or Conductor's servers (PR status, checks, announcements, cloud workspaces) shows its offline or error state, for example "Couldn't load PR info" in the right panel.
- Populated scenarios use invented data: repos tide-web, tide-api and dotfiles; six workspaces named after cities; one transcript in "lisbon". Git answers come from a small fake in [fixtures.js](../../tools/screens/fixtures.js).
- The onboarding carousel plays bundled videos, so its right-hand panel shows whichever frame was current at capture time.

## Screenshots

| File | Theme | Scenario | Steps | What it shows | sha256 |
|---|---|---|---|---|---|
${rows}

## REA notes from this run

- No REA bug found. \`capture-browser-scenario\` was deterministic: reruns of the same scenario produced byte-identical PNGs (same sha256).
- Usage pitfalls (schema, not bugs): \`wait_for_timeout\` takes \`duration_ms\`, not \`timeout_ms\`; every action needs a \`step_id\`; a failed step skips every later step, and the final artifact then reports \`state: "missing", reason: "action was not executed after an earlier failure"\` without naming the failed step at that level, so you have to read each step's own result to find it.
- Gap: there is no init-script or request-interception option, so the Tauri mock has to be injected by the HTTP server. A css locator such as \`text=Diagnostics\` that matches several elements fails (Playwright strict mode), which looks the same as a timeout.
- Environment: Chromium aborts with "Socket path too long" under the long session \`TMPDIR\`; use \`TMPDIR=/tmp/t\`.

## Not captured

${gaps.length ? `| Screen | Reason |\n|---|---|\n${gapRows}` : "Nothing yet."}
`;
fs.writeFileSync(path.join(dir, "README.md"), md);
console.log(`README: ${Object.keys(manifest).length} screenshots, ${gaps.length} gaps`);
