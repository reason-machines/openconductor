#!/usr/bin/env python3
"""Compare OpenConductor's Settings › Agents and Default models in the built
app with the Conductor references.

For each pair: REA compare-web-screenshots on the whole 1440x900 frame
(threshold 24, as tools/sidebar-screens/compare.py), and, with Pillow, the
share of matching pixels in the page content column only (the settings
navigation and the page header are the settings shell's, not these pages').
REA's compare has no region option, so the column figure is computed here.
Also writes <OURS>/cmp-<name>.png: Conductor left, OpenConductor right.

  python3 tools/agents-screens/compare.py [OURS_DIR] [--json]
"""
import base64, hashlib, json, os, subprocess, sys, tempfile
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REA = os.environ.get("REA", os.path.expanduser("~/.npm-global/bin/rea"))
THRESH = 24
# Reference file per state: evidence/screens (README table) or the agents set.
NAMES = [
    "settings--agents--dark",
    "settings--agents-claude-apikey--dark",
    "settings--agents-codex--dark",
    "settings--agents-codex-apikey--dark",
    "settings--agents-cursor--dark",
    "settings--agents-opencode--dark",
    "settings--default-models--dark",
]
# Content column, below each app's page title: Conductor x 296..1192 from the
# tab row (y 115); OpenConductor's settings shell puts it at x 260 (y 78).
REF_BOX = (296, 115, 296 + 680, 115 + 520)
OURS_BOX = (260, 78, 260 + 680, 78 + 520)


def artifact(path, tmp):
    b = open(path, "rb").read()
    out = os.path.join(tmp, hashlib.sha256(path.encode()).hexdigest()[:12] + ".json")
    json.dump({"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "media_type": "image/png", "data_base64": base64.b64encode(b).decode()}, open(out, "w"))
    return out


def rea_compare(a, b, tmp):
    res = subprocess.run([REA, "compare-web-screenshots", artifact(a, tmp), artifact(b, tmp), "--channel-threshold", str(THRESH), "--format", "json"], capture_output=True, text=True, env={**os.environ, "NODE_NO_WARNINGS": "1"})
    try:
        d = json.loads(res.stdout)
    except json.JSONDecodeError:
        return {"error": (res.stderr or res.stdout)[:300]}
    if "normalized_result" not in d:
        return {"error": str(d)[:300]}
    return {"evidence_id": d.get("evidence_id"), "changed_ratio": d["normalized_result"].get("changed_ratio")}


def column_match(a, b):
    ca = Image.open(a).convert("RGB").crop(REF_BOX)
    cb = Image.open(b).convert("RGB").crop(OURS_BOX)
    diff = ImageChops.difference(ca, cb).convert("L").point(lambda v: 255 if v > THRESH else 0)
    changed = sum(1 for v in diff.tobytes() if v)
    return 1 - changed / (ca.width * ca.height)


def side_by_side(a, b, out):
    ca = Image.open(a).convert("RGB").crop((256, 60, 1240, 620))
    cb = Image.open(b).convert("RGB").crop((220, 23, 1204, 583))
    img = Image.new("RGB", (984 * 2 + 8, 560), (200, 40, 40))
    img.paste(ca, (0, 0))
    img.paste(cb, (992, 0))
    img.save(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ours = os.path.abspath(args[0] if args else os.path.join(ROOT, ".oc-tmp/agents-built"))
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for n in NAMES:
            ref = os.path.join(ROOT, "evidence/screens", n + ".png")
            if not os.path.exists(ref):
                ref = os.path.join(ROOT, "evidence/settings/agents-screens/conductor", n + ".png")
            mine = os.path.join(ours, n + ".png")
            if not (os.path.exists(ref) and os.path.exists(mine)):
                rows.append({"name": n, "missing": [p for p in (ref, mine) if not os.path.exists(p)]})
                continue
            side_by_side(ref, mine, os.path.join(ours, f"cmp-{n}.png"))
            rows.append({"name": n, "rea_whole_frame": rea_compare(ref, mine, tmp), "content_column_match": round(column_match(ref, mine), 4)})
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2))
        return
    print("| State | REA whole-frame changed | Content column match |")
    print("|---|---|---|")
    for r in rows:
        if "missing" in r:
            print(f"| {r['name']} | missing | missing |")
            continue
        w = r["rea_whole_frame"]
        ratio = w.get("changed_ratio")
        shown = f"{ratio:.1%}" if isinstance(ratio, (int, float)) else w
        print(f"| {r['name']} | {shown} | {r['content_column_match']:.1%} |")


if __name__ == "__main__":
    main()
