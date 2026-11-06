"""Crop the two REA captures without palette or geometry normalization."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else "evidence/terminal/output")
images = []
for name in ("reference", "openconductor"):
    image = Image.open(out / f"{name}.png").convert("RGB").crop((939, 410, 1280, 820))
    image.save(out / f"{name}-panel.png")
    images.append(image)
canvas = Image.new("RGB", (706, 450), "#202020")
draw = ImageDraw.Draw(canvas)
for x, label, image in zip((8, 357), ("Conductor 0.87.6", os.environ.get("OC_LABEL", "OpenConductor #719")), images):
    draw.text((x, 10), label, fill="#ffffff")
    canvas.paste(image, (x, 32))
canvas.save(out / "side-by-side.png")

comparison = {}
with tempfile.TemporaryDirectory() as temp:
    artifacts = []
    for name in ("reference", "openconductor"):
        data = (out / f"{name}-panel.png").read_bytes()
        artifact = Path(temp) / f"{name}.json"
        artifact.write_text(json.dumps({"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "media_type": "image/png", "data_base64": base64.b64encode(data).decode()}))
        artifacts.append(str(artifact))
    for threshold, key in ((0, "exact"), (24, "channel24")):
        result = subprocess.run([os.environ.get("REA", "rea"), "compare-web-screenshots", *artifacts, "--channel-threshold", str(threshold), "--format", "json"], check=True, capture_output=True, text=True)
        evidence = json.loads(result.stdout)
        comparison[key] = {"evidence_id": evidence["evidence_id"], "parameters": evidence["parameters"], "result": evidence["normalized_result"]}
(out / "compare.json").write_text(json.dumps(comparison, indent=2) + "\n")
