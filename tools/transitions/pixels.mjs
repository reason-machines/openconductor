// Click-to-pixels from a timing.mjs run recorded with FILM=<dir>: for each filmed
// step, the time from the input to the first screen frame that differs from the
// frame before it (first paint) and to the last one that still changes within 1 s
// (settled), read from the Xvfb recording, so it includes WebKit's paint and the
// X server, which the in-page frame log (contentMs) does not.
//
//   node tools/transitions/pixels.mjs <timing.json> [--crop x,y,w,h] > pixels.json
//
// Frames are compared at 1/4 size in grayscale; a frame "changes" when its mean
// absolute difference to the previous frame is above 0.05 grey levels. A caret
// blink or spinner in the crop counts as a change: crop it out.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const file = process.argv[2];
const cropArg = process.argv.indexOf("--crop");
const crop = cropArg > 0 ? process.argv[cropArg + 1].split(",").map(Number) : null;
const data = JSON.parse(readFileSync(file, "utf8"));
const launch = data.launches[0];
const video = launch.film?.file;
if (!video) throw new Error(`${file}: no FILM recording`);
const [W, H] = (data.size ?? "1440x900").split("x").map(Number);
const cw = Math.round((crop ? crop[2] : W) / 4), ch = Math.round((crop ? crop[3] : H) / 4);

function frames(t0, t1) {
  const sel = `select='between(t\\,${t0}\\,${t1})'`;
  const cropF = crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]},` : "";
  const ts = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", `${t0 - 0.2}%${t1 + 0.2}`, "-show_entries", "frame=pts_time", "-of", "csv=p=0", video])
    .toString().split(/\s+/).filter(Boolean).map(Number).filter((t) => t >= t0 && t <= t1);
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-copyts", "-i", video, "-vf", `${sel},${cropF}scale=${cw}:${ch},format=gray`, "-vsync", "0", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const n = Math.min(ts.length, Math.floor(raw.length / (cw * ch)));
  return Array.from({ length: n }, (_, i) => ({ t: ts[i], px: raw.subarray(i * cw * ch, (i + 1) * cw * ch) }));
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const out = [];
for (const r of launch.results) {
  if (!r.inputWall) continue;
  const t = r.inputWall / 1000;
  const fs = frames(t - 0.05, t + 1.0);
  let first = null, last = null;
  for (let i = 1; i < fs.length; i++) {
    if (fs[i].t < t) continue;
    if (diff(fs[i].px, fs[i - 1].px) > 0.05) {
      first ??= fs[i].t - t;
      last = fs[i].t - t;
    }
  }
  const ms = (x) => (x === null ? null : Math.round(x * 1000));
  out.push({ id: r.id, temp: r.temp, pass: r.pass, contentMs: r.contentMs, firstPaintMs: ms(first), settledPaintMs: ms(last), frames: fs.length });
  console.error(`${r.temp} ${r.id}: dom ${r.contentMs} ms, first paint ${ms(first)} ms, settled ${ms(last)} ms (${fs.length} frames)`);
}
console.log(JSON.stringify(out, null, 1));
