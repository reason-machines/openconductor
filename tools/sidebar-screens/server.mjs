// Static server for a Vite build that injects seed.js before the app's own
// scripts. PORT (default 4327), DIST (default <repo>/dist).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.DIST ?? path.join(here, "../../dist"));
const seed = fs.readFileSync(path.join(here, "seed.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__health") return res.end("ok");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    let body = fs.readFileSync(file);
    if (file.endsWith("index.html")) body = body.toString().replace("<head>", `<head><script>${seed}</script>`);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  })
  .listen(Number(process.env.PORT ?? 4327));
