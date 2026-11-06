// Visual diff of every UI-map state that has both a Conductor reference and an
// OpenConductor capture, with REA compare-web-screenshots at channel
// thresholds 0 and 24. Also writes a side-by-side image (reference | ours |
// changed pixels at threshold 24, JPEG) per state for review.
//
//   node tools/ui-map/compare.mjs
//
// Env: UIMAP_OUT (default parity/ui-map), REA (default "rea").
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const out = resolve(process.env.UIMAP_OUT ?? join(here, "../../parity/ui-map"));
const REA = process.env.REA ?? "rea";
const tmp = process.env.TMPDIR ?? "/tmp";
const ref = JSON.parse(readFileSync(join(out, "ref-captures.json"), "utf8"));
const oc = JSON.parse(readFileSync(join(out, "oc-captures.json"), "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const artifact = (b) => ({ sha256: sha256(b), bytes: b.length, media_type: "image/png", data_base64: b.toString("base64") });
const THRESHOLDS = [0, 24];
const results = {};
const probe = spawnSync(REA, ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.error(`REA ("${REA}") is not runnable (${probe.error?.code ?? `exit ${probe.status}`}); every state would score 0. npm i -g rea-agents, or set REA=.`);
  process.exit(2);
}
let errors = 0;
mkdirSync(join(out, "diff"), { recursive: true });

for (const id of Object.keys(ref).sort()) {
  const r = ref[id];
  const o = oc[id];
  if (!r?.file || !o?.file) continue;
  const a = readFileSync(join(out, r.file));
  const b = readFileSync(join(out, o.file));
  const fa = join(tmp, `uimap-a-${id}.json`);
  const fb = join(tmp, `uimap-b-${id}.json`);
  writeFileSync(fa, JSON.stringify(artifact(a)));
  writeFileSync(fb, JSON.stringify(artifact(b)));
  const res = { reference_sha256: sha256(a), ours_sha256: sha256(b) };
  for (const t of THRESHOLDS) {
    const p = spawnSync(REA, ["compare-web-screenshots", fa, fb, "--channel-threshold", String(t), "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    try {
      const j = JSON.parse(p.stdout);
      const nr = j.normalized_result ?? j;
      res[`t${t}`] = {
        evidence_id: j.evidence_id ?? null,
        changed_pixels: nr.changed_pixels ?? nr.changedPixels ?? null,
        total_pixels: nr.total_pixels ?? nr.totalPixels ?? null,
        changed_ratio: nr.changed_ratio ?? nr.changedRatio ?? null,
        dimensions_match: nr.dimensions_match ?? null,
        raw: nr.changed_ratio === undefined ? JSON.stringify(nr).slice(0, 400) : undefined,
      };
    } catch {
      res[`t${t}`] = { error: (p.stderr || p.stdout || `exit ${p.status}`).replace(/\s+/g, " ").slice(0, 300) };
      errors++;
    }
  }
  results[id] = res;
  console.log(id.padEnd(32), THRESHOLDS.map((t) => `t${t}=${res[`t${t}`].changed_ratio ?? res[`t${t}`].error}`).join("  "));
}

// Side-by-side images (Python + Pillow, outside REA; review aid only).
const py = `
import json, sys
from PIL import Image, ImageChops
out = sys.argv[1]
ref = json.load(open(out + '/ref-captures.json')); oc = json.load(open(out + '/oc-captures.json'))
for k in sorted(ref):
    if not ref[k].get('file') or not (oc.get(k) or {}).get('file'): continue
    a = Image.open(out + '/' + ref[k]['file']).convert('RGB'); b = Image.open(out + '/' + oc[k]['file']).convert('RGB')
    if a.size != b.size: b = b.resize(a.size)
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
    mask = Image.new('RGB', a.size, (20, 20, 20)); mask.paste((255, 64, 64), mask=d)
    w, h = a.size; s = Image.new('RGB', (w * 3 // 2, h // 2))
    for i, im in enumerate((a, b, mask)): s.paste(im.resize((w // 2, h // 2)), (i * w // 2, 0))
    s.save(out + '/diff/' + k + '.jpg', quality=72, optimize=True)
`;
const p = spawnSync("python3", ["-c", py, out], { encoding: "utf8" });
if (p.status !== 0) console.error(`side-by-side images failed: ${p.stderr.slice(0, 500)}`);

writeFileSync(
  join(out, "compare.json"),
  JSON.stringify({ tool: "rea compare-web-screenshots", thresholds: THRESHOLDS, results }, null, 1) + "\n",
);
if (errors) {
  console.error(`${errors} REA comparisons failed; see the error fields in compare.json`);
  process.exit(1);
}
