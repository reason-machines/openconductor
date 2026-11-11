import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { outputInit } from "../../tests/e2e/script-output-fixture.mjs";

const port = Number(process.env.PORT ?? 4398);
const dist = path.resolve(process.env.DIST_OC ?? "dist");
const ref = process.env.DIST_REF && path.resolve(process.env.DIST_REF);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const mockFiles = {
  "sql-wasm.js": "tools/screens/node_modules/sql.js/dist/sql-wasm.js",
  "sql-wasm.wasm": "tools/screens/node_modules/sql.js/dist/sql-wasm.wasm",
  "conductor.schema.sql": "evidence/sqlite/conductor.schema.sql",
  "cache.schema.sql": "evidence/sqlite/cache.schema.sql",
};

export function createOutputServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/__health") return res.end("ok");
    const reference = req.headers.host.startsWith("conductor.localhost");
    let file;
    if (reference && url.pathname === "/__output-reference.js") {
      file = path.resolve("tools/terminal/output-reference.js");
    } else if (reference && url.pathname.startsWith("/__mock/")) {
      const name = path.basename(url.pathname);
      if (name === "log") { req.resume(); return res.end(); }
      file = path.resolve(mockFiles[name] ?? `tools/screens/${name}`);
    } else {
      const root = reference ? ref : dist;
      if (!root) { res.writeHead(404); return res.end(); }
      file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    }
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(file);
    if (file.endsWith("index.html")) {
      const init = reference
        ? `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' data: blob:"><script>window.__OC_SCENARIO__="populated";</script>${["sql-wasm.js", "seed-data.js", "seed.js", "fixtures.js", "org-fixtures.js", "tauri-mock.js"].map((n) => `<script src="/__mock/${n}"></script>`).join("")}<script src="/__output-reference.js"></script>`
        : `<script>${outputInit(url.searchParams.get("kind") ?? "setup", url.searchParams.has("running"), url.searchParams.get("palette"))}</script>`;
      body = body.toString().replace("<head>", `<head>${init}`);
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  createOutputServer().listen(port, "0.0.0.0", () => console.log(`Script output fixture on ${port}`));
}
