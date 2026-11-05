// Serves Conductor's extracted frontend (dist) with a mocked Tauri IPC layer,
// so REA can drive and screenshot each screen in plain Chromium.
//
//   DIST=../../.rea-work/dist PORT=4317 node server.mjs
//
// "/" and unknown paths (SPA routes) return index.html with three scripts
// inserted before the first module script: sql.js, the scenario fixtures and
// the Tauri mock. ?oc_scenario=<name> picks the scenario (default "signed-in").
// The dist folder is third-party code and never lives in this repository.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const DIST = path.resolve(process.env.DIST ?? path.join(repoRoot, ".rea-work/dist"));
const PORT = Number(process.env.PORT ?? 4317);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".sql": "text/plain; charset=utf-8",
};

const MOCK_FILES = {
  "/__mock/sql-wasm.js": path.join(here, "node_modules/sql.js/dist/sql-wasm.js"),
  "/__mock/sql-wasm.wasm": path.join(here, "node_modules/sql.js/dist/sql-wasm.wasm"),
  "/__mock/fixtures.js": path.join(here, "fixtures.js"),
  "/__mock/seed-data.js": path.join(here, "seed-data.js"),
  "/__mock/seed.js": path.join(here, "seed.js"),
  "/__mock/tauri-mock.js": path.join(here, "tauri-mock.js"),
  "/__mock/conductor.schema.sql": path.join(repoRoot, "evidence/sqlite/conductor.schema.sql"),
  "/__mock/cache.schema.sql": path.join(repoRoot, "evidence/sqlite/cache.schema.sql"),
};

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function indexHtml(scenario) {
  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  // CSP keeps the page off the network: Conductor's Sentry, PostHog and CDN
  // requests are refused before they leave the browser.
  const inject =
    `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' data: blob:">\n` +
    `<script>window.__OC_SCENARIO__=${JSON.stringify(scenario)};</script>\n` +
    `<script src="/__mock/sql-wasm.js"></script>\n` +
    `<script src="/__mock/seed-data.js"></script>\n` +
    `<script src="/__mock/seed.js"></script>\n` +
    `<script src="/__mock/fixtures.js"></script>\n` +
    `<script src="/__mock/tauri-mock.js"></script>\n`;
  const marker = html.indexOf('<script type="module"');
  return marker === -1 ? html.replace("</head>", inject + "</head>") : html.slice(0, marker) + inject + html.slice(marker);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  if (MOCK_FILES[p]) {
    return send(res, 200, MIME[path.extname(p)] ?? "application/octet-stream", fs.readFileSync(MOCK_FILES[p]));
  }
  if (p === "/__health") return send(res, 200, "text/plain", "ok");
  if (p === "/__mock/log" && req.method === "POST") {
    // The mock posts its IPC log here; LOG_DIR keeps one file per scenario.
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (process.env.LOG_DIR) {
        const name = (url.searchParams.get("scenario") ?? "unknown").replace(/[^a-z0-9._-]/gi, "_");
        fs.mkdirSync(process.env.LOG_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.LOG_DIR, `ipc-${name}.json`), body);
      }
      send(res, 204, "text/plain", "");
    });
    return;
  }
  const file = path.join(DIST, p);
  if (file.startsWith(DIST) && p !== "/" && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(res, 200, MIME[path.extname(file)] ?? "application/octet-stream", fs.readFileSync(file));
  }
  // Missing static asset: 404. Anything else is an SPA route.
  if (path.extname(p) && p !== "/") return send(res, 404, "text/plain", "not found");
  const scenario = url.searchParams.get("oc_scenario") ?? "signed-in";
  return send(res, 200, MIME[".html"], indexHtml(scenario));
});

server.listen(PORT, "127.0.0.1", () => console.log(`screens harness on http://localhost:${PORT} (dist ${DIST})`));
