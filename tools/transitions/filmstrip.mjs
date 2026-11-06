// Filmstrips from a timing.mjs run recorded with FILM=<dir>: for each step of the
// first launch's cold pass, the screen at fixed times after the input, side by
// side, labelled with the ms. Two runs (before / after) stack into one image.
//
//   node tools/transitions/filmstrip.mjs <out.png> <step id> <label>=<timing.json> [<label>=<timing.json>]
//
// Env: TIMES (ms after the input, default 0,16,33,50,100,150,250,400), CROP
// (ffmpeg crop expression, default the whole window), SCALE (default 0.3),
// PASS (default 0, the cold pass).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outFile, stepId, ...runs] = process.argv.slice(2);
const TIMES = (process.env.TIMES ?? "0,16,33,50,100,150,250,400").split(",").map(Number);
const SCALE = Number(process.env.SCALE ?? 0.3);
const PASS = Number(process.env.PASS ?? 0);
const tmp = mkdtempSync(join(tmpdir(), "strip-"));
const ff = (...a) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
const rows = [];
for (const [i, spec] of runs.entries()) {
  const [label, file] = spec.split("=");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const launch = data.launches[0];
  const step = launch.results.find((r) => r.id === stepId && r.pass === PASS);
  if (!step?.inputWall || !launch.film) throw new Error(`${file}: no filmed ${stepId}`);
  // Frame times in the recording are wall-clock seconds (timing.mjs records with -copyts).
  const tiles = TIMES.map((t, j) => {
    const at = (step.inputWall + t) / 1000;
    const tile = join(tmp, `${i}-${j}.png`);
    const crop = process.env.CROP ? `crop=${process.env.CROP},` : "";
    ff("-copyts", "-i", launch.film.file, "-vf", `select='gte(t\\,${at})',${crop}scale=iw*${SCALE}:-1,pad=iw+6:ih+26:3:26:color=0x202020,drawtext=text='${t} ms':x=6:y=5:fontcolor=white:fontsize=15`, "-frames:v", "1", tile);
    return tile;
  });
  const row = join(tmp, `row-${i}.png`);
  ff(...tiles.flatMap((t) => ["-i", t]), "-filter_complex", `${tiles.map((_, j) => `[${j}]`).join("")}hstack=${tiles.length},pad=iw+170:ih:170:0:color=0x202020,drawtext=text='${label}':x=8:y=(h-th)/2:fontcolor=white:fontsize=17`, row);
  rows.push(row);
}
if (rows.length === 1) ff("-i", rows[0], outFile);
else ff(...rows.flatMap((r) => ["-i", r]), "-filter_complex", `${rows.map((_, j) => `[${j}]`).join("")}vstack=${rows.length}`, outFile);
console.log(outFile);
