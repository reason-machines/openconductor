// Screen check for the chat message list and tool rows: renders Conductor's
// "lisbon" reference turn through OpenConductor's <Transcript> (built from
// tools/chat/transcript-fixture.html) in each agent's wire shape (Claude Code,
// Codex, Reason), captures it with REA capture-browser-scenario in the same
// setup as evidence/screens (Chromium, 1440x900, scale 1, en-US, UTC, reduced
// motion), crops the chat column (x 256-1045 from y 80, where both apps draw
// the transcript) from ours and from the Conductor reference, and compares the
// crops with REA compare-web-screenshots at channel thresholds 0 and 24.
//
//   npm ci
//   TMPDIR=/tmp/t node tools/chat/transcript-parity.mjs     (Chromium needs a short TMPDIR)
//
// Writes evidence/chat/parity/{ours,ref}-*.png and parity.json. Exits 1 when a
// crop differs from its reference by more than MAX_RATIO_24 at threshold 24.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(repoRoot, "evidence/chat/parity");
const refDir = path.join(repoRoot, "evidence/screens");
const TMP = process.env.TMPDIR ?? "/tmp";
const dist = path.join(TMP, "oc-transcript-fixture");
const REA =
  process.env.REA ??
  [".npm-global/bin/rea", ".rea/node_modules/.bin/rea"].map((p) => path.join(process.env.HOME, p)).find((p) => fs.existsSync(p)) ??
  "rea";
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.PORT ?? 4396);
/** Allowed share of changed pixels (channel threshold 24) in the chat column. */
const MAX_RATIO_24 = Number(process.env.MAX_RATIO_24 ?? 0.005);
const COLUMN = { x: 256, y: 80, w: 789 };

const SHOTS = [];
for (const agent of ["claude", "codex", "reason"]) {
  SHOTS.push({ name: `transcript-collapsed--${agent}--dark`, ref: "chat--transcript-collapsed-tools--dark.png", query: `theme=dark&agent=${agent}`, h: 300 });
  SHOTS.push({ name: `transcript-collapsed--${agent}--light`, ref: "chat--transcript-collapsed-tools--light.png", query: `theme=light&agent=${agent}`, h: 300 });
  SHOTS.push({
    name: `tool-calls-expanded--${agent}--dark`,
    ref: "chat--tool-calls-expanded--dark.png",
    query: `theme=dark&agent=${agent}`,
    h: 540,
    // As the reference's REA steps did: click the summary row (it stays hovered).
    actions: [{ step_id: "expand_tools", action: "click", locator: { kind: "css", selector: ".chat-tool-summary-row" }, timeout_ms: 5000 }],
  });
}

// ---- minimal PNG decode / crop / encode (8-bit RGB or RGBA, not interlaced) ----
function decodePng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit non-interlaced PNGs");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      px[o] = line[x * bpp];
      px[o + 1] = line[x * bpp + 1];
      px[o + 2] = line[x * bpp + 2];
      px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, px };
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function encodePng({ width, height, px }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function crop(img, x, y, w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) img.px.copy(px, r * w * 4, ((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4);
  return { width: w, height: h, px };
}

// ---- REA ----------------------------------------------------------------------
function rea(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(REA, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`rea ${args[0]} exited ${code}: ${err.slice(-800)}`))));
  });
}
function findBase64(o) {
  if (!o || typeof o !== "object") return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k === "data_base64" && typeof v === "string") return v;
    const r = findBase64(v);
    if (r) return r;
  }
}
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const artifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });
function pick(n) {
  const o = {};
  for (const k of ["changed_pixels", "total_pixels", "changed_ratio", "dimensions_match", "changed_bounds"]) if (k in n) o[k] = n[k];
  if (Object.keys(o).length === 0) o.raw = JSON.stringify(n).slice(0, 600);
  return o;
}

