// Builds parity/side-by-side/chat-diff-pr/animations/<id>.png: one row per
// build (Conductor, OpenConductor before, OpenConductor after), eight frames per
// row taken with the page's animations slowed 10x (probe.mjs STRIP=1), so the
// first ~five frames span the real 100 ms (popups) or 400 ms (toasts).
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PW ?? "playwright-core");
const [stripRoot, outDir, ...ids] = process.argv.slice(2);
const rows = [["conductor", "Conductor 0.87.6"], ["before", "OpenConductor, main"], ["after", "OpenConductor, this PR"]];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const p = await b.newPage({ deviceScaleFactor: 1 });
fs.mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  const img = (dir, i) => {
    const sub = dir === "conductor" ? "conductor" : "oc";
    const f = path.join(stripRoot, dir, sub, `${id}-${i}.png`);
    return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` : "";
  };
  const html = `<body style="margin:0;background:#111;color:#ddd;font:13px system-ui">${rows
    .map(([dir, label]) => `<div style="padding:6px 8px">${label}</div><div style="display:flex;gap:4px;padding:0 8px 8px">${[...Array(8).keys()]
      .map((i) => `<div><img src="${img(dir, i)}" style="display:block;width:200px;border:1px solid #333"><div style="font-size:11px;color:#888">frame ${i}</div></div>`)
      .join("")}</div>`)
    .join("")}</body>`;
  await p.setContent(html);
  await p.waitForTimeout(300);
  const box = await p.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
  await p.setViewportSize(box);
  await p.screenshot({ path: path.join(outDir, `${id}.png`), fullPage: true });
}
await b.close();
