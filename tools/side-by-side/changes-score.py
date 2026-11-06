"""Score the same Changes panel rectangle in REA's 1280x820 captures."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw

before, after, output = map(Path, sys.argv[1:4])
output.mkdir(parents=True, exist_ok=True)
rea = os.environ.get("REA", "rea")
box = (938, 40, 1280, 410)
report = {"rectangle": {"x": 938, "y": 40, "width": 342, "height": 370}, "channel_threshold": 24, "states": {}}


def artifact(image, name):
    png = output / f"{name}.png"
    image.save(png)
    data = png.read_bytes()
    payload = {"media_type": "image/png", "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "data_base64": base64.b64encode(data).decode()}
    target = output / f"{name}.json"
    target.write_text(json.dumps(payload))
    return target


def compare(reference, ours):
    result = subprocess.run([rea, "compare-web-screenshots", str(reference), str(ours), "--channel-threshold", "24", "--format", "json"], check=True, capture_output=True, text=True)
    evidence = json.loads(result.stdout)
    data = evidence.get("normalized_result", evidence)
    return {"evidence_id": evidence.get("evidence_id"), **{key: data[key] for key in ("changed_pixels", "compared_pixels", "changed_ratio")}}


for state in ("flat", "tree", "collapsed", "options"):
    ref = Image.open(after / f"ref-{state}.png").crop(box)
    oc = Image.open(after / f"oc-{state}.png").crop(box)
    ref_artifact = artifact(ref, f"ref-panel-{state}")
    oc_artifact = artifact(oc, f"oc-panel-{state}")
    scored = {"after": compare(ref_artifact, oc_artifact)}
    if state == "flat":
        old_ref = artifact(Image.open(before / "ref-flat.png").crop(box), "ref-panel-before")
        old_oc = artifact(Image.open(before / "oc-flat.png").crop(box), "oc-panel-before")
        scored["before"] = compare(old_ref, old_oc)
    report["states"][state] = scored
    pair = Image.new("RGB", (692, 398), "white")
    draw = ImageDraw.Draw(pair)
    draw.text((8, 8), "Conductor 0.87.6", fill="black")
    draw.text((358, 8), "OpenConductor", fill="black")
    pair.paste(ref.convert("RGB"), (0, 28))
    pair.paste(oc.convert("RGB"), (350, 28))
    pair.save(output / f"changes-panel-{state}.png")
    print(state, json.dumps(scored))
(output / "panel-report.json").write_text(json.dumps(report, indent=2) + "\n")