// ---- run ----------------------------------------------------------------------
await build({ root: repoRoot, logLevel: "error", build: { outDir: dist, emptyOutDir: true, rollupOptions: { input: path.join(repoRoot, "tools/chat/transcript-fixture.html") } } });
const server = await preview({ root: repoRoot, build: { outDir: dist }, preview: { port: PORT, host: "127.0.0.1", strictPort: true }, logLevel: "error" });
fs.mkdirSync(outDir, { recursive: true });
const results = [];
let failed = 0;
try {
  for (const shot of SHOTS) {
    const input = {
      browser: { mode: "launch", executable_path: CHROMIUM, headless: true },
      start_url: { url: `http://127.0.0.1:${PORT}/tools/chat/transcript-fixture.html?${shot.query}` },
      environment: { viewport: { width: 1440, height: 900, device_scale_factor: 1 }, color_scheme: shot.query.includes("light") ? "light" : "dark", locale: "en-US", timezone: "UTC", reduced_motion: "reduce" },
      actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: 800 }, ...(shot.actions ?? []), { step_id: "final_settle", action: "wait_for_timeout", duration_ms: 400 }],
      capture: { at_end: ["screenshot"], events: ["page-errors"] },
    };
    const inputFile = path.join(TMP, `rea-transcript-${shot.name}.json`);
    fs.writeFileSync(inputFile, JSON.stringify(input));
    const ev = JSON.parse(await rea(["capture-browser-scenario", inputFile, "--format", "json"]));
    const b64 = findBase64(ev.normalized_result?.steps?.at(-1)?.artifacts?.screenshot) ?? findBase64(ev.normalized_result);
    if (!b64) throw new Error(`${shot.name}: REA returned no screenshot: ${JSON.stringify(ev).slice(0, 600)}`);
    const ours = crop(decodePng(Buffer.from(b64, "base64")), COLUMN.x, COLUMN.y, COLUMN.w, shot.h);
    const ref = crop(decodePng(fs.readFileSync(path.join(refDir, shot.ref))), COLUMN.x, COLUMN.y, COLUMN.w, shot.h);
    const oursPng = encodePng(ours);
    const refPng = encodePng(ref);
    fs.writeFileSync(path.join(outDir, `ours-${shot.name}.png`), oursPng);
    fs.writeFileSync(path.join(outDir, `ref-${shot.ref.replace(/\.png$/, "")}--h${shot.h}.png`), refPng);
    const compare = {};
    for (const t of [0, 24]) {
      const a = path.join(TMP, `rea-a-${shot.name}.json`);
      const b = path.join(TMP, `rea-b-${shot.name}.json`);
      fs.writeFileSync(a, JSON.stringify(artifact(refPng)));
      fs.writeFileSync(b, JSON.stringify(artifact(oursPng)));
      const out = JSON.parse(await rea(["compare-web-screenshots", a, b, "--channel-threshold", String(t), "--format", "json"]));
      compare[`threshold_${t}`] = { evidence_id: out.evidence_id, ...pick(out.normalized_result ?? out) };
    }
    const ratio = compare.threshold_24.changed_ratio;
    const ok = typeof ratio === "number" && ratio <= MAX_RATIO_24;
    if (!ok) failed++;
    const pageErrors = JSON.stringify(ev.normalized_result?.events ?? []).split('"page-error').length - 1;
    results.push({ name: shot.name, reference: `evidence/screens/${shot.ref}`, crop: { ...COLUMN, h: shot.h }, ours_sha256: sha256(oursPng), capture_evidence_id: ev.evidence_id, page_errors: pageErrors, compare, pass: ok });
    console.log(`${ok ? "ok  " : "FAIL"} ${shot.name} changed@0 ${compare.threshold_0.changed_ratio} changed@24 ${ratio}`);
  }
} finally {
  await new Promise((r) => server.httpServer.close(r));
}
fs.writeFileSync(
  path.join(outDir, "parity.json"),
  JSON.stringify({ tool: "rea-agents: capture-browser-scenario + compare-web-screenshots", browser: "Chromium headless, 1440x900, scale 1, en-US, UTC", column: COLUMN, max_ratio_24: MAX_RATIO_24, results }, null, 2) + "\n",
);
process.exit(failed ? 1 : 0);
