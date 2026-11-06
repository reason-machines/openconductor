// One preview listener serves the isolated OpenConductor fixture at localhost
// and the read-only Conductor frontend at 127.0.0.1 on the same port.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "vite";

const port = Number(process.env.PORT ?? 4392);
const dist = path.resolve(process.env.DIST_REF ?? ".rea-work/dist");
const baselineFiles = new Set(["RenameWorkspaceDialog", "CloneGitHubRepoDialog", "CreateProjectDialog", "ArchiveRunningDialog", "RemoveRepositoryDialog", "RestoreWorkspaceDialog"].map((name) => `src/components/${name}.tsx`));
const vite = await createServer({
  server: { middlewareMode: true }, appType: "spa",
  plugins: process.env.BASELINE_REF ? [{
    name: "isolated-dialog-baseline", enforce: "pre",
    transform(_code, id) {
      const relative = path.relative(process.cwd(), id.split("?")[0]);
      if (!baselineFiles.has(relative)) return;
      const result = spawnSync("git", ["show", `${process.env.BASELINE_REF}:${relative}`], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    },
  }] : [],
});
const mocks = {
  "sql-wasm.js": "tools/screens/node_modules/sql.js/dist/sql-wasm.js",
  "sql-wasm.wasm": "tools/screens/node_modules/sql.js/dist/sql-wasm.wasm",
  "conductor.schema.sql": "evidence/sqlite/conductor.schema.sql",
  "cache.schema.sql": "evidence/sqlite/cache.schema.sql",
};
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  if (!req.headers.host?.startsWith("127.0.0.1:")) return vite.middlewares(req, res);
  const url = new URL(req.url, "http://127.0.0.1");
  const name = decodeURIComponent(url.pathname);
  if (name === "/__mock/log") { res.writeHead(204); return res.end(); }
  const mock = name.startsWith("/__mock/") ? name.slice(8) : null;
  let file = mock ? path.resolve(mocks[mock] ?? `tools/screens/${mock}`) : path.join(dist, name);
  if ((!mock && !file.startsWith(`${dist}/`)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  let body = fs.readFileSync(file);
  if (file.endsWith("index.html")) {
    const scenario = url.searchParams.get("oc_scenario") ?? "populated";
    const inject = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' data: blob:"><script>window.__OC_SCENARIO__=${JSON.stringify(scenario)};</script>` +
      ["sql-wasm.js", "seed-data.js", "seed.js", "fixtures.js", "org-fixtures.js", "tauri-mock.js"].map((name) => `<script src="/__mock/${name}"></script>`).join("");
    body = body.toString().replace('<script type="module"', `${inject}<script type="module"`);
  }
  res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
});
function captureDialogs() {
  const captureLog = fs.openSync(process.env.CAPTURE_LOG ?? ".dialog-capture.log", "w");
  const capture = spawn(process.execPath, ["tools/dialogs/capture.mjs"], { env: process.env, stdio: ["ignore", captureLog, captureLog] });
  capture.on("exit", (result) => { fs.closeSync(captureLog); console.log(`Dialog captures exited ${result}`); });
}
server.listen(port, "0.0.0.0", () => {
  console.log(`Dialog preview listening on ${port}`);
  if (process.argv.includes("--capture-only")) captureDialogs();
  if (process.argv.includes("--check")) {
    const log = fs.openSync(process.env.CHECK_LOG ?? ".dialog-check.log", "w");
    const child = spawn(process.execPath, ["--test", "tests/e2e/dialogs.e2e.mjs"], { env: { ...process.env, DIALOGS_URL: `http://localhost:${port}` }, stdio: ["ignore", log, log] });
    child.on("exit", (code) => {
      fs.closeSync(log);
      console.log(`Dialog checks exited ${code}`);
      if (code === 0 && process.argv.includes("--capture")) captureDialogs();
    });
  }
});
