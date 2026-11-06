"""Compare identical, unshifted crops with REA and retain the raw inputs and side-by-side images."""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("captures", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
rea = os.environ.get("REA", "/home/runner/rea/node_modules/.bin/rea")
regions = {
    "home": ("home", (256, 0, 1280, 820)),
    "cards-footer": ("home", (440, 376, 1096, 600)),
    "sidebar": ("repo-menu", (0, 0, 256, 820)),
    "repo-menu": ("repo-menu", (45, 247, 214, 426)),
}
results = []
with tempfile.TemporaryDirectory() as temp:
    for theme in ["dark", "light"]:
        suffix = "" if theme == "dark" else "-light"
        for region, (state, box) in regions.items():
            crops = []
            artifacts = []
            for side in ["ref", "oc"]:
                source = args.captures / f"{side}-{state}{suffix}.png"
                crop = Image.open(source).convert("RGB").crop(box)
                png = Path(temp) / f"{side}-{region}-{theme}.png"
                crop.save(png)
                data = png.read_bytes()
                artifact = png.with_suffix(".json")
                artifact.write_text(json.dumps({"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "media_type": "image/png", "data_base64": base64.b64encode(data).decode()}))
                artifacts.append(str(artifact))
                crops.append(crop)
            pair = Image.new("RGB", (crops[0].width * 2 + 8, crops[0].height + 28), (60, 60, 60))
            for i, (crop, label) in enumerate(zip(crops, ["Conductor 0.87.6 extracted frontend (mocked IPC)", "OpenConductor (mocked IPC)"])):
                x = i * (crop.width + 8)
                pair.paste(crop, (x, 28))
                ImageDraw.Draw(pair).text((x + 8, 8), label, fill=(255, 255, 255))
            pair.save(args.output / f"{region}-{theme}.png", optimize=True)
            for threshold in [0, 24]:
                run = subprocess.run([rea, "compare-web-screenshots", *artifacts, "--channel-threshold", str(threshold), "--format", "json"], capture_output=True, text=True, check=True)
                evidence = json.loads(run.stdout)
                result = evidence["normalized_result"]
                results.append({"region": region, "theme": theme, "crop": box, "threshold": threshold, "evidence_id": evidence["evidence_id"], "changed_ratio": result["changed_ratio"]})
(args.output / "comparisons.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
