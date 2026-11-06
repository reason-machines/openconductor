// Isolated visual proof: decoded Conductor at /__reference/, our build at /.
// REF_DIST and SQL_JS point at read-only reference assets and sql.js respectively.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fakeBackend, SHELL, FILES } from "../../tests/e2e/right-panel-fixture.mjs";
import { DEFAULT_APP_PREFS } from "../../src/settings/appPrefs.ts";
import { installOpenInBackend } from "../../tests/e2e/open-in-fixture.mjs";

const root = process.cwd();
const ref = process.env.REF_DIST;
const sql = process.env.SQL_JS;
const port = Number(process.env.PORT ?? 4518);
const apps = [
  ["finder", "Finder", "folder"], ["cursor", "Cursor", "code"], ["vscode", "VS Code", "code"],
  ["zed", "Zed", "code"], ["xcode", "Xcode", "code"], ["ghostty", "Ghostty", "terminal"], ["terminal", "Terminal", "terminal"],
].map(([id, name, iconType]) => ({ id, name, iconType, icon: `/app-icons/${id}.png` }));
const prefs = { ...DEFAULT_APP_PREFS, onboarding_step: 99, first_time_onboarding_step: 999 };
const oc = `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES })});(${installOpenInBackend})(${JSON.stringify({ apps, initialPrefs: prefs, palette: "stone", workspaceTitle: "Ada/fix login redirect" })});`;
const mocks = {
  "/__mock/sql-wasm.js": path.join(sql, "sql-wasm.js"),
  "/__mock/sql-wasm.wasm": path.join(sql, "sql-wasm.wasm"),
  "/__mock/conductor.schema.sql": path.join(root, "evidence/sqlite/conductor.schema.sql"),
  "/__mock/cache.schema.sql": path.join(root, "evidence/sqlite/cache.schema.sql"),
};
for (const name of ["fixtures", "seed-data", "seed", "org-fixtures", "tauri-mock"]) mocks[`/__mock/${name}.js`] = path.join(root, `tools/screens/${name}.js`);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const reference = url.pathname.startsWith("/__reference/");
  let route = reference ? url.pathname.slice("/__reference".length) : url.pathname;
  const dist = reference || route.startsWith("/app-icons/") ? ref : path.join(root, "dist");
  let file = mocks[route] ?? path.join(dist, route);
  if (!file.startsWith(dist) && !mocks[route]) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) && !reference && fs.existsSync(path.join(ref, route))) file = path.join(ref, route);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) {
    let html = body.toString();
    if (reference) {
      html = html.replaceAll('src="/', 'src="/__reference/').replaceAll('href="/', 'href="/__reference/');
      const scripts = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' data: blob:"><script>window.__OC_SCENARIO__='populated';history.replaceState({},'', '/?oc_scenario=populated')</script>` +
        ["sql-wasm", "seed-data", "seed", "fixtures", "org-fixtures"].map((n) => `<script src="/__mock/${n}.js"></script>`).join("") +
        `<script>const fixture=window.__OC_FIXTURES__;window.__OC_FIXTURES__=(scenario)=>{const f=fixture(scenario);for(const cmd of ['execute_shell_command','execute_shell_command_cancellable']){const original=f[cmd];f[cmd]=(args)=>/test -f.*app-icons/.test(args.command??'')?{code:0,stdout:'${apps.map((a) => a.id).join("\\n")}\\n',stderr:''}:original(args);}return f;};</script>` +
        `<script src="/__mock/tauri-mock.js"></script><script>window.__TAURI_INTERNALS__.convertFileSrc=(p)=>'/app-icons/'+p.split('/').at(-1);</script>`;
      html = html.replace("<head>", "<head>" + scripts);
    } else {
      const seed = url.searchParams.has("home") ? oc.replace(JSON.stringify(SHELL), JSON.stringify({ ...SHELL, selection: { kind: "root" } })) : oc;
      html = html.replace("<head>", `<head><script>${seed}</script>`);
    }
    body = html;
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
}).listen(port, "0.0.0.0", () => {
  if (!process.env.OPEN_IN_VERIFY) return;
  const args = process.env.OPEN_IN_VERIFY === "capture" ? ["tools/open-in/capture.mjs"] : ["--test", "tests/e2e/open-in-switcher.e2e.mjs"];
  const child = spawn(process.execPath, args, { env: { ...process.env, OPEN_IN_BASE_URL: `http://127.0.0.1:${port}` }, stdio: "inherit" });
  child.on("exit", (code) => {
    console.log(`OPEN_IN_VERIFY_EXIT=${code}`);
    if (process.env.OPEN_IN_VERIFY === "capture" && code === 0) {
      const tests = spawn(process.execPath, ["--test", "tests/e2e/open-in-switcher.e2e.mjs"], { env: { ...process.env, OPEN_IN_BASE_URL: `http://127.0.0.1:${port}` }, stdio: "inherit" });
      tests.on("exit", (result) => console.log(`OPEN_IN_TESTS_EXIT=${result}`));
    }
  });
});
