#!/usr/bin/env python3
"""Compare OpenConductor sidebar captures with the Conductor references.

For each shot in shots.json: REA compare-web-screenshots on the whole frame
(threshold 24, the verifier's setting in PR #66), plus the sidebar region
(x < 256) computed with Pillow, because REA's compare has no region or mask
option. Prints one table row per shot, or JSON with --json.

  python3 tools/sidebar-screens/compare.py [OURS_DIR] [--json]

OURS_DIR defaults to .oc-tmp/sidebar-screens (output of capture.mjs).
"""
import base64, hashlib, json, os, subprocess, sys, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REF = os.path.join(ROOT, "evidence/screens")
REA = os.environ.get("REA", os.path.expanduser("~/.npm-global/bin/rea"))
THRESH = 24
SIDEBAR_W = 256


def artifact(path, tmp):
    b = open(path, "rb").read()
    out = os.path.join(tmp, hashlib.sha256(path.encode()).hexdigest()[:12] + ".json")
    json.dump({"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "media_type": "image/png", "data_base64": base64.b64encode(b).decode()}, open(out, "w"))
    return out


def rea_compare(ref, ours, tmp):
    res = subprocess.run([REA, "compare-web-screenshots", artifact(ref, tmp), artifact(ours, tmp), "--channel-threshold", str(THRESH), "--format", "json"],
                         capture_output=True, text=True, env={**os.environ, "NODE_NO_WARNINGS": "1"})
    ev = json.loads(res.stdout)
    return ev["evidence_id"], ev["normalized_result"]["changed_ratio"]


def region_ratio(ref, ours, box):
    a = Image.open(ref).convert("RGB").crop(box)
    b = Image.open(ours).convert("RGB").crop(box)
    pa, pb = a.load(), b.load()
    changed = sum(1 for y in range(a.height) for x in range(a.width) if max(abs(p - q) for p, q in zip(pa[x, y], pb[x, y])) > THRESH)
    return changed / (a.width * a.height)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ours_dir = os.path.abspath(args[0] if args else os.path.join(ROOT, ".oc-tmp/sidebar-screens"))
    shots = json.load(open(os.path.join(HERE, "shots.json")))
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for s in shots:
            ref, ours = os.path.join(REF, s["name"] + ".png"), os.path.join(ours_dir, s["name"] + ".png")
            if not os.path.exists(ours):
                continue
            ev, whole = rea_compare(ref, ours, tmp)
            side = region_ratio(ref, ours, (0, 0, SIDEBAR_W, 900))
            rows.append({"shot": s["name"], "whole_changed": round(whole, 4), "sidebar_changed": round(side, 4), "rea_evidence": ev})
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2))
    else:
        print("| Shot | Whole frame (REA, t=24) | Sidebar x<256 (t=24) | REA Evidence |\n|---|---|---|---|")
        for r in rows:
            print(f"| {r['shot']} | {r['whole_changed']*100:.2f}% | {r['sidebar_changed']*100:.2f}% | `{r['rea_evidence'][:14]}…` |")


if __name__ == "__main__":
    main()
